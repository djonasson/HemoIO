import { describe, it, expect, beforeEach } from 'vitest';
import { FOLDER_SYNC_STATE_KEY, loadFolderSyncState, saveFolderSyncState } from './folderSyncState';

const newKey = (): Promise<CryptoKey> =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

describe('folder sync state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips encrypted', async () => {
    const key = await newKey();
    const state = { revision: 'b9c1d2e3-revision-in-plain-sight', digest: 'ZGlnZXN0LW9mLWRhdGE=' };

    await saveFolderSyncState(state, key);

    const stored = localStorage.getItem(FOLDER_SYNC_STATE_KEY)!;
    expect(stored).not.toContain('revision');
    expect(stored).not.toContain(state.revision);
    expect(stored).not.toContain(state.digest);
    expect(await loadFolderSyncState(key)).toEqual(state);
  });

  it('keeps a null revision', async () => {
    const key = await newKey();

    await saveFolderSyncState({ revision: null, digest: 'd' }, key);

    expect(await loadFolderSyncState(key)).toEqual({ revision: null, digest: 'd' });
  });

  it('is null when absent', async () => {
    expect(await loadFolderSyncState(await newKey())).toBeNull();
  });

  it('unreadable state is null', async () => {
    await saveFolderSyncState({ revision: 'r', digest: 'd' }, await newKey());

    // Another key, as after a new setup
    expect(await loadFolderSyncState(await newKey())).toBeNull();

    localStorage.setItem(FOLDER_SYNC_STATE_KEY, 'not base64 at all!');
    expect(await loadFolderSyncState(await newKey())).toBeNull();
  });
});
