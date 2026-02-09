import {
  VERDICT_LABELS,
  COVERAGE_STATE_LABELS,
  ROBOTS_TXT_STATE_LABELS,
  INDEXING_STATE_LABELS,
  PAGE_FETCH_STATE_LABELS,
  CRAWL_USER_AGENT_LABELS,
  MOBILE_USABILITY_VERDICT_LABELS,
  MOBILE_ISSUE_LABELS,
  AMP_VERDICT_LABELS,
} from './constants.js';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

function formatDate(isoString) {
  if (!isoString || isoString === '1970-01-01T00:00:00Z') {
    return 'Not crawled';
  }
  return dateFormatter.format(new Date(isoString));
}

function label(map, value) {
  return map[value] || value || '';
}

/**
 * Flatten indexStatusResult into a CSV-friendly row.
 */
export function formatIndexStatus(url, inspectionResult) {
  const idx = inspectionResult?.indexStatusResult;
  if (!idx) return null;

  const row = {
    url,
    verdict: label(VERDICT_LABELS, idx.verdict),
    coverageState: label(COVERAGE_STATE_LABELS, idx.coverageState),
    robotsTxtState: label(ROBOTS_TXT_STATE_LABELS, idx.robotsTxtState),
    indexingState: label(INDEXING_STATE_LABELS, idx.indexingState),
    lastCrawlTime: formatDate(idx.lastCrawlTime),
    pageFetchState: label(PAGE_FETCH_STATE_LABELS, idx.pageFetchState),
    crawledAs: label(CRAWL_USER_AGENT_LABELS, idx.crawlingUserAgent),
    userCanonical: idx.userCanonical || 'None',
    googleCanonical: idx.googleCanonical || 'Inspected URL',
    inspectionResultLink: inspectionResult.inspectionResultLink || '',
  };

  // Add sitemaps as dynamic columns
  if (idx.sitemap && idx.sitemap.length > 0) {
    for (const [i, sitemap] of idx.sitemap.entries()) {
      row[`sitemap-${i + 1}`] = sitemap;
    }
  }

  // Add referring URLs as dynamic columns
  if (idx.referringUrls && idx.referringUrls.length > 0) {
    for (const [i, refUrl] of idx.referringUrls.entries()) {
      row[`referringUrl-${i + 1}`] = refUrl;
    }
  }

  return row;
}

/**
 * Flatten mobileUsabilityResult into a CSV-friendly row.
 */
export function formatMobileUsability(url, inspectionResult) {
  const mobile = inspectionResult?.mobileUsabilityResult;
  if (!mobile) return null;

  const row = {
    url,
    verdict: label(MOBILE_USABILITY_VERDICT_LABELS, mobile.verdict),
  };

  if (mobile.issues && mobile.issues.length > 0) {
    for (const [i, issue] of mobile.issues.entries()) {
      row[`issue-${i + 1}`] = label(MOBILE_ISSUE_LABELS, issue.issueType);
      if (issue.message) row[`issue-${i + 1}-message`] = issue.message;
    }
  }

  return row;
}

/**
 * Flatten richResultsResult into a CSV-friendly row.
 */
export function formatRichResults(url, inspectionResult) {
  const rich = inspectionResult?.richResultsResult;
  if (!rich) return null;

  const row = {
    url,
    verdict: label(VERDICT_LABELS, rich.verdict),
  };

  if (rich.detectedItems && rich.detectedItems.length > 0) {
    for (const [i, item] of rich.detectedItems.entries()) {
      row[`richResultType-${i + 1}`] = item.richResultType || '';
      if (item.items && item.items.length > 0) {
        for (const [j, subItem] of item.items.entries()) {
          if (subItem.issues && subItem.issues.length > 0) {
            for (const [k, issue] of subItem.issues.entries()) {
              row[`type-${i + 1}-item-${j + 1}-issue-${k + 1}`] =
                `${issue.severity}: ${issue.issueMessage}`;
            }
          }
        }
      }
    }
  }

  return row;
}

/**
 * Flatten ampResult into a CSV-friendly row.
 */
export function formatAmp(url, inspectionResult) {
  const amp = inspectionResult?.ampResult;
  if (!amp) return null;

  const row = {
    url,
    verdict: label(AMP_VERDICT_LABELS, amp.verdict),
    ampUrl: amp.ampUrl || '',
    ampIndexStatusVerdict: label(VERDICT_LABELS, amp.ampIndexStatusVerdict),
    robotsTxtState: label(ROBOTS_TXT_STATE_LABELS, amp.robotsTxtState),
    indexingState: label(INDEXING_STATE_LABELS, amp.indexingState),
    lastCrawlTime: formatDate(amp.lastCrawlTime),
    pageFetchState: label(PAGE_FETCH_STATE_LABELS, amp.pageFetchState),
  };

  if (amp.issues && amp.issues.length > 0) {
    for (const [i, issue] of amp.issues.entries()) {
      row[`issue-${i + 1}`] = `${issue.severity}: ${issue.issueMessage}`;
    }
  }

  return row;
}

/**
 * Generate a summary breakdown from all results.
 */
export function generateSummary(results) {
  const summary = {
    total: results.length,
    byVerdict: {},
    byCoverageState: {},
    mobileIssuesCount: 0,
    richResultTypes: new Set(),
  };

  for (const { inspectionResult } of results) {
    // Index verdict
    const verdict = inspectionResult?.indexStatusResult?.verdict || 'UNKNOWN';
    summary.byVerdict[verdict] = (summary.byVerdict[verdict] || 0) + 1;

    // Coverage state
    const state = inspectionResult?.indexStatusResult?.coverageState || 'UNKNOWN';
    summary.byCoverageState[state] = (summary.byCoverageState[state] || 0) + 1;

    // Mobile issues
    const mobileIssues = inspectionResult?.mobileUsabilityResult?.issues;
    if (mobileIssues && mobileIssues.length > 0) {
      summary.mobileIssuesCount += mobileIssues.length;
    }

    // Rich result types
    const richItems = inspectionResult?.richResultsResult?.detectedItems;
    if (richItems) {
      for (const item of richItems) {
        if (item.richResultType) summary.richResultTypes.add(item.richResultType);
      }
    }
  }

  summary.richResultTypes = [...summary.richResultTypes];
  return summary;
}
