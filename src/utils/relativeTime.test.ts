import { describe, it, expect } from 'vitest';
import { formatRelativeDateTime, formatRelativeTime } from './relativeTime';

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

describe('formatRelativeDateTime', () => {
  const now = new Date('2024-05-10T12:00:00');

  it.each([
    ['2024-05-10T11:59:30', 'just now'],
    ['2024-05-10T11:59:00', '1 minute ago'],
    ['2024-05-10T11:15:00', '45 minutes ago'],
    ['2024-05-10T11:00:00', '1 hour ago'],
    ['2024-05-09T13:00:00', '23 hours ago'],
    ['2024-05-09T11:00:00', 'Yesterday'],
    ['2024-03-01T12:00:00', '2 months ago'],
    ['2024-05-10T12:05:00', 'just now'],
  ])('%s → %s', (date, expected) => {
    expect(formatRelativeDateTime(new Date(date), now)).toBe(expected);
  });
});
