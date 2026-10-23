import { describe, it, expect } from 'vitest';
import { normalizeLabDate } from './labDate';

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
    // Day and month could be either way round: ask the user
    expect(normalizeLabDate('03/04/2024')).toBeNull();
  });

  it.each(['Jan 15 2024', '2024-13-01', '2024-02-30', '31.02.2024', '', null, undefined])(
    'rejects %s',
    (value) => {
      expect(normalizeLabDate(value)).toBeNull();
    }
  );
});
