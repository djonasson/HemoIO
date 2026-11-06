import { describe, it, expect } from 'vitest';
import { pluralize } from './pluralize';

describe('pluralize', () => {
  it('adds an s to every count but 1', () => {
    expect(pluralize(0, 'record')).toBe('0 records');
    expect(pluralize(1, 'record')).toBe('1 record');
    expect(pluralize(3, 'lab result')).toBe('3 lab results');
  });
});
