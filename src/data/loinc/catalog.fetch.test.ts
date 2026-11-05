/**
 * Outside tests the catalog file is fetched; a failed fetch must leave the
 * next load free to try again (the "Try again" of the catalog error).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogFile } from './catalog';

const FILE: CatalogFile = {
  version: '2.83',
  tests: [
    {
      code: '2345-7',
      name: 'Glucose [Mass/volume] in Serum or Plasma',
      shortName: 'Glucose SerPl-mCnc',
      component: 'Glucose',
      property: 'MCnc',
      system: 'Ser/Plas',
      scale: 'Qn',
      method: '',
      classCode: 'CHEM',
      units: ['mg/dL'],
      rank: 1,
      names: [],
      groups: [],
    },
  ],
  groups: [],
};

async function freshLoadCatalog(): Promise<typeof import('./catalog').loadCatalog> {
  vi.resetModules();
  return (await import('./catalog')).loadCatalog;
}

describe('loadCatalog outside tests', () => {
  beforeEach(() => {
    vi.stubEnv('MODE', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('fails with the HTTP status only, then loads on the next try', async () => {
    const fetchFile = vi
      .fn()
      .mockResolvedValueOnce(new Response('Not found', { status: 404 }))
      .mockResolvedValueOnce(Response.json(FILE));
    vi.stubGlobal('fetch', fetchFile);
    const loadCatalog = await freshLoadCatalog();

    await expect(loadCatalog()).rejects.toThrow('The test catalog could not be fetched (HTTP 404)');
    const catalog = await loadCatalog();

    expect(catalog.test('2345-7')?.shortName).toBe('Glucose SerPl-mCnc');
    expect(fetchFile).toHaveBeenCalledTimes(2);
  });

  it('fails on a body that is not the catalog, then loads on the next try', async () => {
    const fetchFile = vi
      .fn()
      .mockResolvedValueOnce(new Response('<html>', { status: 200 }))
      .mockResolvedValueOnce(Response.json(FILE));
    vi.stubGlobal('fetch', fetchFile);
    const loadCatalog = await freshLoadCatalog();

    await expect(loadCatalog()).rejects.toThrow(SyntaxError);
    await expect(loadCatalog()).resolves.toBeDefined();
  });

  it('fetches the file once and shares it', async () => {
    const fetchFile = vi.fn().mockImplementation(() => Promise.resolve(Response.json(FILE)));
    vi.stubGlobal('fetch', fetchFile);
    const loadCatalog = await freshLoadCatalog();

    const [first, second] = await Promise.all([loadCatalog(), loadCatalog()]);

    expect(first).toBe(second);
    expect(await loadCatalog()).toBe(first);
    expect(fetchFile).toHaveBeenCalledTimes(1);
  });
});
