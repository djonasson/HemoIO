import { describe, it, expect } from 'vitest';
import { formatRange } from './formatRange';

describe('formatRange', () => {
  it('formats both bounds, one bound, or none', () => {
    expect(formatRange(70, 90)).toBe('70 - 90');
    expect(formatRange(undefined, 90)).toBe('≤ 90');
    expect(formatRange(70, undefined)).toBe('≥ 70');
    expect(formatRange(undefined, undefined)).toBe('N/A');
  });
});
