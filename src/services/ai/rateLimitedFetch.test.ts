import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchWithRateLimitRetry,
  retryAfterMs,
  RATE_LIMIT_DELAYS_MS,
  RATE_LIMIT_MESSAGE,
} from './rateLimitedFetch';
import { AIAnalysisError } from './types';

function reply(status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ status }), { status, headers });
}

describe('retryAfterMs', () => {
  it('reads seconds and HTTP dates, capped at a minute', () => {
    const now = Date.parse('2024-01-01T00:00:00Z');
    expect(retryAfterMs('30', now)).toBe(30_000);
    expect(retryAfterMs('0', now)).toBe(0);
    expect(retryAfterMs('Mon, 01 Jan 2024 00:00:10 GMT', now)).toBe(10_000);
    expect(retryAfterMs('3600', now)).toBe(60_000);
  });

  it('ignores missing or unreadable values', () => {
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs('soon')).toBeNull();
    expect(retryAfterMs('-5')).toBeNull();
  });
});

describe('fetchWithRateLimitRetry', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const sleep = vi.fn(async (ms: number) => {
    void ms;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    sleep.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries a 429 with exponential backoff and returns the success', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(200));
    const onWait = vi.fn();
    const onResume = vi.fn();

    const response = await fetchWithRateLimitRetry('anthropic', 'https://ai.test', {}, { sleep, onWait, onResume });

    expect(response.status).toBe(200);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 4000]);
    expect(onWait.mock.calls).toEqual([
      [2000, 1],
      [4000, 2],
    ]);
    expect(onResume).toHaveBeenCalledTimes(2);
  });

  it('honours retry-after over the backoff', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(429, { 'retry-after': '7' }))
      .mockResolvedValueOnce(reply(200));
    await fetchWithRateLimitRetry('anthropic', 'https://ai.test', {}, { sleep });
    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it('gives up after 3 retries with a rate-limit error', async () => {
    fetchMock.mockImplementation(async () => reply(429));

    const error = await fetchWithRateLimitRetry('anthropic', 'https://ai.test', {}, { sleep }).catch(
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(AIAnalysisError);
    expect(error).toMatchObject({
      message: RATE_LIMIT_MESSAGE,
      provider: 'anthropic',
      code: 'rate_limited',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1 + RATE_LIMIT_DELAYS_MS.length);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 4000, 8000]);
  });

  it('never retries other errors', async () => {
    fetchMock.mockResolvedValueOnce(reply(503));
    const response = await fetchWithRateLimitRetry('anthropic', 'https://ai.test', {}, { sleep });
    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('passes the request through unchanged', async () => {
    fetchMock.mockResolvedValueOnce(reply(200));
    const init = { method: 'POST', body: '{}' };
    await fetchWithRateLimitRetry('anthropic', 'https://ai.test/x', init, { sleep });
    expect(fetchMock).toHaveBeenCalledWith('https://ai.test/x', init);
  });

  it('does not retry a 429 the provider marks as not worth retrying', async () => {
    fetchMock.mockResolvedValueOnce(reply(429));
    const shouldRetry = vi.fn(async () => false);

    const response = await fetchWithRateLimitRetry('anthropic', 'https://ai.test', {}, { sleep, shouldRetry });

    expect(response.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    // The provider can still read the body to report the reason
    await expect(response.json()).resolves.toEqual({ status: 429 });
  });

  it('stops waiting and gives up when the request is aborted', async () => {
    fetchMock.mockResolvedValue(reply(429, { 'retry-after': '30' }));
    const controller = new AbortController();
    const realSleep = fetchWithRateLimitRetry('anthropic', 'https://ai.test', { signal: controller.signal });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(realSleep).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
