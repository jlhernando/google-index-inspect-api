import { writeFile, appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'json2csv';
import {
  formatIndexStatus,
  formatMobileUsability,
  formatRichResults,
  formatAmp,
} from './formatter.js';

/**
 * Ensure output directory exists.
 */
export async function ensureOutputDir(outputDir) {
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }
}

/**
 * Append batch results to partial files for crash resilience.
 */
export async function appendResults(outputDir, batchResults) {
  const partialPath = join(outputDir, 'coverage-partial.json');
  const entries = batchResults.map((r) => JSON.stringify(r)).join('\n') + '\n';
  await appendFile(partialPath, entries);
}

/**
 * Write all final output files.
 */
export async function writeResults(outputDir, results, errors, options = {}) {
  await ensureOutputDir(outputDir);
  const { filterVerdict, onlyNotIndexed } = options;

  let filteredResults = results;

  if (onlyNotIndexed) {
    filteredResults = results.filter(
      (r) => r.inspectionResult?.indexStatusResult?.verdict !== 'PASS'
    );
  } else if (filterVerdict) {
    filteredResults = results.filter(
      (r) => r.inspectionResult?.indexStatusResult?.verdict === filterVerdict.toUpperCase()
    );
  }

  // coverage.json — full raw API responses
  await writeFile(
    join(outputDir, 'coverage.json'),
    JSON.stringify(filteredResults, null, 2)
  );

  // coverage.csv — main index status
  const indexRows = filteredResults
    .map((r) => formatIndexStatus(r.url, r.inspectionResult))
    .filter(Boolean);
  if (indexRows.length > 0) {
    await writeFile(join(outputDir, 'coverage.csv'), parse(indexRows));
  }

  // mobile-usability.csv
  const mobileRows = filteredResults
    .map((r) => formatMobileUsability(r.url, r.inspectionResult))
    .filter(Boolean);
  if (mobileRows.length > 0) {
    await writeFile(join(outputDir, 'mobile-usability.csv'), parse(mobileRows));
  }

  // rich-results.csv
  const richRows = filteredResults
    .map((r) => formatRichResults(r.url, r.inspectionResult))
    .filter(Boolean);
  if (richRows.length > 0) {
    await writeFile(join(outputDir, 'rich-results.csv'), parse(richRows));
  }

  // amp.csv
  const ampRows = filteredResults
    .map((r) => formatAmp(r.url, r.inspectionResult))
    .filter(Boolean);
  if (ampRows.length > 0) {
    await writeFile(join(outputDir, 'amp.csv'), parse(ampRows));
  }

  // errors.json
  if (errors.length > 0) {
    await writeFile(
      join(outputDir, 'errors.json'),
      JSON.stringify(errors, null, 2)
    );
  }

  // Clean up partial file
  const partialPath = join(outputDir, 'coverage-partial.json');
  if (existsSync(partialPath)) {
    const { unlink } = await import('fs/promises');
    await unlink(partialPath);
  }
}
