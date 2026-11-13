import { describe, it, expect } from 'vitest';
import { keepReviewEdits } from './keepReviewEdits';
import { manualEntryResult } from './manualEntry';
import type { AnalysisResult } from './AnalysisStep';
import type { ReviewedResult } from './ReviewStep';

function result(fileId: string, success = true): AnalysisResult {
  return {
    fileId,
    fileName: `${fileId}.pdf`,
    success,
    biomarkers: success
      ? ([{ name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.9 }] as AnalysisResult['biomarkers'])
      : [],
    confidence: 0.9,
    warnings: [],
  };
}

function edited(analysed: AnalysisResult): ReviewedResult {
  return { ...analysed, editedBiomarkers: [], editedLabName: 'Edited' };
}

describe('keepReviewEdits', () => {
  it('starts every file afresh on the first review', () => {
    const a = result('a');
    expect(keepReviewEdits([], [], [a])).toEqual([{ ...a, editedBiomarkers: a.biomarkers }]);
  });

  it('keeps the edits of a file whose result did not change', () => {
    const a = result('a');
    const reviewed = edited(a);
    expect(keepReviewEdits([reviewed], [a], [a])[0]).toBe(reviewed);
  });

  it('starts a file analysed again afresh', () => {
    const before = result('a');
    const again = result('a');
    const kept = keepReviewEdits([edited(before)], [before], [again]);
    expect(kept[0].editedLabName).toBeUndefined();
    expect(kept[0].editedBiomarkers).toEqual(again.biomarkers);
  });

  it('adds a file that was not reviewed before, in the order given', () => {
    const a = result('a');
    const b = result('b');
    const reviewedA = edited(a);
    const kept = keepReviewEdits([reviewedA], [a], [b, a]);
    expect(kept.map((r) => r.fileId)).toEqual(['b', 'a']);
    expect(kept[1]).toBe(reviewedA);
  });

  it('drops a file no longer reviewed', () => {
    const a = result('a');
    const b = result('b');
    expect(keepReviewEdits([edited(a), edited(b)], [a, b], [b]).map((r) => r.fileId)).toEqual(['b']);
  });

  it('keeps the values typed in for a file entered manually again', () => {
    const failed = result('a', false);
    const before = manualEntryResult(failed);
    const reviewed = { ...before, editedBiomarkers: result('a').biomarkers };
    expect(keepReviewEdits([reviewed], [before], [manualEntryResult(failed)])[0]).toBe(reviewed);
  });

  it('starts a manually entered file afresh once it is analysed', () => {
    const before = manualEntryResult(result('a', false));
    const analysed = result('a');
    const kept = keepReviewEdits([{ ...before, editedBiomarkers: [] }], [before], [analysed]);
    expect(kept[0].manualEntry).toBeUndefined();
    expect(kept[0].editedBiomarkers).toEqual(analysed.biomarkers);
  });
});
