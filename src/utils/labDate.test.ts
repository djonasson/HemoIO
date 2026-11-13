import { describe, it, expect } from 'vitest';
import { dayOrderOf, normalizeLabDate, reviewedLabDate } from './labDate';

describe('normalizeLabDate', () => {
  it('keeps ISO days', () => {
    expect(normalizeLabDate('2024-01-15')).toBe('2024-01-15');
    expect(normalizeLabDate('2024-01-15T00:00:00Z')).toBe('2024-01-15');
  });

  it('reads European dotted dates', () => {
    expect(normalizeLabDate('15.01.2024')).toBe('2024-01-15');
    expect(normalizeLabDate('5.1.2024')).toBe('2024-01-05');
  });

  it('reads slashed dates only when the order is clear', () => {
    expect(normalizeLabDate('15/01/2024')).toBe('2024-01-15');
    expect(normalizeLabDate('01/15/2024')).toBe('2024-01-15');
    expect(normalizeLabDate('2024/01/15')).toBe('2024-01-15');
    // Day and month could be either way round: ask the user
    expect(normalizeLabDate('03/04/2024')).toBeNull();
  });

  it('reads a date either order fits in the order the user writes dates', () => {
    expect(normalizeLabDate('03/04/2024', 'day-first')).toBe('2024-04-03');
    expect(normalizeLabDate('03/04/2024', 'month-first')).toBe('2024-03-04');
    expect(normalizeLabDate('03-04-2024', 'day-first')).toBe('2024-04-03');
    // A part above 12 still settles it, whatever the user's order
    expect(normalizeLabDate('15/01/2024', 'month-first')).toBe('2024-01-15');
    expect(normalizeLabDate('03-04-2024')).toBeNull();
    // Mixed separators are no date
    expect(normalizeLabDate('03/04-2024', 'day-first')).toBeNull();
  });

  it.each(['Jan 15 2024', '2024-13-01', '2024-02-30', '31.02.2024', '', null, undefined])(
    'rejects %s',
    (value) => {
      expect(normalizeLabDate(value)).toBeNull();
    }
  );
});

describe('reviewedLabDate', () => {
  it('uses the date set in review over the detected one', () => {
    expect(reviewedLabDate({ labDate: '2024-01-15', editedLabDate: '2024-02-20' })).toBe(
      '2024-02-20'
    );
    expect(reviewedLabDate({ labDate: '15.01.2024' })).toBe('2024-01-15');
  });

  it('treats a date cleared in review as no date', () => {
    expect(reviewedLabDate({ labDate: '2024-01-15', editedLabDate: '' })).toBeNull();
  });
});

describe('dayOrderOf', () => {
  it('reads the order of day and month from the date format setting', () => {
    expect(dayOrderOf('DD/MM/YYYY')).toBe('day-first');
    expect(dayOrderOf('MM/DD/YYYY')).toBe('month-first');
    // Year first says nothing of how a report's day and month are written
    expect(dayOrderOf('YYYY-MM-DD')).toBeUndefined();
    expect(dayOrderOf(undefined)).toBeUndefined();
  });
});
