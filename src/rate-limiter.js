import { DEFAULTS } from './constants.js';

export class RateLimiter {
  constructor(requestsPerMinute = DEFAULTS.rateLimit) {
    this.requestsPerSecond = requestsPerMinute / 60;
    this.buckets = new Map(); // per-property token buckets
  }

  _getBucket(property) {
    if (!this.buckets.has(property)) {
      this.buckets.set(property, {
        tokens: this.requestsPerSecond,
        lastRefill: Date.now(),
      });
    }
    return this.buckets.get(property);
  }

  _refill(bucket) {
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(
      this.requestsPerSecond,
      bucket.tokens + elapsed * this.requestsPerSecond
    );
    bucket.lastRefill = now;
  }

  async acquire(property) {
    const bucket = this._getBucket(property);
    this._refill(bucket);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }

    // Wait until a token is available
    const waitMs = ((1 - bucket.tokens) / this.requestsPerSecond) * 1000;
    await new Promise((resolve) => setTimeout(resolve, Math.ceil(waitMs)));
    this._refill(bucket);
    bucket.tokens -= 1;
  }
}
