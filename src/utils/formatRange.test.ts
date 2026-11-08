import { describe, it, expect } from 'vitest';
import { formatRange } from './formatRange';

describe('formatRange', () => {
  it('formats both bounds, one bound, or none', () => {
    expect(formatRange(70, 90)).toBe('70 - 90');
    expect(formatRange(undefined, 90)).toBe('≤ 90');
    expect(formatRange(70, undefined)).toBe('≥ 70');
    expect(formatRange(undefined, undefined)).toBe('N/A');
  });

  it('shows printed ends as printed, and converted ones to four significant figures', () => {
    expect(formatRange(1.015, 1.03)).toBe('1.015 - 1.03');
    expect(formatRange(150000, 450000)).toBe('150000 - 450000');
    expect(formatRange(0.005, 0.0125)).toBe('0.005 - 0.0125');
    expect(formatRange(8.4168336673, 10.4208416834)).toBe('8.417 - 10.42');
    expect(formatRange(undefined, 10.4208416834)).toBe('≤ 10.42');
  });
});
