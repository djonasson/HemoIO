import { describe, it, expect } from 'vitest';
import { formatShortDate } from './formatShortDate';

describe('formatShortDate', () => {
  it('formats a date the way results and notes show it', () => {
    expect(formatShortDate(new Date(2024, 0, 15))).toBe('Jan 15, 2024');
  });
});
