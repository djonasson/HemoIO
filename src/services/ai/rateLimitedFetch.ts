/**
 * One place for the AI providers' rate-limit handling: a request answered
 * with HTTP 429 is retried after a wait, so a busy provider delays an
 * import instead of failing it.
 */

/** Waits before the 1st, 2nd and 3rd retry */
export const RATE_LIMIT_DELAYS_MS: readonly number[] = [2000, 4000, 8000];

/** A provider's retry-after is honoured up to this long */
export const MAX_RETRY_AFTER_MS = 60_000;

export const RATE_LIMIT_MESSAGE =
  'The AI provider is rate limiting requests. Wait a minute, then try again.';

export interface RateLimitOptions {
  /** Called before waiting: how long, and which retry follows (1-based) */
  onWait?: (delayMs: number, retry: number) => void;
  /** Called when the wait is over and the request is sent again */
  onResume?: () => void;
  /** Replaces the timer, for tests */
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A retry-after header (seconds or an HTTP date) in milliseconds, capped */
export function retryAfterMs(header: string | null, now: number = Date.now()): number | null {
  if (header === null) return null;
  const value = header.trim();
  const ms = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.min(ms, MAX_RETRY_AFTER_MS);
}

/**
 * fetch, retrying HTTP 429 up to RATE_LIMIT_DELAYS_MS.length times. Returns
 * the last response either way; callers report a final 429 themselves.
 */
export async function fetchWithRateLimitRetry(
  url: string,
  init: RequestInit,
  options: RateLimitOptions = {}
): Promise<Response> {
  const sleep = options.sleep ?? wait;
  for (let retry = 0; ; retry++) {
    const response = await fetch(url, init);
    if (response.status !== 429 || retry >= RATE_LIMIT_DELAYS_MS.length) return response;

    const delay = retryAfterMs(response.headers.get('retry-after')) ?? RATE_LIMIT_DELAYS_MS[retry];
    // Release the connection: the body of a 429 is not needed
    await response.body?.cancel().catch(() => undefined);
    options.onWait?.(delay, retry + 1);
    await sleep(delay);
    options.onResume?.();
  }
}
