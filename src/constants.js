export const API_ENDPOINT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

export const DEFAULTS = {
  batchSize: 50,
  delayMs: 3000,
  maxRetries: 3,
  inputFile: 'urls.csv',
  outputDir: 'RESULTS',
  language: 'en-US',
  rateLimit: 600, // requests per minute per property
};

export const VERDICT_LABELS = {
  VERDICT_UNSPECIFIED: 'Unspecified',
  PASS: 'Pass',
  PARTIAL: 'Partial',
  FAIL: 'Fail',
  NEUTRAL: 'Neutral',
};

export const COVERAGE_STATE_LABELS = {
  INDEXING_STATE_UNSPECIFIED: 'Unspecified',
  SUBMITTED_AND_INDEXED: 'Submitted and indexed',
  CRAWLED_CURRENTLY_NOT_INDEXED: 'Crawled - currently not indexed',
  DISCOVERED_CURRENTLY_NOT_INDEXED: 'Discovered - currently not indexed',
  PAGE_WITH_REDIRECT: 'Page with redirect',
  URL_IS_UNKNOWN_TO_GOOGLE: 'URL is unknown to Google',
  DUPLICATE_WITHOUT_USER_SELECTED_CANONICAL: 'Duplicate without user-selected canonical',
  DUPLICATE_GOOGLE_CHOSE_DIFFERENT_CANONICAL: 'Duplicate, Google chose different canonical',
  NOT_FOUND_404: 'Not found (404)',
  SOFT_404: 'Soft 404',
  BLOCKED_BY_ROBOTS_TXT: 'Blocked by robots.txt',
  BLOCKED_DUE_TO_UNAUTHORIZED_REQUEST_401: 'Blocked due to unauthorized request (401)',
  BLOCKED_DUE_TO_ACCESS_FORBIDDEN_403: 'Blocked due to access forbidden (403)',
  BLOCKED_DUE_TO_OTHER_4XX_ISSUE: 'Blocked due to other 4xx issue',
  SERVER_ERROR_5XX: 'Server error (5xx)',
  REDIRECT_ERROR: 'Redirect error',
  BLOCKED_DUE_TO_NOINDEX: 'Blocked due to noindex',
  EXCLUDED_BY_ALTERNATE_PAGE_WITH_PROPER_CANONICAL_TAG: 'Excluded by alternate page with proper canonical tag',
};

export const ROBOTS_TXT_STATE_LABELS = {
  ROBOTS_TXT_STATE_UNSPECIFIED: 'Unspecified',
  ALLOWED: 'Allowed',
  DISALLOWED: 'Disallowed',
};

export const INDEXING_STATE_LABELS = {
  INDEXING_STATE_UNSPECIFIED: 'Unspecified',
  INDEXING_ALLOWED: 'Allowed',
  BLOCKED_BY_META_TAG: 'Blocked by meta tag',
  BLOCKED_BY_HTTP_HEADER: 'Blocked by HTTP header',
  BLOCKED_BY_ROBOTS_TXT: 'Blocked by robots.txt',
};

export const PAGE_FETCH_STATE_LABELS = {
  PAGE_FETCH_STATE_UNSPECIFIED: 'Unspecified',
  SUCCESSFUL: 'Successful',
  SOFT_404: 'Soft 404',
  BLOCKED_ROBOTS_TXT: 'Blocked by robots.txt',
  NOT_FOUND: 'Not found',
  ACCESS_DENIED: 'Access denied',
  SERVER_ERROR: 'Server error',
  REDIRECT_ERROR: 'Redirect error',
  ACCESS_FORBIDDEN: 'Access forbidden',
  BLOCKED_4XX: 'Blocked (4xx)',
  INTERNAL_CRAWL_ERROR: 'Internal crawl error',
  INVALID_URL: 'Invalid URL',
};

export const CRAWL_USER_AGENT_LABELS = {
  CRAWLING_USER_AGENT_UNSPECIFIED: 'Unspecified',
  DESKTOP: 'Desktop',
  MOBILE: 'Mobile',
};

export const MOBILE_USABILITY_VERDICT_LABELS = {
  MOBILE_USABILITY_VERDICT_UNSPECIFIED: 'Unspecified',
  PASS: 'Pass',
  FAIL: 'Fail',
};

export const MOBILE_ISSUE_LABELS = {
  MOBILE_ISSUE_UNSPECIFIED: 'Unspecified',
  USES_INCOMPATIBLE_PLUGINS: 'Uses incompatible plugins',
  CONFIGURE_VIEWPORT: 'Viewport not configured',
  FIXED_WIDTH_VIEWPORT: 'Fixed-width viewport',
  SIZE_CONTENT_TO_VIEWPORT: 'Content wider than screen',
  USE_LEGIBLE_FONT_SIZES: 'Text too small to read',
  TAP_TARGETS_TOO_CLOSE: 'Clickable elements too close together',
};

export const AMP_VERDICT_LABELS = {
  AMP_VERDICT_UNSPECIFIED: 'Unspecified',
  PASS: 'Pass',
  FAIL: 'Fail',
};
