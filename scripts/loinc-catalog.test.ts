import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { buildCatalog } from './loinc-catalog.mjs';

const FILES = path.join(__dirname, '__fixtures__', 'loinc', '2.83', 'files');

describe('buildCatalog', () => {
  const catalog = buildCatalog(FILES);
  const find = (code: string) => catalog.tests.find((t) => t.code === code);

  it('keeps only active laboratory codes with a common-test rank', () => {
    const codes = catalog.tests.map((t) => t.code);
    expect(codes).not.toContain('10876-1'); // not ACTIVE
    expect(codes).not.toContain('10157-6'); // CLASSTYPE 2
    expect(codes).not.toContain('100746-7'); // no rank
    expect(codes).toContain('2345-7');
    expect(codes).toContain('718-7');
  });

  it('keeps an unranked code the add-on table describes', () => {
    expect(find('107184-4')).toMatchObject({ name: 'Spermatozoa [#] in Semen', rank: 0 });
  });

  it('copies the LOINC fields', () => {
    expect(find('2345-7')).toMatchObject({
      name: 'Glucose [Mass/volume] in Serum or Plasma',
      component: 'Glucose',
      property: 'MCnc',
      system: 'Ser/Plas',
      scale: 'Qn',
      classCode: 'CHEM',
    });
    expect(find('2345-7')!.rank).toBeGreaterThan(0);
  });

  it('adds Italian names', () => {
    expect(find('2345-7')!.names).toContain('glucosio');
    expect(find('718-7')!.names).toContain('emoglobina');
  });

  it('ignores the Italian related-name sentence, which is not a list', () => {
    expect(find('2345-7')!.names.some((n) => n.startsWith('chimica concentrazione'))).toBe(false);
  });

  it('ignores the Italian related-name sentence even when it holds a ";"', () => {
    // Its ";" ends an HTML entity ("proteine sieriche &amp; proteine urinarie"), not a name
    const names = find('102975-0')!.names;
    expect(names).toContain('ratto, epitelio+proteine sieriche+proteine urinarie ab.ige');
    expect(names.filter((n) => n.includes('&amp') || n.includes('punto nel tempo'))).toEqual([]);
  });

  it('normalises names and removes duplicates', () => {
    const names = find('2345-7')!.names;
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n === n.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim())).toBe(true);
  });

  it('lists example UCUM units', () => {
    expect(find('2345-7')!.units).toContain('mg/dL');
    expect(find('751-8')!.units).toContain('10*3/uL');
  });

  it('links groups', () => {
    expect(find('2345-7')!.groups).toContain('LG7967-5');
    const group = catalog.groups.find((g) => g.id === 'LG7967-5');
    expect(group).toMatchObject({ parentId: 'LG100-4' });
    expect(group!.parentName).toContain('Chem_DrugTox');
    expect(group!.name).toBe('Glucose|MCnc|Pt|ANYBldSerPl');
  });

  it('lists only groups that contain a kept test', () => {
    const used = new Set(catalog.tests.flatMap((t) => t.groups));
    expect(catalog.groups.length).toBeGreaterThan(0);
    expect(catalog.groups.every((g) => used.has(g.id))).toBe(true);
  });

  it('reads the version from the folder', () => {
    expect(catalog.version).toBe('2.83');
  });

  it('sorts tests by code', () => {
    const codes = catalog.tests.map((t) => t.code);
    expect(codes).toEqual([...codes].sort());
  });
});
