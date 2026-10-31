import { describe, it, expect } from 'vitest';
import { formatDateTime } from './formatDateTime';

describe('formatDateTime', () => {
  it('gives the date and the time of day', () => {
    const text = formatDateTime(new Date(2026, 9, 29, 8, 30));

    expect(text).toBe('Oct 29, 2026, 8:30 AM');
  });
});
