/**
 * Versions of installed packages, read when the build (vite.config.ts), the
 * unit tests (vitest.config.ts) or the E2E tests start, so no file repeats a
 * version that an upgrade would leave stale.
 */

import { readFileSync } from 'fs';

/** The version of a package installed in node_modules */
export function installedVersion(pkg: string): string {
  return JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, 'utf8')).version;
}

/** The UCUM library the app converts units with, named in its notice */
export const UCUM_LHC_VERSION = installedVersion('@lhncbc/ucum-lhc');
