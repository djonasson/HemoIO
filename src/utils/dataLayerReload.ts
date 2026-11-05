/**
 * Development server only: reload the page instead of hot-updating it when
 * the update would re-run data-layer code.
 *
 * A hot update re-runs changed modules, but the objects made from the old
 * code (the open database, the unlocked EncryptedDb, sync closures) keep
 * running. After many updates a tab ran a mix of old and new database code and
 * its saves stopped reaching IndexedDB. A full reload starts one version.
 *
 * See docs/superpowers/specs/2026-10-30-dev-reload-db-design.md.
 */
import type { Plugin } from 'vite';

/** The module-graph facts the decision needs; Vite's module nodes have them */
export interface HotModule {
  file: string | null;
  isSelfAccepting?: boolean;
  importers: Iterable<HotModule>;
  importedModules: Iterable<HotModule>;
}

/** Folders of src/data holding reference data, not user data */
const REFERENCE_DATA = ['biomarkers', 'loinc'];

/**
 * Database, storage, encryption and migrations. The LOINC catalog, its
 * add-ons and names are reference data with no connection or user state, and
 * most screens import them: counting them would reload (and lock) the app on
 * most UI edits.
 */
export function isDataLayerFile(file: string | null, root: string): boolean {
  if (!file?.startsWith(`${root}/src/data/`)) return false;
  return !REFERENCE_DATA.some((folder) => file.startsWith(`${root}/src/data/${folder}/`));
}

function touchesDataLayer(module: HotModule, root: string): boolean {
  if (isDataLayerFile(module.file, root)) return true;
  for (const imported of module.importedModules) {
    if (isDataLayerFile(imported.file, root)) return true;
  }
  return false;
}

/**
 * Whether the update to `changed` would re-run a data-layer module, or a
 * module that imports one. These are the changed modules and their importers,
 * up to the modules that accept their own updates, where Vite stops.
 */
export function needsFullReload(changed: Iterable<HotModule>, root: string): boolean {
  const seen = new Set<HotModule>();
  const pending = [...changed];
  while (pending.length > 0) {
    const module = pending.pop()!;
    if (seen.has(module)) continue;
    seen.add(module);
    if (touchesDataLayer(module, root)) return true;
    if (!module.isSelfAccepting) pending.push(...module.importers);
  }
  return false;
}

export function dataLayerReload(): Plugin {
  let root = '';
  return {
    name: 'hemoio:data-layer-reload',
    apply: 'serve',
    configResolved(config) {
      root = config.root;
    },
    hotUpdate: {
      // After the other plugins, so the decision covers every module they add
      order: 'post',
      handler({ file, modules }) {
        if (this.environment.config.consumer !== 'client') return;
        if (!needsFullReload(modules, root)) return;
        // Reloading locks the app: the terminal says why
        this.environment.logger.info(`data layer changed, page reload ${file}`, { timestamp: true });
        this.environment.hot.send({ type: 'full-reload', triggeredBy: file });
        // Nothing left for Vite to hot-update
        return [];
      },
    },
  };
}
