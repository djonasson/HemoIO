import { describe, it, expect } from 'vitest';
import {
  migrateTestValueRecord,
  migrateNoteRecord,
  migratePreferenceMaps,
  legacyUnknownKeyMapping,
  remapBiomarkerKey,
  remapPreferenceMaps,
  reconcileTestValueKey,
  refileMisfiledValue,
  refileMisfiledPreferences,
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
      { biomarkerKey: 'unknown:legacy-777', rawText: 'IG%' },
    ]);

    expect(Object.fromEntries(mapping)).toEqual({
      'unknown:legacy-12345': 'unknown:zorblatin',
      'unknown:legacy-777': 'unknown:ig%',
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

describe('reconcileTestValueKey', () => {
  it('gives a legacy value the dictionary key a new import of its name gets', () => {
    // New imports match names loosely ("HEMOGLOBIN." is Hemoglobin)
    expect(
      reconcileTestValueKey({ biomarkerKey: 'unknown:legacy-1', rawText: 'HEMOGLOBIN.', unit: 'g/dL' })
        .biomarkerKey
    ).toBe('hemoglobin');
  });

  it('keeps a legacy value unknown when its unit does not fit the matching name', () => {
    expect(
      reconcileTestValueKey({ biomarkerKey: 'unknown:legacy-1', rawText: 'Hemoglobin', unit: 'IU/L' })
        .biomarkerKey
    ).toBe('unknown:hemoglobin');
  });

  it('keys each value by its own name, also when two names shared a legacy hash', () => {
    const shared = 'unknown:legacy-90902';
    expect(
      reconcileTestValueKey({ biomarkerKey: shared, rawText: 'Free PSA', unit: 'ng/mL' }).biomarkerKey
    ).not.toBe(
      reconcileTestValueKey({ biomarkerKey: shared, rawText: 'Zorblatin', unit: 'mg/dL' }).biomarkerKey
    );
  });

  it('leaves values that are not legacy unknowns, or have no name, as they are', () => {
    const glucose = { biomarkerKey: 'glucose', rawText: 'Glucose', unit: 'mg/dL' };
    expect(reconcileTestValueKey(glucose)).toBe(glucose);
    const unnamed = { biomarkerKey: 'unknown:legacy-3', unit: 'u' };
    expect(reconcileTestValueKey(unnamed)).toBe(unnamed);
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

describe('refileMisfiledValue', () => {
  const value = (biomarkerKey: string, rawText: string | undefined, unit: string) => ({
    biomarkerKey,
    rawText,
    unit,
    value: 1,
  });

  it('moves urea, once filed as its alias of blood urea nitrogen, to urea', () => {
    expect(refileMisfiledValue(value('blood-urea-nitrogen', 'Urea', 'mg/dL')).biomarkerKey).toBe('urea');
    expect(refileMisfiledValue(value('blood-urea-nitrogen', 'UREA', 'mmol/L')).biomarkerKey).toBe('urea');
  });

  it('leaves blood urea nitrogen reported as such', () => {
    for (const rawText of ['BUN', 'Blood Urea Nitrogen', 'Urea Nitrogen', undefined]) {
      expect(refileMisfiledValue(value('blood-urea-nitrogen', rawText, 'mg/dL')).biomarkerKey).toBe(
        'blood-urea-nitrogen'
      );
    }
  });

  it('moves urine red cell counts out of urine blood, by their unit', () => {
    for (const unit of ['cell/µL', 'cells/µL', '/μL', 'RBC/HPF', 'per campo']) {
      expect(refileMisfiledValue(value('urine-blood', 'Eritrociti (urine)', unit)).biomarkerKey).toBe(
        'urine-red-blood-cells'
      );
    }
  });

  it('leaves the dipstick haemoglobin in urine blood', () => {
    for (const unit of ['mg/dL', 'mg/L', '']) {
      expect(refileMisfiledValue(value('urine-blood', 'Emoglobina (urine)', unit)).biomarkerKey).toBe(
        'urine-blood'
      );
    }
  });

  it('leaves every other value as it is', () => {
    const glucose = value('glucose', 'Urea', 'mg/dL');
    expect(refileMisfiledValue(glucose)).toBe(glucose);
  });
});

describe('refileMisfiledPreferences', () => {
  it('moves a preferred red cell count unit from urine blood to urine red blood cells', () => {
    expect(refileMisfiledPreferences({ unitPreferences: { 'urine-blood': 'cells/µL', glucose: 'mmol/L' } })).toEqual({
      unitPreferences: { 'urine-red-blood-cells': 'cells/µL', glucose: 'mmol/L' },
    });
  });

  it('keeps a preferred dipstick unit, and one already set for red cells', () => {
    const prefs = { unitPreferences: { 'urine-blood': 'mg/dL', 'urine-red-blood-cells': '/HPF' } };
    expect(refileMisfiledPreferences(prefs)).toEqual(prefs);
  });
});

