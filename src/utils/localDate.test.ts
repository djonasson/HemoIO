import { describe, it, expect } from 'vitest';
import { endOfDay, isWithinDays, toLocalDay, toLocalDayString } from './localDate';

describe('toLocalDay', () => {
  it('reads a picker day as local midnight', () => {
    const day = toLocalDay('2024-01-15');
    expect([day?.getFullYear(), day?.getMonth(), day?.getDate(), day?.getHours()]).toEqual([
      2024, 0, 15, 0,
    ]);
  });

  it('passes dates through and rejects empty or invalid values', () => {
    const date = new Date(2024, 0, 15);
    expect(toLocalDay(date)).toBe(date);
    expect(toLocalDay(null)).toBeNull();
    expect(toLocalDay('')).toBeNull();
    expect(toLocalDay('not a date')).toBeNull();
  });
});

describe('isWithinDays', () => {
  const noon = new Date('2024-01-15T12:00:00Z');

  it('includes the whole start and end day', () => {
    expect(isWithinDays(noon, toLocalDay('2024-01-15'), toLocalDay('2024-01-15'))).toBe(true);
    expect(endOfDay(new Date(2024, 0, 15)).getHours()).toBe(23);
  });

  it('excludes days outside the range, and allows open ends', () => {
    expect(isWithinDays(noon, toLocalDay('2024-01-16'), null)).toBe(false);
    expect(isWithinDays(noon, null, toLocalDay('2024-01-14'))).toBe(false);
    expect(isWithinDays(noon, null, null)).toBe(true);
  });
});

describe('toLocalDayString', () => {
  it('writes the local day, padded', () => {
    expect(toLocalDayString(new Date(2024, 0, 5, 23, 30))).toBe('2024-01-05');
    expect(toLocalDayString(new Date(2024, 11, 31, 0, 0))).toBe('2024-12-31');
  });
});
