# Google Index Inspection API

Bulk-check URL indexing status via the [Google Search Console URL Inspection API](https://developers.google.com/webmaster-tools/v1/urlInspection.index/urlInspection.index). Reads URLs from a CSV, makes authenticated batch API requests with rate limiting and retry logic, and outputs results as JSON and CSV.

For a more in-depth explanation, read [this blog post](https://jlhernando.com/blog/google-url-inspection-api-nodejs/).

## Features

- Batch processing with configurable batch size and delay
- Rate limiting (600 requests/min per property) to stay within API quotas
- Automatic retry with exponential backoff for transient errors (429, 5xx)
- Progress bar with real-time batch tracking
- Checkpoint/resume support for interrupted runs
- Multiple output files: index status, mobile usability, rich results, AMP
- Input validation with clear error messages
- Flexible authentication (ADC, OAuth, service account, gcloud CLI)

## Quick Start

```bash
npm install
```

Prepare your `urls.csv` with the URLs to check:

```csv
url,property
https://example.com/page-1,https://example.com/
https://example.com/page-2,https://example.com/
https://blog.example.com/post,sc-domain:example.com
```

- **url**: The full URL to inspect
- **property**: The Search Console property it belongs to. Either a URL prefix (`https://example.com/` with trailing slash) or a domain property (`sc-domain:example.com`)

Set up authentication (see [Authentication](#authentication) below), then run:

```bash
node index.js
```

## Authentication

The tool supports four authentication methods. It tries them in this order automatically: **ADC > OAuth**. You can also explicitly choose **service account** or **gcloud CLI**.

### Option 1: Application Default Credentials (ADC) — Recommended

The simplest method if you have the [Google Cloud CLI (`gcloud`)](https://cloud.google.com/sdk/docs/install) installed.

**Prerequisites:**
1. A Google Cloud project with the **Google Search Console API** enabled:
   ```bash
   gcloud services enable searchconsole.googleapis.com
   ```
2. An OAuth client ID of type **Desktop app** created in [Google Cloud Console > Credentials](https://console.cloud.google.com/apis/credentials)

**Setup (one-time):**

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/webmasters.readonly \
  --client-id-file=client-secret.json
```

Replace `client-secret.json` with the path to your downloaded Desktop OAuth client JSON file. This opens a browser for Google sign-in. Once authorized, credentials are saved to `~/.config/gcloud/application_default_credentials.json` and reused automatically.

**Run:**

```bash
node index.js
```

No flags needed — ADC is detected automatically.

> **Note:** The `--scopes` flag must include both `cloud-platform` (required by gcloud) and `webmasters.readonly` (required by the Search Console API). Without the webmasters scope, API calls will fail with "insufficient authentication scopes".

### Option 2: OAuth 2.0 (Browser Flow)

A browser-based OAuth flow that runs a local HTTP server and waits for the redirect callback. Used automatically as a fallback when ADC is not available.

**Prerequisites:**
1. A Google Cloud project with the **Google Search Console API** enabled
2. An OAuth client ID created in [Google Cloud Console > Credentials](https://console.cloud.google.com/apis/credentials):
   - For **Desktop app** type: no redirect URIs needed (loopback is automatic)
   - For **Web application** type: add `http://localhost:3000` as an Authorized redirect URI
3. Download the credentials JSON and save it as `client-secret.json` in the project root

**Run:**

```bash
node index.js --credentials client-secret.json
```

The tool prints an auth URL to the terminal. Open it in your browser, sign in with your Google account, and grant access. After authorization, the tool receives the callback on `http://localhost:3000` and continues.

The refresh token is cached in `.gsc-token-cache.json` so you won't need to re-authenticate on subsequent runs (unless the token is revoked).

### Option 3: Service Account

Best for automated/headless environments (CI/CD, servers, cron jobs). No browser interaction needed.

**Prerequisites:**
1. A Google Cloud project with the **Google Search Console API** enabled
2. A [service account](https://console.cloud.google.com/iam-admin/serviceaccounts) created in your project
3. A JSON key file downloaded for the service account
4. The service account's email address added as a user in [Google Search Console](https://search.google.com/search-console/) with at least **Restricted** permission for each property you want to inspect

**Run:**

```bash
node index.js --service-account path/to/service-account-key.json
```

### Option 4: gcloud CLI Token

Uses your existing `gcloud auth login` session directly. This is a quick option but has a caveat: the default gcloud token may not include the Search Console scope, which will result in 403 "insufficient scopes" errors.

**When it works:** If you authenticated gcloud with the webmasters scope (e.g., via `gcloud auth application-default login` with the right scopes, which also sets up your user session).

**Run:**

```bash
node index.js --gcloud
```

> **Note:** If you get 403 "insufficient authentication scopes" errors, use Option 1 (ADC) instead, which properly requests the webmasters scope.

### Authentication Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid_client` | OAuth client ID just created, not yet propagated | Wait 5–60 minutes and retry |
| `insufficient authentication scopes` | Token doesn't include `webmasters.readonly` scope | Use ADC with `--scopes` flag (Option 1) or OAuth (Option 2) |
| `PERMISSION_DENIED` / 403 | Account doesn't have access to the Search Console property | Add your Google account (or service account email) as a user in [Search Console](https://search.google.com/search-console/) |
| `redirect_uri_mismatch` | OAuth redirect URI not registered | Add `http://localhost:3000` as authorized redirect URI in Cloud Console |
| `OAuth timed out after 120s` | Browser auth not completed in time | Open the printed URL manually, complete auth faster |
| `File does not exist` | Credentials file not found | Check the `--credentials` or `--service-account` path |

### Google Cloud Project Setup Checklist

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the **Google Search Console API**:
   ```bash
   gcloud services enable searchconsole.googleapis.com
   ```
   Or via the [API Library](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com)
4. Create OAuth credentials at [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials):
   - Click **+ CREATE CREDENTIALS** > **OAuth client ID**
   - Application type: **Desktop app** (recommended) or **Web application**
   - Download the JSON file
5. If your project is in "Testing" mode in the [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent), add your Google account as a test user

## CLI Options

```
Usage: gsc-inspect [options]

Options:
  -V, --version               output the version number
  --input <file>              Input CSV file path (default: "urls.csv")
  --output <dir>              Output directory (default: "RESULTS")
  --batch-size <n>            Batch size for parallel requests (default: 50)
  --delay <ms>                Delay between batches in milliseconds (default: 3000)
  --max-retries <n>           Maximum retry attempts per request (default: 3)
  --service-account <file>    Service account JSON key file (instead of OAuth)
  --gcloud                    Use gcloud CLI session for authentication
  --credentials <file>        OAuth credentials JSON file (default: "client-secret.json")
  --language <code>           Language code for inspection (default: "en-US")
  --dry-run                   Validate input and show quota estimate only
  --resume                    Resume from checkpoint
  --filter-verdict <verdict>  Filter output by verdict (PASS, FAIL, NEUTRAL)
  --only-not-indexed          Only include non-indexed URLs in output
  -h, --help                  display help for command
```

## Usage Examples

```bash
# Validate input without making API calls
node index.js --dry-run

# Run with a custom input file and output directory
node index.js --input my-urls.csv --output my-results

# Use a service account
node index.js --service-account key.json

# Use specific OAuth credentials file
node index.js --credentials client_secret_desktop.json

# Smaller batches with longer delay (gentler on the API)
node index.js --batch-size 10 --delay 5000

# Resume an interrupted run
node index.js --resume

# Only output non-indexed URLs
node index.js --only-not-indexed

# Filter output to only FAIL verdicts
node index.js --filter-verdict FAIL
```

## Input Format

The input CSV must have `url` and `property` columns:

```csv
url,property
https://example.com/page,https://example.com/
```

- **url**: Fully-qualified URL (must start with `http://` or `https://`)
- **property**: Search Console property in one of two formats:
  - URL prefix: `https://example.com/` (must end with `/`)
  - Domain property: `sc-domain:example.com`

The tool validates all rows before processing and reports invalid entries.

## Output Files

All output is written to the `RESULTS/` directory (configurable with `--output`):

| File | Description |
|------|-------------|
| `coverage.json` | Full raw API responses for all URLs |
| `coverage.csv` | Index status: verdict, coverage state, crawl info, canonicals, sitemaps, referring URLs |
| `mobile-usability.csv` | Mobile usability verdicts and issues (only if data present) |
| `rich-results.csv` | Rich result types and issues (only if data present) |
| `amp.csv` | AMP status and issues (only if data present) |
| `errors.json` | Failed URLs with error details |

### coverage.csv Columns

| Column | Description |
|--------|-------------|
| `url` | Inspected URL |
| `verdict` | Pass, Fail, Neutral, Partial |
| `coverageState` | e.g., "Submitted and indexed", "Crawled - currently not indexed" |
| `robotsTxtState` | Allowed or Disallowed |
| `indexingState` | Allowed, Blocked by meta tag, etc. |
| `lastCrawlTime` | Last crawl timestamp (or "Not crawled") |
| `pageFetchState` | Successful, Not found, Server error, etc. |
| `crawledAs` | Desktop or Mobile |
| `userCanonical` | User-declared canonical URL |
| `googleCanonical` | Google-selected canonical URL |
| `inspectionResultLink` | Direct link to the URL in Search Console |
| `sitemap-N` | Sitemaps referencing this URL |
| `referringUrl-N` | URLs linking to this page (as seen by Google) |

## Rate Limits and Quotas

- The Google URL Inspection API has a limit of **2,000 requests per day per property**
- The tool enforces a rate limit of **600 requests per minute per property** (10/sec)
- Use `--dry-run` to check how many requests will be made before running
- Use `--batch-size` and `--delay` to control request pacing

## Checkpoint and Resume

If the process is interrupted (Ctrl+C, crash, network failure):

1. The tool saves a checkpoint file with all already-processed URLs
2. Partial results are written to disk after each batch
3. Run with `--resume` to continue from where it left off:
   ```bash
   node index.js --resume
   ```

The checkpoint is automatically cleared on successful completion.

## Architecture

```
index.js              CLI entry point (commander setup, orchestration)
src/
  auth.js             OAuth, ADC, service account, gcloud authentication
  api.js              API calls with retry/exponential backoff
  rate-limiter.js     Per-property token bucket rate limiter
  validator.js        Input CSV validation
  output.js           Output file generation (JSON, CSV)
  checkpoint.js       Resume/checkpoint for interrupted runs
  formatter.js        Transform API responses to flat CSV rows
  constants.js        API endpoint, defaults, enum labels
```

## License

MIT
