#!/usr/bin/env node
import { Command } from 'commander';
import csv from 'csvtojson';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { DEFAULTS } from './src/constants.js';
import { authenticateADC, authenticateDirectOAuth, authenticateServiceAccount } from './src/auth.js';
import { inspectUrl } from './src/api.js';
import { RateLimiter } from './src/rate-limiter.js';
import { validateCsv } from './src/validator.js';
import { loadCheckpoint, saveCheckpoint, clearCheckpoint } from './src/checkpoint.js';
import { generateSummary } from './src/formatter.js';
import { ensureOutputDir, appendResults, writeResults } from './src/output.js';

const program = new Command();

program
  .name('gsc-inspect')
  .description('Bulk-check URL indexing status via the Google Search Console URL Inspection API')
  .version('0.1.0')
  .option('--input <file>', 'Input CSV file path', DEFAULTS.inputFile)
  .option('--output <dir>', 'Output directory', DEFAULTS.outputDir)
  .option('--batch-size <n>', 'Batch size for parallel requests', parseInt, DEFAULTS.batchSize)
  .option('--delay <ms>', 'Delay between batches in milliseconds', parseInt, DEFAULTS.delayMs)
  .option('--max-retries <n>', 'Maximum retry attempts per request', parseInt, DEFAULTS.maxRetries)
  .option('--service-account <file>', 'Service account JSON key file (instead of OAuth)')
  .option('--credentials <file>', 'OAuth credentials JSON file', 'client-secret.json')
  .option('--language <code>', 'Language code for inspection', DEFAULTS.language)
  .option('--dry-run', 'Validate input and show quota estimate only')
  .option('--resume', 'Resume from checkpoint')
  .option('--filter-verdict <verdict>', 'Filter output by verdict (PASS, FAIL, NEUTRAL)')
  .option('--only-not-indexed', 'Only include non-indexed URLs in output');

program.parse();
const opts = program.opts();

async function main() {
  const startTime = Date.now();

  console.log(chalk.bold('\n  GSC URL Inspection Tool\n'));

  // 1. Read CSV input
  console.log(chalk.cyan('Reading'), opts.input + '...');
  let rows;
  try {
    rows = await csv().fromFile(opts.input);
  } catch (err) {
    console.error(chalk.red('Error:'), `Failed to read input file: ${err.message}`);
    process.exit(1);
  }

  // 2. Validate input
  const { valid, invalid } = validateCsv(rows);
  if (invalid.length > 0) {
    console.warn(chalk.yellow(`\n  Found ${invalid.length} invalid row(s):`));
    for (const inv of invalid.slice(0, 10)) {
      const reasons = inv.reasons ? inv.reasons.join('; ') : inv.reason;
      console.warn(chalk.yellow(`    Row ${inv.row}:`), reasons);
    }
    if (invalid.length > 10) {
      console.warn(chalk.yellow(`    ... and ${invalid.length - 10} more`));
    }
  }

  if (valid.length === 0) {
    console.error(chalk.red('Error:'), 'No valid URLs to process. Exiting.');
    process.exit(1);
  }

  // Group URLs by property for quota estimate
  const byProperty = {};
  for (const row of valid) {
    if (!byProperty[row.property]) byProperty[row.property] = [];
    byProperty[row.property].push(row);
  }

  console.log(chalk.green(`\n  ${valid.length} valid URL(s)`), `across ${Object.keys(byProperty).length} property/properties:\n`);
  for (const [prop, urls] of Object.entries(byProperty)) {
    console.log(`    ${chalk.dim(prop)}  ${chalk.bold(urls.length)} URL(s)`);
  }
  console.log(chalk.dim(`\n  Quota estimate: ${valid.length} requests (daily limit: 2,000/property)`));

  // 3. Dry run — stop here
  if (opts.dryRun) {
    console.log(chalk.yellow('\n  --dry-run flag set. Exiting without making API calls.\n'));
    process.exit(0);
  }

  // 4. Authenticate (service account > ADC > OAuth)
  console.log(chalk.cyan('\n  Authenticating...'));
  let authClient;
  try {
    if (opts.serviceAccount) {
      authClient = await authenticateServiceAccount(opts.serviceAccount);
      console.log(chalk.green('  Authenticated via service account.'));
    } else {
      try {
        authClient = await authenticateADC();
        console.log(chalk.green('  Authenticated via Application Default Credentials.'));
      } catch {
        console.log(chalk.dim('  ADC not available, falling back to OAuth...'));
        authClient = await authenticateDirectOAuth(opts.credentials);
        console.log(chalk.green('  Authenticated via OAuth.'));
      }
    }
  } catch (err) {
    console.error(chalk.red('\n  Authentication failed:'), err.message);
    console.error(chalk.dim('  Options:'));
    console.error(chalk.dim('    1. Use --service-account <key.json> for service account auth'));
    console.error(chalk.dim('    2. Set up ADC: gcloud auth application-default login --scopes=...'));
    console.error(chalk.dim('    3. Place a client-secret.json in this directory for OAuth'));
    process.exit(1);
  }

  // 5. Load checkpoint if resuming
  await ensureOutputDir(opts.output);
  let processedUrls = new Set();
  if (opts.resume) {
    processedUrls = await loadCheckpoint(opts.output);
  }

  // Filter out already-processed URLs
  let urlsToProcess = valid.filter((row) => !processedUrls.has(row.url));
  if (opts.resume && urlsToProcess.length < valid.length) {
    console.log(chalk.dim(`  Skipping ${valid.length - urlsToProcess.length} already-processed URL(s).`));
  }

  if (urlsToProcess.length === 0) {
    console.log(chalk.green('  All URLs already processed. Nothing to do.\n'));
    process.exit(0);
  }

  // 6. Process batches
  const rateLimiter = new RateLimiter();
  const results = [];
  const errors = [];
  const totalBatches = Math.ceil(urlsToProcess.length / opts.batchSize);

  console.log('');
  const progressBar = new cliProgress.SingleBar(
    {
      format: `  ${chalk.cyan('{bar}')} ${chalk.bold('{percentage}%')} | {value}/{total} URLs | Batch {batch}/{totalBatches}`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
    },
    cliProgress.Presets.shades_classic
  );
  progressBar.start(urlsToProcess.length, 0, { batch: 0, totalBatches });

  let processed = 0;

  // Register graceful shutdown
  let interrupted = false;
  const shutdown = async () => {
    if (interrupted) return;
    interrupted = true;
    progressBar.stop();
    console.log(chalk.yellow('\n\n  Interrupted! Saving checkpoint...'));
    await saveCheckpoint(opts.output, processedUrls);
    if (results.length > 0) {
      await writeResults(opts.output, results, errors, {
        filterVerdict: opts.filterVerdict,
        onlyNotIndexed: opts.onlyNotIndexed,
      });
    }
    printSummary(results, errors, startTime);
    console.log(chalk.dim('  Checkpoint saved. Use --resume to continue.\n'));
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * opts.batchSize;
    const chunk = urlsToProcess.slice(start, start + opts.batchSize);

    progressBar.update(processed, { batch: batchIndex + 1, totalBatches });

    // Process each URL in the batch with rate limiting
    const batchPromises = chunk.map(async ({ url, property }) => {
      await rateLimiter.acquire(property);
      try {
        const data = await inspectUrl(url, property, authClient, {
          languageCode: opts.language,
          maxRetries: opts.maxRetries,
        });
        data.url = url;
        return { status: 'fulfilled', value: data };
      } catch (error) {
        return { status: 'rejected', reason: error };
      }
    });

    const batchResults = await Promise.all(batchPromises);

    const batchSuccesses = [];
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
        batchSuccesses.push(result.value);
        processedUrls.add(result.value.url);
      } else {
        errors.push(result.reason);
      }
      processed++;
    }

    // Append to partial output for crash resilience
    if (batchSuccesses.length > 0) {
      await appendResults(opts.output, batchSuccesses);
    }

    progressBar.update(processed, { batch: batchIndex + 1, totalBatches });

    // Delay between batches (skip after last batch)
    if (batchIndex < totalBatches - 1 && opts.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, opts.delay));
    }
  }

  progressBar.stop();

  // 7. Write final output
  console.log(chalk.cyan('\n  Writing results...'));
  await writeResults(opts.output, results, errors, {
    filterVerdict: opts.filterVerdict,
    onlyNotIndexed: opts.onlyNotIndexed,
  });

  // 8. Clear checkpoint on success
  await clearCheckpoint(opts.output);

  // 9. Print summary
  printSummary(results, errors, startTime);
}

function printSummary(results, errors, startTime) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(chalk.bold('\n  ── Summary ─────────────────────────────\n'));
  console.log(`  Total processed:  ${chalk.bold.green(results.length)}`);
  console.log(`  Errors:           ${errors.length > 0 ? chalk.bold.red(errors.length) : chalk.dim('0')}`);

  if (results.length > 0) {
    const summary = generateSummary(results);

    console.log(chalk.bold('\n  By verdict:'));
    for (const [verdict, count] of Object.entries(summary.byVerdict)) {
      const color = verdict === 'PASS' ? chalk.green : verdict === 'FAIL' ? chalk.red : chalk.yellow;
      console.log(`    ${color(verdict)}  ${chalk.bold(count)}`);
    }

    console.log(chalk.bold('\n  By coverage state:'));
    for (const [state, count] of Object.entries(summary.byCoverageState)) {
      console.log(`    ${chalk.dim(state)}  ${chalk.bold(count)}`);
    }

    if (summary.mobileIssuesCount > 0) {
      console.log(chalk.bold('\n  Mobile usability issues:'), chalk.yellow(summary.mobileIssuesCount));
    }

    if (summary.richResultTypes.length > 0) {
      console.log(chalk.bold('\n  Rich result types:'), chalk.magenta(summary.richResultTypes.join(', ')));
    }
  }

  console.log(chalk.dim(`\n  Completed in ${elapsed}s`));
  console.log(`  Results written to ${chalk.underline(opts.output + '/')}\n`);
}

main().catch((err) => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});
