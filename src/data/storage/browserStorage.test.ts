import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { clearLocalHemoIOStorage } from './browserStorage';
import { inHandleStore } from './FileSystemStorageProvider';

describe('clearLocalHemoIOStorage', () => {
  it('removes only hemoio_ keys and the handle store', async () => {
    localStorage.setItem('hemoio_credentials', '{"version":2}');
    localStorage.setItem('hemoio_folder_sync_state', 'sealed');
    localStorage.setItem('hemoio_storage_provider', 'filesystem');
    localStorage.setItem('mantine-color-scheme-value', 'dark');
    localStorage.setItem('hemoio', 'not a HemoIO key: no underscore');
    await putInHandleStore('hemoio_filesystem_handle', { name: 'Health' });

    await clearLocalHemoIOStorage();

    expect(Object.keys(localStorage).sort()).toEqual(['hemoio', 'mantine-color-scheme-value']);
    expect(await handleStoreKeys()).toEqual([]);
    localStorage.clear();
  });
});

function putInHandleStore(key: string, value: unknown): Promise<IDBValidKey> {
  return inHandleStore('readwrite', (store) => store.put(value, key));
}

function handleStoreKeys(): Promise<IDBValidKey[]> {
  return inHandleStore('readonly', (store) => store.getAllKeys());
}
