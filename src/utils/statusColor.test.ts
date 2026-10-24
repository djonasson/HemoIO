import { describe, it, expect } from 'vitest';
import { statusColor } from './statusColor';

describe('statusColor', () => {
  it('colours each test value status', () => {
    expect(statusColor('high')).toBe('red');
    expect(statusColor('low')).toBe('orange');
    expect(statusColor('normal')).toBe('green');
  });

  it('is grey for a value without a status', () => {
    expect(statusColor('unknown')).toBe('gray');
    expect(statusColor(undefined)).toBe('gray');
  });
});
