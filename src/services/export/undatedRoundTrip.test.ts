/**
 * An undated result survives a backup and a restore, as a real database
 * holds it: the data-loss bug was a backup that left it out
 */

import { describe, it, expect } from 'vitest';
import { openTestDb } from '@data/db/testDb';
import { parseBackupJson } from '../import/jsonImport';
import type { ParsedBackupData } from '../import/jsonImport';
import { exportToJson } from './jsonExport';

/** What the restore hands to the database */
function restorable({ labResults, testValues, userNotes }: ParsedBackupData) {
  return { labResults, testValues, userNotes };
}

describe('undated lab result round trip', () => {
  it('is kept, with its values, through a restore, a backup and another restore', async () => {
    const { db } = await openTestDb();
    const stamp = '2024-01-15T10:00:00.000Z';
    const backup = JSON.stringify({
      schemaVersion: 4,
      exportedAt: stamp,
      appVersion: '1.0.0',
      labResults: [{ id: 1, date: null, labName: 'Undated Clinic', createdAt: stamp, updatedAt: stamp }],
      testValues: [
        {
          id: 1,
          labResultId: 1,
          biomarkerKey: '718-7',
          rawText: 'Hemoglobin',
          value: 14.5,
          unit: 'g/dL',
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
      userNotes: [],
      userPreferences: null,
      settings: null,
    });

    await db.replaceLabData(restorable(parseBackupJson(backup)));
    const exported = await db.exportAllData();
    expect(exported.labResults).toHaveLength(1);
    const json = exportToJson({
      labResults: exported.labResults,
      testValues: exported.testValues,
      userNotes: exported.userNotes,
      userPreferences: null,
      settings: null,
    });

    await db.replaceLabData(restorable(parseBackupJson(json)));

    const undated = await db.getUndatedLabResults();
    expect(undated.map((r) => r.labName)).toEqual(['Undated Clinic']);
    const values = await db.getTestValuesByLabResult(undated[0].id!);
    expect(values.map((v) => v.value)).toEqual([14.5]);
  });
});
