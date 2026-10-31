/**
 * server/helm/queue.js
 * In-flight concurrency limiter (semaphore) and per-IP rate limiter for HELM.
 *
 * Rules (ARCHITECTURE.md Section 8.8 & 10):
 *   - Semaphore sized by HELM_MAX_INFLIGHT (default 2).
 *   - Waiters time out after HELM_QUEUE_WAIT_MS (default 8000ms) and return 429.
 *   - Per-IP rate limit: HELM_RATE_LIMIT_PER_MIN (default 20 requests per minute).
 *   - Never exposes API keys, tokens or raw error stack traces.
 */

function parsePositiveInt(val, fallback) {
  if (!val) return fallback;
  const n = parseInt(String(val).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const HELM_MAX_INFLIGHT = parsePositiveInt(process.env.HELM_MAX_INFLIGHT, 2);
export const HELM_QUEUE_WAIT_MS = parsePositiveInt(process.env.HELM_QUEUE_WAIT_MS, 8000);
export const HELM_RATE_LIMIT_PER_MIN = parsePositiveInt(process.env.HELM_RATE_LIMIT_PER_MIN, 20);

let activeInFlightCount = 0;
const waitingQueue = [];
const ipRequestTimestamps = new Map();

/**
 * Checks per-IP sliding 1-minute window rate limit.
 *
 * @param {string} ip
 * @param {number} [limit]
 * @returns {boolean} true if allowed; false if rate limit exceeded
 */
export function checkRateLimit(ip = 'anonymous', limit = HELM_RATE_LIMIT_PER_MIN) {
  const now = Date.now();
  const windowStart = now - 60000;

  let timestamps = ipRequestTimestamps.get(ip) || [];
  timestamps = timestamps.filter((t) => t > windowStart);

  if (timestamps.length >= limit) {
    ipRequestTimestamps.set(ip, timestamps);
    return false;
  }

  timestamps.push(now);
  ipRequestTimestamps.set(ip, timestamps);
  return true;
}

/**
 * Resets the in-memory queue and rate limits (useful for test suites).
 */
export function resetQueueState() {
  activeInFlightCount = 0;
  waitingQueue.length = 0;
  ipRequestTimestamps.clear();
}

/**
 * Returns current queue diagnostics.
 */
export function getQueueStatus() {
  return {
    activeInFlight: activeInFlightCount,
    maxInFlight: HELM_MAX_INFLIGHT,
    queuedWaiters: waitingQueue.length,
    queueWaitMs: HELM_QUEUE_WAIT_MS,
  };
}

/**
 * Acquires an in-flight slot, running `fn` inside the concurrency semaphore.
 * If at capacity, waits up to `queueWaitMs` before rejecting with 429.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {object} [options]
 * @param {number} [options.maxInFlight]
 * @param {number} [options.queueWaitMs]
 * @returns {Promise<T>}
 */
export async function withHelmConcurrency(fn, options = {}) {
  const maxInFlight = options.maxInFlight || HELM_MAX_INFLIGHT;
  const queueWaitMs = options.queueWaitMs || HELM_QUEUE_WAIT_MS;

  if (activeInFlightCount < maxInFlight) {
    activeInFlightCount += 1;
    try {
      return await fn();
    } finally {
      activeInFlightCount -= 1;
      releaseNext();
    }
  }

  // Queue waiter
  return new Promise((resolve, reject) => {
    let timer = null;

    const waiter = {
      run: async () => {
        clearTimeout(timer);
        activeInFlightCount += 1;
        try {
          const res = await fn();
          resolve(res);
        } catch (err) {
          reject(err);
        } finally {
          activeInFlightCount -= 1;
          releaseNext();
        }
      },
      cancel: () => {
        const err = new Error('Server is busy (maximum HELM concurrency reached). Please try again or use canned queries.');
        err.status = 429;
        err.isQueueTimeout = true;
        reject(err);
      },
    };

    timer = setTimeout(() => {
      const idx = waitingQueue.indexOf(waiter);
      if (idx !== -1) {
        waitingQueue.splice(idx, 1);
        waiter.cancel();
      }
    }, queueWaitMs);

    waitingQueue.push(waiter);
  });
}

function releaseNext() {
  if (waitingQueue.length > 0 && activeInFlightCount < HELM_MAX_INFLIGHT) {
    const next = waitingQueue.shift();
    if (next) {
      next.run();
    }
  }
}

