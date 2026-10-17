import { describe, it, expect } from 'vitest';
import {
  migrateTestValueRecord,
  migrateNoteRecord,
  migratePreferenceMaps,
} from './biomarkerKeyMigration';

describe('migrateTestValueRecord', () => {
  it('replaces the numeric ID with a key and keeps other fields', () => {
    const migrated = migrateTestValueRecord({ id: 5, biomarkerId: 3, value: 14.5, unit: 'g/dL' });
    expect(migrated).toEqual({ id: 5, biomarkerKey: 'hemoglobin', value: 14.5, unit: 'g/dL' });
  });

  it('is idempotent: records that already have a key are unchanged', () => {
    const record = { id: 5, biomarkerKey: 'glucose', value: 95, unit: 'mg/dL' };
    expect(migrateTestValueRecord(record)).toEqual(record);
    expect(migrateTestValueRecord(migrateTestValueRecord({ id: 1, biomarkerId: 3 }))).toEqual({
      id: 1,
      biomarkerKey: 'hemoglobin',
    });
  });
});

describe('migrateNoteRecord', () => {
  it('migrates a biomarker reference', () => {
    expect(migrateNoteRecord({ id: 1, biomarkerId: 10042, content: 'x' })).toEqual({
      id: 1,
      biomarkerKey: 'unknown:legacy-10042',
      content: 'x',
    });
  });

  it('leaves notes without a biomarker alone', () => {
    expect(migrateNoteRecord({ id: 2, labResultId: 4, content: 'y' })).toEqual({
      id: 2,
      labResultId: 4,
      content: 'y',
    });
  });
});

describe('migratePreferenceMaps', () => {
  it('re-keys personal targets and unit preferences from IDs to keys', () => {
    const migrated = migratePreferenceMaps({
      theme: 'dark',
      personalTargets: { 3: { low: 13 } },
      unitPreferences: { '3': 'g/L' },
    });
    expect(migrated).toEqual({
      theme: 'dark',
      personalTargets: { hemoglobin: { low: 13 } },
      unitPreferences: { hemoglobin: 'g/L' },
    });
  });

  it('is idempotent for maps already keyed by biomarker key', () => {
    const prefs = { personalTargets: { glucose: { high: 99 } }, unitPreferences: {} };
    expect(migratePreferenceMaps(migratePreferenceMaps(prefs))).toEqual(prefs);
  });
});
