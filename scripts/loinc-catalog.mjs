#!/usr/bin/env node
// Builds the app's LOINC catalog (src/data/loinc/catalog.generated.json) from
// a LOINC release downloaded by scripts/loinc-download.sh. See docs/LOINC.md.
//
// Usage: node scripts/loinc-catalog.mjs [--from <files dir>] [--out <path>]
//
// This is plain Node (no TypeScript, no dependencies) so it runs without a
// build step; the JSON shape is mirrored by the types in
// src/data/loinc/catalog.ts (and scripts/loinc-catalog.d.mts).

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'loinc',
  'catalog.generated.json',
);

/**
 * Codes kept although LOINC gives them no common-test rank: two the app's
 * add-on table (src/data/loinc/addons.ts) describes, eGFR by CKD-EPI 2021
 * and the total sperm count, and molar urea in serum, which Italian labs
 * report in mmol/L and which trends with urea in mg/dL.
 */
const EXTRA_CODES = new Set(['98979-8', '107184-4', '22664-7']);

/**
 * Whether a LOINC parent group joins mass and molar codes ("MassMolConc<SAME:
 * Comp|Tm|Sys|Meth><Prop:MCncORSCncORMSCnc>"). Duplicates joinsMassAndMolar
 * in src/data/loinc/catalog.ts, which reads it the same way at runtime.
 * @param {string} parentName
 * @returns {boolean}
 */
function joinsMassAndMolar(parentName) {
  const same = parentName.match(/<SAME:([^>]*)>/)?.[1];
  const property = parentName.match(/<Prop:([^>]*)>/)?.[1];
  return (
    same !== undefined &&
    !same.includes('Prop') &&
    property !== undefined &&
    property.includes('MCnc') &&
    property.includes('SCnc')
  );
}

/**
 * Parse CSV text into rows, one object per record keyed by the header.
 * Handles quoted fields with embedded commas and newlines, and "" escapes.
 * A generator, so a release's 100 MB table is never held as row objects.
 * @param {string} text
 * @returns {Generator<Record<string, string>>}
 */
export function* parseCsv(text) {
  let header = null;
  let row = [];
  let field = '';
  let quoted = false;
  const endRecord = () => {
    row.push(field);
    field = '';
    const record = row;
    row = [];
    if (header === null) {
      header = record.map((name, i) => (i === 0 ? name.replace(/^﻿/, '') : name));
      return null;
    }
    // A blank line parses as a single empty field
    if (record.length === 1 && record[0] === '') return null;
    const obj = {};
    header.forEach((name, i) => {
      obj[name] = record[i] ?? '';
    });
    return obj;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      const obj = endRecord();
      if (obj) yield obj;
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    const obj = endRecord();
    if (obj) yield obj;
  }
}

/**
 * A name as every lookup reads it: case, spacing, accent encoding and the
 * accents of Latin letters aside.
 * Duplicates nameKey in src/data/loinc/keys.ts because this script
 * is plain Node and cannot import the app's TypeScript.
 * @param {string} name
 * @returns {string}
 */
export function nameKey(name) {
  return name
    .normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .replace(/(\p{L})'(?=\s|$)/gu, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param {string} file */
function readRows(file) {
  return parseCsv(fs.readFileSync(file, 'utf8'));
}

/** @param {string} value */
function splitList(value) {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * LOINC's abbreviation of a component of one part, which leads its short
 * name: "Hct" of "Hct VFr Bld Auto" (hematocrit, "Erythrocyte/Blood"),
 * "Prot" of "Prot SerPl-mCnc". A component of several words or parts
 * ("Bilirubin.direct", "Cholesterol in HDL") has its abbreviation spread
 * over the short name, so it gets none.
 * @param {Record<string, string>} row a Loinc.csv row
 * @returns {string | undefined}
 */
function componentAbbreviation(row) {
  if (/[.^\s]/.test(row.COMPONENT)) return undefined;
  const [head] = (row.SHORTNAME ?? '').split(' ');
  return /\p{L}/u.test(head ?? '') ? head : undefined;
}

/**
 * Build the catalog from a release's `files` folder. The version is the name
 * of the folder that holds it (<version>/files), as the download script lays
 * it out.
 * @param {string} dir the release's `files` folder
 * @returns {import('../src/data/loinc/catalog').CatalogFile}
 */
export function buildCatalog(dir) {
  const version = path.basename(path.dirname(path.resolve(dir)));

  /** Italian names by LOINC code */
  const italian = new Map();
  const linguistic = path.join(dir, 'AccessoryFiles', 'LinguisticVariants', 'itIT16LinguisticVariant.csv');
  if (fs.existsSync(linguistic)) {
    for (const row of readRows(linguistic)) {
      // The Italian RELATEDNAMES2 is one space-joined sentence of property and
      // system words, not a ";" list like the English one: a ";" in it ends an
      // HTML entity ("&amp;") or a clause, never a name. As names its parts
      // would only add noise, so only the component is used.
      italian.set(row.LOINC_NUM, [row.COMPONENT]);
    }
  }

  const groupsByCode = new Map();
  const groupDir = path.join(dir, 'AccessoryFiles', 'GroupFile');
  for (const row of readRows(path.join(groupDir, 'GroupLoincTerms.csv'))) {
    const list = groupsByCode.get(row.LoincNumber) ?? new Set();
    list.add(row.GroupId);
    groupsByCode.set(row.LoincNumber, list);
  }

  const parentNames = new Map();
  for (const row of readRows(path.join(groupDir, 'ParentGroup.csv'))) {
    parentNames.set(row.ParentGroupId, row.ParentGroup);
  }
  const groupRows = [...readRows(path.join(groupDir, 'Group.csv'))];
  const massMolarGroups = new Set(
    groupRows.filter((row) => joinsMassAndMolar(parentNames.get(row.ParentGroupId) ?? '')).map((row) => row.GroupId),
  );

  const tests = [];
  /**
   * Unranked codes that convert by mass and moles with others: kept once the
   * table is read if a ranked code shares their group, as a value printed in
   * the other unit ("Fasting glucose" in mmol/L) is that test all the same
   */
  const partners = [];
  const rankedGroups = new Set();
  for (const row of readRows(path.join(dir, 'LoincTable', 'Loinc.csv'))) {
    // CLASSTYPE 1 is laboratory; a rank of 0 or none marks a rarely used code
    const parsedRank = Number.parseInt(row.COMMON_TEST_RANK, 10);
    const rank = parsedRank > 0 ? parsedRank : 0;
    if (row.STATUS !== 'ACTIVE' || row.CLASSTYPE !== '1') continue;
    const massMolar = [...(groupsByCode.get(row.LOINC_NUM) ?? [])].filter((id) => massMolarGroups.has(id));
    if (rank > 0) massMolar.forEach((id) => rankedGroups.add(id));
    const partner = rank === 0 && !EXTRA_CODES.has(row.LOINC_NUM);
    if (partner && massMolar.length === 0) continue;
    const names = new Set();
    for (const raw of [
      row.COMPONENT,
      componentAbbreviation(row),
      ...splitList(row.RELATEDNAMES2),
      row.SHORTNAME,
      ...(italian.get(row.LOINC_NUM) ?? []),
    ]) {
      const key = nameKey(raw ?? '');
      if (key) names.add(key);
    }
    (partner ? partners : tests).push({
      code: row.LOINC_NUM,
      name: row.LONG_COMMON_NAME,
      shortName: row.SHORTNAME,
      component: row.COMPONENT,
      property: row.PROPERTY,
      system: row.SYSTEM,
      scale: row.SCALE_TYP,
      method: row.METHOD_TYP,
      classCode: row.CLASS,
      names: [...names].sort(),
      units: splitList(row.EXAMPLE_UCUM_UNITS),
      rank,
      groups: [...(groupsByCode.get(row.LOINC_NUM) ?? [])].sort(),
    });
  }
  tests.push(...partners.filter((test) => test.groups.some((id) => rankedGroups.has(id))));
  tests.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

  const usedGroups = new Set(tests.flatMap((t) => t.groups));
  const groups = [];
  for (const row of groupRows) {
    if (!usedGroups.has(row.GroupId)) continue;
    groups.push({
      id: row.GroupId,
      parentId: row.ParentGroupId,
      parentName: parentNames.get(row.ParentGroupId) ?? '',
      name: row.Group,
    });
  }
  groups.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { version, tests, groups };
}

/**
 * The `files` folder of the latest complete release under `root`, by the rule
 * of latest_local in loinc-download.sh: newest version first, and complete
 * means metadata.json, a zip matching its MD5 and the unzipped files folder.
 * @param {string} root
 * @returns {string | undefined}
 */
export function latestLocalFiles(root) {
  if (!fs.existsSync(root)) return undefined;
  const versions = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  for (const name of versions) {
    const base = path.join(root, name);
    const zip = path.join(base, `Loinc_${name}.zip`);
    const meta = path.join(base, 'metadata.json');
    if (!fs.existsSync(meta) || !fs.existsSync(zip) || !fs.existsSync(path.join(base, 'files'))) continue;
    try {
      const info = JSON.parse(fs.readFileSync(meta, 'utf8'));
      const md5 = createHash('md5').update(fs.readFileSync(zip)).digest('hex');
      if (info.version === name && String(info.downloadMD5Hash ?? '').toLowerCase() === md5) {
        return path.join(base, 'files');
      }
    } catch {
      // unreadable metadata: not complete
    }
  }
  return undefined;
}

function main() {
  const args = process.argv.slice(2);
  let from;
  let out = DEFAULT_OUT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from') from = args[++i];
    else if (args[i] === '--out') out = args[++i];
    else {
      console.error('Usage: node scripts/loinc-catalog.mjs [--from <files dir>] [--out <path>]');
      process.exit(args[i] === '--help' || args[i] === '-h' ? 0 : 1);
    }
  }
  if (!from) {
    const root = process.env.LOINC_DIR || path.join(os.homedir(), 'loinc');
    from = latestLocalFiles(root);
    if (!from) {
      console.error(`No complete LOINC release found in ${root}. Run npm run loinc:download first.`);
      process.exit(1);
    }
  }
  const catalog = buildCatalog(from);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(catalog));
  console.log(`LOINC ${catalog.version}: ${catalog.tests.length} tests, ${catalog.groups.length} groups -> ${out}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
