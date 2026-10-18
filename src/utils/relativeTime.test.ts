import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './relativeTime';

const now = new Date('2026-10-18T12:00:00');
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

describe('formatRelativeTime', () => {
  it.each([
    [0, 'Today'],
    [1, 'Yesterday'],
    [3, '3 days ago'],
    [7, '1 week ago'],
    [20, '2 weeks ago'],
    [45, '1 month ago'],
    [200, '6 months ago'],
    [400, '1 year ago'],
    [800, '2 years ago'],
  ])('%i days ago reads "%s"', (days, expected) => {
    expect(formatRelativeTime(daysAgo(days), now)).toBe(expected);
  });

  it('treats future dates as today rather than negative times', () => {
    expect(formatRelativeTime(new Date(now.getTime() + 3600_000), now)).toBe('Today');
  });
});
