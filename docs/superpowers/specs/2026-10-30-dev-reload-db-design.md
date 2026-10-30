# Full Reload for Data-Layer Changes in Development — Design

**Date:** 2026-10-30
**Branch:** `fix/dev-reload-db`

## Problem

A tab stayed open all afternoon while the Vite dev server hot-replaced the
database code dozens of times. Hot replacement re-runs a changed module and the
modules above it, but objects created earlier (the unlocked `EncryptedDb`, the
Dexie instance, sync closures) keep running the old code. The tab ended up
running a mix of old and new DB code, and its saves stopped reaching IndexedDB.

Reproduced on the current tree: editing `src/data/db/encryptedDb.ts`,
`src/data/db/index.ts`, `src/data/encryption/index.ts` or
`src/data/storage/FileSystemStorageProvider.ts` is hot-replaced (no reload). The
React plugin cannot Fast Refresh `AuthContext.tsx` and invalidates it, and the
update is then accepted further up (`App.tsx` and the other contexts). So no
edit to the data layer ever reloads the page.

## Decision

A small dev-only Vite plugin (`src/utils/dataLayerReload.ts`, registered in
`vite.config.ts` with `apply: 'serve'`) that uses the `hotUpdate` hook. Before
Vite hot-replaces anything, it walks the modules the update would re-run: the
changed module, then its importers, stopping at modules that accept their own
updates (the boundaries where Vite stops). If any of those modules is

1. a **data-layer module**: `src/data/**`, except the static biomarker
   dictionary in `src/data/biomarkers/`, or
2. a module that **directly imports** a data-layer module (`AuthContext`,
   `useEncryptedDb`, `useFilesystemSync`, setup and storage screens …),

the plugin sends `full-reload` to the browser and returns `[]`, so no partial
update is applied.

This covers the three ways DB code can be re-run in place:

- a data module itself changes;
- a module the data layer imports changes (for example `src/utils/unitSpelling.ts`):
  the update climbs through the data modules, which would re-run;
- a module that uses the data layer changes (for example `AuthContext.tsx`).

### Why not `import.meta.hot.decline()` in the data modules

- Every data module would need the call, and a new file without it would
  silently be hot-replaced again. The plugin matches by folder.
- `decline()` only applies to the module that contains it, so modules that
  import data modules would also need it.
- It adds dev-only code to the data layer. The plugin keeps it in the build
  config.

### Why the biomarker dictionary is excluded

`src/data/biomarkers/` is static reference data. It holds no connection, key or
state, and about twenty screens import it. Treating it as DB code would reload
(and lock) the app on most UI edits. A change to the dictionary itself still
reloads in practice: its importers lead to modules that use the data layer
(hooks such as `useAlerts`, the contexts), and the walk reaches them. Screens
that only read the dictionary (`DictionaryView`) keep hot updates.

### Closing the Dexie connection before the reload

This isn't needed. A full reload unloads the page, and the browser closes its
IndexedDB connections on unload. Transactions still in progress are aborted
whether or not `db.close()` is called first: `close()` cannot finish them. What
matters is that the new page opens one connection running one version of the
code, and a full reload guarantees that.

### Known limit

When Fast Refresh fails at runtime (the browser "invalidates" a component), Vite
sends the update up to the component's importers without calling `hotUpdate`
again. Data modules never import components, so they can't be re-run this way.
The only effect is that a parent screen that imports the data layer could be
hot-replaced.

## Production

`apply: 'serve'`: the plugin is not part of `vite build`, so production output
is unchanged.

## Testing

- Unit tests (`src/utils/dataLayerReload.test.ts`) on the decision, using a
  hand-built module graph: data module, dictionary, importers, imported
  modules, boundaries, cycles. Also check that the plugin applies to the dev
  server only.
- E2E (`e2e/development-reload.spec.ts`, Chromium only): copies the project to a
  temp folder, starts its own dev server on a free port, edits files in the copy
  and checks for a reload (a new `load` event) or an in-place update (Vite's
  "hot updated" log, with a marker on `window` still set). The copy keeps the
  real files and the shared E2E dev server untouched. Reloading that shared
  server would break tests running in parallel.
