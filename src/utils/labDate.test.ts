import { describe, it, expect } from 'vitest';
import { normalizeLabDate } from './labDate';

describe('normalizeLabDate', () => {
  it('keeps ISO days', () => {
    expect(normalizeLabDate('2024-01-15')).toBe('2024-01-15');
    expect(normalizeLabDate('2024-01-15T00:00:00Z')).toBe('2024-01-15');
  });

  it.each(['15/01/2024', 'Jan 15 2024', '2024-13-01', '2024-02-30', '', null, undefined])(
    'rejects %s',
    (value) => {
      expect(normalizeLabDate(value)).toBeNull();
    }
  );
});
