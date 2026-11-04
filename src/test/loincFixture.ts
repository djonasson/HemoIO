/**
 * A small LOINC catalog built from the fixture release in
 * scripts/__fixtures__/loinc, for tests that need real catalog rows
 */
import path from 'node:path';
import { buildCatalog } from '../../scripts/loinc-catalog.mjs';
import { createCatalog } from '@data/loinc/catalog';
import type { Catalog, CatalogFile } from '@data/loinc/catalog';

const FIXTURE_FILES = path.resolve(__dirname, '../../scripts/__fixtures__/loinc/2.83/files');

export function fixtureCatalogFile(): CatalogFile {
  return buildCatalog(FIXTURE_FILES);
}

export function fixtureCatalog(): Catalog {
  return createCatalog(fixtureCatalogFile());
}
