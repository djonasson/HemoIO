import { describe, it, expect, afterEach } from 'vitest';
import { isLocalhost, getCurrentOrigin } from './isLocalhost';

describe('isLocalhost', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  function mockHostname(hostname: string): void {
    Object.defineProperty(window, 'location', {
      value: { hostname, origin: `https://${hostname}` },
      writable: true,
    });
  }

  it('returns true for localhost', () => {
    mockHostname('localhost');
    expect(isLocalhost()).toBe(true);
  });

  it('returns true for 127.0.0.1', () => {
    mockHostname('127.0.0.1');
    expect(isLocalhost()).toBe(true);
  });

  it('returns true for [::1]', () => {
    mockHostname('[::1]');
    expect(isLocalhost()).toBe(true);
  });

  it('returns true for subdomains of localhost', () => {
    mockHostname('app.localhost');
    expect(isLocalhost()).toBe(true);
  });

  it('returns false for github.io', () => {
    mockHostname('djonasson.github.io');
    expect(isLocalhost()).toBe(false);
  });

  it('returns false for other domains', () => {
    mockHostname('example.com');
    expect(isLocalhost()).toBe(false);
  });
});

describe('getCurrentOrigin', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  it('returns the current origin', () => {
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://example.com', hostname: 'example.com' },
      writable: true,
    });
    expect(getCurrentOrigin()).toBe('https://example.com');
  });
});
