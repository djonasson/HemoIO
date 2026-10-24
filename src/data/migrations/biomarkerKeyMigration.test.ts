import { describe, it, expect } from 'vitest';
import {
  migrateTestValueRecord,
  migrateNoteRecord,
  migratePreferenceMaps,
  legacyUnknownKeyMapping,
  remapBiomarkerKey,
  remapPreferenceMaps,
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

describe('legacyUnknownKeyMapping', () => {
  it('maps legacy unknown keys to the key their extracted name gets today', () => {
    const mapping = legacyUnknownKeyMapping([
      { biomarkerKey: 'unknown:legacy-12345', rawText: 'Zorblatin' },
      { biomarkerKey: 'unknown:legacy-12345', rawText: 'Zorblatin' },
      { biomarkerKey: 'unknown:legacy-777', rawText: 'Reticulocytes %' },
    ]);

    expect(Object.fromEntries(mapping)).toEqual({
      'unknown:legacy-12345': 'unknown:zorblatin',
      'unknown:legacy-777': 'unknown:reticulocytes%',
    });
  });

  it('ignores dictionary keys, new unknown keys and values without a name', () => {
    const mapping = legacyUnknownKeyMapping([
      { biomarkerKey: 'glucose', rawText: 'Glucose' },
      { biomarkerKey: 'unknown:zorblatin', rawText: 'Zorblatin' },
      { biomarkerKey: 'unknown:legacy-42', rawText: undefined },
    ]);

    expect(mapping.size).toBe(0);
  });
});

describe('remapBiomarkerKey', () => {
  const mapping = new Map([['unknown:legacy-1', 'unknown:zorblatin']]);

  it('rewrites mapped keys and leaves others unchanged', () => {
    expect(remapBiomarkerKey({ id: 1, biomarkerKey: 'unknown:legacy-1' }, mapping)).toEqual({
      id: 1,
      biomarkerKey: 'unknown:zorblatin',
    });
    const other = { id: 2, biomarkerKey: 'glucose' };
    expect(remapBiomarkerKey(other, mapping)).toBe(other);
    const noKey = { id: 3 };
    expect(remapBiomarkerKey(noKey, mapping)).toBe(noKey);
  });

  it('remaps preference map keys', () => {
    expect(
      remapPreferenceMaps(
        { personalTargets: { 'unknown:legacy-1': { low: 1 } }, unitPreferences: { glucose: 'mmol/L' } },
        mapping
      )
    ).toEqual({
      personalTargets: { 'unknown:zorblatin': { low: 1 } },
      unitPreferences: { glucose: 'mmol/L' },
    });
  });

  it('remaps alert acknowledgements with the other biomarker-keyed maps', () => {
    const acknowledged = '2024-01-15T00:00:00.000Z';
    expect(
      remapPreferenceMaps({ acknowledgedAlerts: { 'unknown:legacy-1': acknowledged } }, mapping)
    ).toEqual({ acknowledgedAlerts: { 'unknown:zorblatin': acknowledged } });
  });
});
