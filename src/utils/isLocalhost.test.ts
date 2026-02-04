import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isLocalhost, getCurrentOrigin } from './isLocalhost';

describe('isLocalhost', () => {
  const originalWindow = global.window;

  afterEach(() => {
    global.window = originalWindow;
  });

  it('returns true for localhost', () => {
    global.window = { location: { hostname: 'localhost' } } as Window & typeof globalThis;
    expect(isLocalhost()).toBe(true);
  });

  it('returns true for 127.0.0.1', () => {
    global.window = { location: { hostname: '127.0.0.1' } } as Window & typeof globalThis;
    expect(isLocalhost()).toBe(true);
  });

  it('returns true for [::1]', () => {
    global.window = { location: { hostname: '[::1]' } } as Window & typeof globalThis;
    expect(isLocalhost()).toBe(true);
  });

  it('returns true for subdomains of localhost', () => {
    global.window = { location: { hostname: 'app.localhost' } } as Window & typeof globalThis;
    expect(isLocalhost()).toBe(true);
  });

  it('returns false for github.io', () => {
    global.window = { location: { hostname: 'djonasson.github.io' } } as Window & typeof globalThis;
    expect(isLocalhost()).toBe(false);
  });

  it('returns false for other domains', () => {
    global.window = { location: { hostname: 'example.com' } } as Window & typeof globalThis;
    expect(isLocalhost()).toBe(false);
  });

  it('returns true when window is undefined (SSR)', () => {
    // @ts-expect-error - Testing SSR scenario
    global.window = undefined;
    expect(isLocalhost()).toBe(true);
  });
});

describe('getCurrentOrigin', () => {
  const originalWindow = global.window;

  afterEach(() => {
    global.window = originalWindow;
  });

  it('returns the current origin', () => {
    global.window = { location: { origin: 'https://example.com' } } as Window & typeof globalThis;
    expect(getCurrentOrigin()).toBe('https://example.com');
  });

  it('returns empty string when window is undefined', () => {
    // @ts-expect-error - Testing SSR scenario
    global.window = undefined;
    expect(getCurrentOrigin()).toBe('');
  });
});
