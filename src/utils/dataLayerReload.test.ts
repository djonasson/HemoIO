import { describe, it, expect, vi } from 'vitest';
import { dataLayerReload, isDataLayerFile, needsFullReload, type HotModule } from './dataLayerReload';

const ROOT = '/work/hemoio';

interface FakeModule extends HotModule {
  importers: Set<FakeModule>;
  importedModules: Set<FakeModule>;
}

function mod(relativePath: string, isSelfAccepting = false): FakeModule {
  return {
    file: `${ROOT}/${relativePath}`,
    isSelfAccepting,
    importers: new Set(),
    importedModules: new Set(),
  };
}

/** `importer` imports `imported` */
function link(importer: FakeModule, imported: FakeModule): void {
  importer.importedModules.add(imported);
  imported.importers.add(importer);
}

describe('isDataLayerFile', () => {
  it.each([
    'src/data/db/index.ts',
    'src/data/db/encryptedDb.ts',
    'src/data/encryption/keyWrapping.ts',
    'src/data/storage/FileSystemStorageProvider.ts',
    'src/data/db/saveError.ts',
  ])('treats %s as data layer', (file) => {
    expect(isDataLayerFile(`${ROOT}/${file}`, ROOT)).toBe(true);
  });

  it.each([
    'src/data/loinc/addons.ts',
    'src/data/loinc/catalog.ts',
    'src/contexts/AuthContext.tsx',
    'src/utils/unitSpelling.ts',
    'src/database/other.ts',
  ])('does not treat %s as data layer', (file) => {
    expect(isDataLayerFile(`${ROOT}/${file}`, ROOT)).toBe(false);
  });

  it('ignores modules without a file and files of another project', () => {
    expect(isDataLayerFile(null, ROOT)).toBe(false);
    expect(isDataLayerFile('/elsewhere/src/data/db/index.ts', ROOT)).toBe(false);
  });
});

describe('needsFullReload', () => {
  it('reloads when a data module changes, even below a boundary that would accept it', () => {
    const db = mod('src/data/db/encryptedDb.ts');
    const screen = mod('src/components/Screen.tsx', true);
    link(screen, db);

    expect(needsFullReload([db], ROOT)).toBe(true);
  });

  it('reloads when a module the data layer imports changes', () => {
    const helper = mod('src/utils/unitSpelling.ts');
    const db = mod('src/data/db/encryptedDb.ts');
    link(db, helper);

    expect(needsFullReload([helper], ROOT)).toBe(true);
  });

  it('reloads when the data layer is reached further up the importers', () => {
    const leaf = mod('src/utils/leaf.ts');
    const middle = mod('src/services/units/conversion.ts');
    const db = mod('src/data/db/encryptedDb.ts');
    link(middle, leaf);
    link(db, middle);

    expect(needsFullReload([leaf], ROOT)).toBe(true);
  });

  it('reloads when a module that imports the data layer changes', () => {
    const auth = mod('src/contexts/AuthContext.tsx');
    const db = mod('src/data/db/index.ts');
    link(auth, db);

    expect(needsFullReload([auth], ROOT)).toBe(true);
  });

  it('reloads when the update would re-run a module that imports the data layer', () => {
    const hook = mod('src/hooks/useSomething.ts');
    const auth = mod('src/contexts/AuthContext.tsx');
    const db = mod('src/data/db/index.ts');
    link(auth, hook);
    link(auth, db);

    expect(needsFullReload([hook], ROOT)).toBe(true);
  });

  it('updates in place a screen that does not touch the data layer', () => {
    const screen = mod('src/components/common/RelativeTime.tsx', true);
    const parent = mod('src/components/timeline/TimelineView.tsx', true);
    link(parent, screen);

    expect(needsFullReload([screen], ROOT)).toBe(false);
  });

  it('stops at a module that accepts its own update: modules above it are not re-run', () => {
    const helper = mod('src/utils/format.ts');
    const screen = mod('src/components/Screen.tsx', true);
    const auth = mod('src/contexts/AuthContext.tsx');
    const db = mod('src/data/db/index.ts');
    link(screen, helper);
    link(auth, screen);
    link(auth, db);

    expect(needsFullReload([helper], ROOT)).toBe(false);
  });

  it('updates the test add-ons in place when no data code would re-run', () => {
    const dictionary = mod('src/data/loinc/addons.ts');
    const view = mod('src/components/dictionary/DictionaryView.tsx', true);
    link(view, dictionary);

    expect(needsFullReload([dictionary], ROOT)).toBe(false);
  });

  it('updates in place a screen that reads the test add-ons', () => {
    const view = mod('src/components/dictionary/BiomarkerDictionary.tsx', true);
    const dictionary = mod('src/data/loinc/display.ts');
    link(view, dictionary);

    expect(needsFullReload([view], ROOT)).toBe(false);
  });

  it('reloads for an add-on change that reaches the data layer', () => {
    const dictionary = mod('src/data/loinc/addons.ts');
    const migration = mod('src/data/db/encryptedDb.ts');
    link(migration, dictionary);

    expect(needsFullReload([dictionary], ROOT)).toBe(true);
  });

  it('does not loop on import cycles', () => {
    const a = mod('src/utils/a.ts');
    const b = mod('src/utils/b.ts');
    link(a, b);
    link(b, a);

    expect(needsFullReload([a], ROOT)).toBe(false);
  });

  it('has nothing to reload when the changed file is not loaded in the page', () => {
    expect(needsFullReload([], ROOT)).toBe(false);
  });
});

describe('dataLayerReload plugin', () => {
  function hotUpdate(modules: HotModule[], consumer: 'client' | 'server' = 'client') {
    const plugin = dataLayerReload();
    (plugin.configResolved as (config: { root: string }) => void)({ root: ROOT });
    const send = vi.fn();
    const info = vi.fn();
    const hook = plugin.hotUpdate as {
      handler: (this: unknown, options: { file: string; modules: HotModule[] }) => unknown;
    };
    const file = modules[0]?.file ?? `${ROOT}/src/other.ts`;
    const result = hook.handler.call(
      { environment: { config: { consumer }, hot: { send }, logger: { info } } },
      { file, modules }
    );
    return { result, send, info };
  }

  it('runs on the development server only, so production builds are unchanged', () => {
    expect(dataLayerReload().apply).toBe('serve');
  });

  it('reloads the page instead of updating it when the data layer changes', () => {
    const { result, send } = hotUpdate([mod('src/data/db/index.ts')]);

    expect(send).toHaveBeenCalledWith({
      type: 'full-reload',
      triggeredBy: `${ROOT}/src/data/db/index.ts`,
    });
    expect(result).toEqual([]);
  });

  it('says in the terminal why the page reloaded', () => {
    const { info } = hotUpdate([mod('src/data/db/index.ts')]);

    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('src/data/db/index.ts'),
      expect.objectContaining({ timestamp: true })
    );
  });

  it('decides after the other plugins, on the final list of changed modules', () => {
    expect((dataLayerReload().hotUpdate as { order: string }).order).toBe('post');
  });

  it('leaves other changes to the normal hot update', () => {
    const { result, send } = hotUpdate([mod('src/components/common/RelativeTime.tsx', true)]);

    expect(send).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('leaves the server-side module graph alone', () => {
    const { result, send } = hotUpdate([mod('src/data/db/index.ts')], 'server');

    expect(send).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});
