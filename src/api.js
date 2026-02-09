import axios from 'axios';
import { API_ENDPOINT, DEFAULTS } from './constants.js';

/**
 * Inspect a single URL via the Google URL Inspection API.
 * Includes retry logic with exponential backoff.
 */
export async function inspectUrl(inspectionUrl, siteUrl, authClient, options = {}) {
  const { languageCode = DEFAULTS.language, maxRetries = DEFAULTS.maxRetries } = options;

  const body = { inspectionUrl, siteUrl, languageCode };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const token = await authClient.getAccessToken();
      const { data } = await axios({
        method: 'post',
        url: API_ENDPOINT,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        data: body,
      });
      return data;
    } catch (error) {
      const status = error.response?.status;
      const isLastAttempt = attempt === maxRetries;

      // 429 Too Many Requests — respect Retry-After header
      if (status === 429) {
        if (isLastAttempt) throw wrapError(error, inspectionUrl);
        const retryAfter = parseRetryAfter(error.response);
        await sleep(retryAfter || backoffMs(attempt));
        continue;
      }

      // 5xx Server errors — retry with backoff
      if (status >= 500 && status < 600) {
        if (isLastAttempt) throw wrapError(error, inspectionUrl);
        await sleep(backoffMs(attempt));
        continue;
      }

      // 401 Unauthorized — refresh token once, then retry
      if (status === 401 && attempt === 0) {
        await sleep(500);
        continue;
      }

      // 403 Forbidden — retry only if quota-related
      if (status === 403) {
        const errorBody = error.response?.data;
        const isQuota = JSON.stringify(errorBody).includes('quota')
          || JSON.stringify(errorBody).includes('rateLimitExceeded');
        if (isQuota && !isLastAttempt) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw wrapError(error, inspectionUrl);
      }

      // Other 4xx — no retry
      throw wrapError(error, inspectionUrl);
    }
  }
}

function backoffMs(attempt) {
  return 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(response) {
  const header = response?.headers?.['retry-after'];
  if (!header) return null;
  const seconds = parseInt(header, 10);
  return isNaN(seconds) ? null : seconds * 1000;
}

function wrapError(error, inspectionUrl) {
  const status = error.response?.status;
  const message = error.response?.data?.error?.message || error.message;
  return {
    url: inspectionUrl,
    status,
    message,
    raw: error.response?.data,
  };
}
