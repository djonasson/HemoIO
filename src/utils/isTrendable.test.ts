import { describe, it, expect } from 'vitest';
import { isTrendable } from './isTrendable';

describe('isTrendable', () => {
  it('charts numeric values', () => {
    expect(isTrendable({ value: 5.2 })).toBe(true);
    expect(isTrendable({ value: 0 })).toBe(true);
  });

  it('does not chart qualitative values', () => {
    expect(isTrendable({ value: 'Negative' })).toBe(false);
    expect(isTrendable({ value: true })).toBe(false);
  });
});
