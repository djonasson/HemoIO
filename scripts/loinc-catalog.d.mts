// Types for the plain-Node catalog generator, so app tests can build a
// catalog from the fixtures
import type { CatalogFile } from '../src/data/loinc/catalog';

export function buildCatalog(dir: string): CatalogFile;
