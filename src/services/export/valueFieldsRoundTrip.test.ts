/**
 * A value's method, an interval's ends and a qualitative result as printed
 * survive a backup and a restore
 */

import { describe, it, expect } from 'vitest';
import { openTestDb } from '@data/db/testDb';
import { parseBackupJson } from '../import/jsonImport';
import { exportToJson } from './jsonExport';

describe('value fields round trip', () => {
  it("keeps the method, the interval, the printed qualitative result, a censored value's comparator, the lab's flag and the range's unit", async () => {
    const { db } = await openTestDb();
    const now = new Date('2024-01-15T10:00:00.000Z');
    const labResultId = await db.addLabResult({ date: now, labName: 'Lab', createdAt: now, updatedAt: now });
    const kept = [
      { biomarkerKey: '2345-7', value: 95, unit: 'mg/dL', method: 'Enzymatic' },
      {
        biomarkerKey: 'unknown:eritrociti',
        value: 7.5,
        unit: '/[HPF]',
        numericValueType: 'interval' as const,
        intervalLow: 5,
        intervalHigh: 10,
      },
      { biomarkerKey: '25145-4', value: 'Assenti', unit: '', qualitativeType: 'boolean' as const, ordinalValue: 0 },
      {
        biomarkerKey: '14749-6',
        value: 10,
        unit: 'mg/dL',
        censored: '<' as const,
        labFlag: 'low' as const,
        referenceRangeLow: 3.9,
        referenceRangeUnit: 'mmol/L',
      },
    ];
    await db.addTestValues(kept.map((value) => ({ ...value, labResultId, createdAt: now, updatedAt: now })));

    const exported = await db.exportAllData();
    const json = exportToJson({ ...exported, userPreferences: null, settings: null });
    const { labResults, testValues, userNotes } = parseBackupJson(json);
    await db.replaceLabData({ labResults, testValues, userNotes });

    const restored = await db.getAllTestValues();
    expect(restored).toEqual(expect.arrayContaining(kept.map((value) => expect.objectContaining(value))));
  });
});
