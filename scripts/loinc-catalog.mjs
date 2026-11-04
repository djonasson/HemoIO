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
 * Codes kept although LOINC gives them no common-test rank, because the app's
 * add-on table (src/data/loinc/addons.ts) describes them: eGFR by CKD-EPI
 * 2021 and the total sperm count.
 */
const EXTRA_CODES = new Set(['98979-8', '107184-4']);

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
 * A name as every lookup reads it: case, spacing and accent encoding aside.
 * Duplicates nameKey in src/data/biomarkers/dictionary.ts because this script
 * is plain Node and cannot import the app's TypeScript.
 * @param {string} name
 * @returns {string}
 */
export function nameKey(name) {
  return name.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
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
 * Build the catalog from a release's `files` folder. The version is the name
 * of the folder that holds it (<version>/files), as the download script lays
 * it out.
 * @param {string} dir the release's `files` folder
 * @returns {{ version: string, tests: object[], groups: object[] }} a CatalogFile
 */
export function buildCatalog(dir) {
  const version = path.basename(path.dirname(path.resolve(dir)));

  /** Italian names by LOINC code */
  const italian = new Map();
  const linguistic = path.join(dir, 'AccessoryFiles', 'LinguisticVariants', 'itIT16LinguisticVariant.csv');
  if (fs.existsSync(linguistic)) {
    for (const row of readRows(linguistic)) {
      // The Italian RELATEDNAMES2 is one space-joined sentence of property and
      // system words, not a ";" list like the English one; as a single name it
      // would match nothing, so it is used only when it is a real list.
      const related = row.RELATEDNAMES2.includes(';') ? splitList(row.RELATEDNAMES2) : [];
      italian.set(row.LOINC_NUM, [row.COMPONENT, ...related]);
    }
  }

  const groupsByCode = new Map();
  const groupDir = path.join(dir, 'AccessoryFiles', 'GroupFile');
  for (const row of readRows(path.join(groupDir, 'GroupLoincTerms.csv'))) {
    const list = groupsByCode.get(row.LoincNumber) ?? new Set();
    list.add(row.GroupId);
    groupsByCode.set(row.LoincNumber, list);
  }

  const tests = [];
  for (const row of readRows(path.join(dir, 'LoincTable', 'Loinc.csv'))) {
    // CLASSTYPE 1 is laboratory; a rank of 0 or none marks a rarely used code
    const parsedRank = Number.parseInt(row.COMMON_TEST_RANK, 10);
    const rank = parsedRank > 0 ? parsedRank : 0;
    if (row.STATUS !== 'ACTIVE' || row.CLASSTYPE !== '1') continue;
    if (rank === 0 && !EXTRA_CODES.has(row.LOINC_NUM)) continue;
    const names = new Set();
    for (const raw of [
      row.COMPONENT,
      ...splitList(row.RELATEDNAMES2),
      row.SHORTNAME,
      ...(italian.get(row.LOINC_NUM) ?? []),
    ]) {
      const key = nameKey(raw ?? '');
      if (key) names.add(key);
    }
    tests.push({
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
  tests.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

  const usedGroups = new Set(tests.flatMap((t) => t.groups));
  const parentNames = new Map();
  for (const row of readRows(path.join(groupDir, 'ParentGroup.csv'))) {
    parentNames.set(row.ParentGroupId, row.ParentGroup);
  }
  const groups = [];
  for (const row of readRows(path.join(groupDir, 'Group.csv'))) {
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
