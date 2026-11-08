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

  it('shows a converted end to four significant figures even when the conversion is exact', () => {
    // Calcium 2.1-2.6 mmol/L in mg/dL, and glucose 3.9-5.6 mmol/L
    expect(formatRange(8.4168, 10.4208)).toBe('8.417 - 10.42');
    expect(formatRange(70.2624, 100.8896)).toBe('70.26 - 100.9');
    expect(formatRange(12.5, 1234)).toBe('12.5 - 1234');
  });
});
