import { describe, it, expect } from 'vitest';
import { resultsToSave } from './resultsToSave';

describe('resultsToSave', () => {
  it('keeps the files that have values and leaves out the rest', () => {
    const withValues = { fileName: 'a.pdf', editedBiomarkers: [{ name: 'Glucose' }] };
    const empty = { fileName: 'b.pdf', editedBiomarkers: [] };
    expect(resultsToSave([withValues, empty])).toEqual([withValues]);
  });
});
