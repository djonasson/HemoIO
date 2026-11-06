import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FOLDER_BACKUPS_DIR_NAME,
  FOLDER_DATA_FILE_NAME,
  FOLDER_LOCK_FILE_NAME,
  FOLDER_PREVIOUS_FILE_NAME,
  FileSystemStorageProvider,
} from './FileSystemStorageProvider';
import { onFolderBackupsChanged } from './folderAccessEvents';

/**
 * A folder of real (in-memory) files: a write lands only when it is closed,
 * as with the File System Access API
 */
function createFakeFolder(
  files: Map<string, ArrayBuffer> = new Map(),
  dirs: Map<string, Map<string, ArrayBuffer>> = new Map()
) {
  const failingWrites = new Set<string>();
  const fileHandle = (name: string) => ({
    name,
    kind: 'file' as const,
    getFile: async () => {
      const bytes = files.get(name)!;
      return { size: bytes.byteLength, arrayBuffer: async () => bytes };
    },
    createWritable: async () => {
      let pending: ArrayBuffer | null = null;
      return {
        write: async (data: ArrayBuffer) => {
          if (failingWrites.has(name)) throw new DOMException('Disk full', 'QuotaExceededError');
          pending = data;
        },
        close: async () => {
          if (pending) files.set(name, pending);
        },
        abort: async () => {
          pending = null;
        },
      };
    },
  });
  const handle = {
    name: 'Fake Folder',
    kind: 'directory' as const,
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      if (!files.has(name)) {
        if (!options?.create) throw new DOMException('Not found', 'NotFoundError');
        files.set(name, new ArrayBuffer(0));
      }
      return fileHandle(name);
    },
    // Typed loosely: a folder's handle holds the handles of the folders in it
    getDirectoryHandle: async (name: string, options?: { create?: boolean }): Promise<unknown> => {
      if (!dirs.has(name)) {
        if (!options?.create) throw new DOMException('Not found', 'NotFoundError');
        dirs.set(name, new Map());
      }
      return createFakeFolder(dirs.get(name)).handle;
    },
    removeEntry: async (name: string) => {
      if (!files.delete(name)) throw new DOMException('Not found', 'NotFoundError');
    },
    // A folder that is there can be listed
    keys: () => files.keys(),
    entries: async function* () {
      for (const name of files.keys()) yield [name, fileHandle(name)] as const;
      for (const name of dirs.keys()) yield [name, { name, kind: 'directory' as const }] as const;
    },
  };
  return { handle, files, failingWrites, dirs };
}

const bytes = (...values: number[]): ArrayBuffer => new Uint8Array(values).buffer;
const read = (buffer: ArrayBuffer | undefined): number[] | undefined =>
  buffer && Array.from(new Uint8Array(buffer));


// Create a proper mock for IndexedDB
function createMockIndexedDB() {
  const stores: Record<string, Map<string, unknown>> = {
    handles: new Map(),
  };

  const mockObjectStore = (name: string) => ({
    put: vi.fn((value: unknown, key: string) => {
      const request = {
        result: undefined,
        error: null as Error | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      stores[name].set(key, value);
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    }),
    get: vi.fn((key: string) => {
      const request = {
        result: stores[name].get(key),
        error: null as Error | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    }),
    delete: vi.fn((key: string) => {
      const request = {
        result: undefined,
        error: null as Error | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      stores[name].delete(key);
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    }),
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mockTransaction = (_storeNames: string | string[]) => {
    const transaction = {
      objectStore: vi.fn((name: string) => mockObjectStore(name)),
      oncomplete: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };
    // Call oncomplete after all operations
    setTimeout(() => transaction.oncomplete?.(), 10);
    return transaction;
  };

  const mockDB = {
    transaction: vi.fn(mockTransaction),
    close: vi.fn(),
    objectStoreNames: {
      contains: vi.fn(() => true),
    },
    createObjectStore: vi.fn(),
  };

  return {
    open: vi.fn(() => {
      const request = {
        result: mockDB,
        error: null as Error | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onupgradeneeded: null as ((event: { target: { result: typeof mockDB } }) => void) | null,
      };
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    }),
    stores,
  };
}

describe('FileSystemStorageProvider', () => {
  let provider: FileSystemStorageProvider;
  let mockIndexedDB: ReturnType<typeof createMockIndexedDB>;
  let originalIndexedDB: IDBFactory;
  let originalShowDirectoryPicker: typeof window.showDirectoryPicker;

  // Mock directory handle
  const mockDirectoryHandle = {
    name: 'TestFolder',
    kind: 'directory' as const,
    getFileHandle: vi.fn(),
    keys: vi.fn(),
    queryPermission: vi.fn(),
    requestPermission: vi.fn(),
    isSameEntry: vi.fn(),
  };

  // Mock file handle
  const mockFileHandle = {
    name: 'hemoio-data.encrypted',
    kind: 'file' as const,
    getFile: vi.fn(),
    createWritable: vi.fn(),
    isSameEntry: vi.fn(),
  };

  // Mock writable stream
  const mockWritable = {
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
    locked: false,
  };

  beforeEach(() => {
    // Save originals
    originalIndexedDB = window.indexedDB;
    originalShowDirectoryPicker = window.showDirectoryPicker;

    // Create fresh mocks
    mockIndexedDB = createMockIndexedDB();
    // @ts-expect-error - Mocking IndexedDB
    window.indexedDB = mockIndexedDB;

    // Reset mocks
    vi.clearAllMocks();
    mockDirectoryHandle.queryPermission.mockResolvedValue('granted');
    mockDirectoryHandle.requestPermission.mockResolvedValue('granted');
    mockDirectoryHandle.getFileHandle.mockResolvedValue(mockFileHandle);
    mockDirectoryHandle.keys.mockReturnValue({ next: vi.fn().mockResolvedValue({ done: true }) });
    mockFileHandle.createWritable.mockResolvedValue(mockWritable);
    mockFileHandle.getFile.mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
    });

    // Create fresh provider
    provider = new FileSystemStorageProvider();
  });

  afterEach(() => {
    window.indexedDB = originalIndexedDB;
    if (originalShowDirectoryPicker) {
      window.showDirectoryPicker = originalShowDirectoryPicker;
    }
  });

  describe('selectDirectory', () => {
    it('returns null when user cancels', async () => {
      window.showDirectoryPicker = vi
        .fn()
        .mockRejectedValue(new DOMException('Cancelled', 'AbortError'));

      const result = await provider.selectDirectory();
      expect(result).toBeNull();
    });

    it('throws error when permission is denied', async () => {
      window.showDirectoryPicker = vi
        .fn()
        .mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));

      await expect(provider.selectDirectory()).rejects.toThrow(
        'Please grant folder access'
      );
    });

    it('returns handle when successful', async () => {
      window.showDirectoryPicker = vi.fn().mockResolvedValue(mockDirectoryHandle);

      const result = await provider.selectDirectory();
      expect(result).toBe(mockDirectoryHandle);
    });
  });

  describe('save', () => {
    it('throws error when no directory is selected', async () => {
      const data = new ArrayBuffer(10);
      await expect(provider.save(data)).rejects.toThrow('No directory selected');
    });

    it('successfully saves data when directory is selected', async () => {
      // First select a directory
      window.showDirectoryPicker = vi.fn().mockResolvedValue(mockDirectoryHandle);
      await provider.selectDirectory();

      const data = new ArrayBuffer(10);
      await provider.save(data);

      expect(mockDirectoryHandle.getFileHandle).toHaveBeenCalledWith(
        'hemoio-data.encrypted',
        { create: true }
      );
      expect(mockWritable.write).toHaveBeenCalledWith(data);
      expect(mockWritable.close).toHaveBeenCalled();
    });
  });

  describe('keeping the previous copy', () => {
    async function providerFor(folder: ReturnType<typeof createFakeFolder>) {
      window.showDirectoryPicker = vi.fn().mockResolvedValue(folder.handle);
      await provider.selectDirectory();
      return provider;
    }

    it('names the copy and the previous copy for anything that reads them', () => {
      expect(FOLDER_DATA_FILE_NAME).toBe('hemoio-data.encrypted');
      expect(FOLDER_PREVIOUS_FILE_NAME).toBe('hemoio-data.previous.encrypted');
    });

    it('reads no copy and no previous copy from an empty folder', async () => {
      const store = await providerFor(createFakeFolder());

      expect(await store.loadCurrent()).toBeNull();
      expect(await store.loadPrevious()).toBeNull();
    });

    it('reads the copy and the previous copy as they are', async () => {
      const folder = createFakeFolder(
        new Map([
          [FOLDER_DATA_FILE_NAME, bytes(2)],
          [FOLDER_PREVIOUS_FILE_NAME, bytes(1)],
        ])
      );
      const store = await providerFor(folder);

      expect(read((await store.loadCurrent())!)).toEqual([2]);
      expect(read((await store.loadPrevious())!)).toEqual([1]);
    });

    it('writes only the copy when not told what to keep', async () => {
      const folder = createFakeFolder(
        new Map([
          [FOLDER_DATA_FILE_NAME, bytes(9, 9)],
          [FOLDER_PREVIOUS_FILE_NAME, bytes(7)],
        ])
      );

      await (await providerFor(folder)).save(bytes(1, 2, 3));

      expect(read(folder.files.get(FOLDER_DATA_FILE_NAME))).toEqual([1, 2, 3]);
      expect(read(folder.files.get(FOLDER_PREVIOUS_FILE_NAME))).toEqual([7]);
    });

    it('keeps the given bytes as the previous copy before writing the copy', async () => {
      const folder = createFakeFolder(new Map([[FOLDER_DATA_FILE_NAME, bytes(9, 9)]]));

      await (await providerFor(folder)).save(bytes(1, 2, 3), bytes(9, 9));

      expect(read(folder.files.get(FOLDER_DATA_FILE_NAME))).toEqual([1, 2, 3]);
      expect(read(folder.files.get(FOLDER_PREVIOUS_FILE_NAME))).toEqual([9, 9]);
    });

    it('leaves the copy alone when the previous copy cannot be written', async () => {
      const folder = createFakeFolder(new Map([[FOLDER_DATA_FILE_NAME, bytes(9, 9)]]));
      folder.failingWrites.add(FOLDER_PREVIOUS_FILE_NAME);

      await expect((await providerFor(folder)).save(bytes(1), bytes(9, 9))).rejects.toThrow();

      expect(read(folder.files.get(FOLDER_DATA_FILE_NAME))).toEqual([9, 9]);
    });

    it('reads and writes the lock file beside the copy', async () => {
      expect(FOLDER_LOCK_FILE_NAME).toBe('hemoio-lock.json');
      const folder = createFakeFolder(new Map([[FOLDER_DATA_FILE_NAME, bytes(9)]]));
      const store = await providerFor(folder);
      expect(await store.loadLock()).toBeNull();

      await store.saveLock(bytes(4, 5));

      expect(read((await store.loadLock())!)).toEqual([4, 5]);
      expect(read(folder.files.get(FOLDER_LOCK_FILE_NAME))).toEqual([4, 5]);
      expect(read(folder.files.get(FOLDER_DATA_FILE_NAME))).toEqual([9]);
    });

    it('reads nothing without folder access', async () => {
      const folder = createFakeFolder(new Map([[FOLDER_DATA_FILE_NAME, bytes(2)]]));
      folder.handle.queryPermission = async () => 'prompt';

      await expect((await providerFor(folder)).loadCurrent()).rejects.toThrow('Permission denied');
    });
  });

  describe('dated backups', () => {
    async function providerFor(folder: ReturnType<typeof createFakeFolder>) {
      window.showDirectoryPicker = vi.fn().mockResolvedValue(folder.handle);
      await provider.selectDirectory();
      return provider;
    }

    it('backups live in hemoio-backups', async () => {
      expect(FOLDER_BACKUPS_DIR_NAME).toBe('hemoio-backups');
      const folder = createFakeFolder(new Map([[FOLDER_DATA_FILE_NAME, bytes(9)]]));
      const store = await providerFor(folder);

      expect(await store.listBackups()).toEqual([]);
      await store.saveBackup('hemoio-backup-a.encrypted', bytes(1, 2));
      await store.saveBackup('hemoio-backup-b.encrypted', bytes(3));

      const backups = folder.dirs.get(FOLDER_BACKUPS_DIR_NAME)!;
      expect(read(backups.get('hemoio-backup-a.encrypted'))).toEqual([1, 2]);
      // Nothing lands beside the copy
      expect([...folder.files.keys()]).toEqual([FOLDER_DATA_FILE_NAME]);
      expect((await store.listBackups()).sort()).toEqual([
        'hemoio-backup-a.encrypted',
        'hemoio-backup-b.encrypted',
      ]);
      expect(read(await store.loadBackup('hemoio-backup-b.encrypted'))).toEqual([3]);

      await store.deleteBackup('hemoio-backup-a.encrypted');
      expect(await store.listBackups()).toEqual(['hemoio-backup-b.encrypted']);
    });

    it('lists only files', async () => {
      const folder = createFakeFolder(
        new Map(),
        new Map([[FOLDER_BACKUPS_DIR_NAME, new Map([['hemoio-backup-a.encrypted', bytes(1)]])]])
      );
      const store = await providerFor(folder);
      await store.saveBackup('x', bytes(1));
      await store.deleteBackup('x');

      expect(await store.listBackups()).toEqual(['hemoio-backup-a.encrypted']);
    });

    it('saving or deleting a backup notifies listeners', async () => {
      const store = await providerFor(createFakeFolder());
      const listener = vi.fn();
      const stop = onFolderBackupsChanged(listener);
      try {
        await store.saveBackup('hemoio-backup-a.encrypted', bytes(1));
        expect(listener).toHaveBeenCalledTimes(1);
        await store.deleteBackup('hemoio-backup-a.encrypted');
        expect(listener).toHaveBeenCalledTimes(2);
      } finally {
        stop();
      }
    });

    it('a failed backup write notifies no one and keeps no file', async () => {
      const folder = createFakeFolder();
      const store = await providerFor(folder);
      await store.saveBackup('hemoio-backup-a.encrypted', bytes(1));
      const listener = vi.fn();
      const stop = onFolderBackupsChanged(listener);
      try {
        // The backups folder is a file: nothing can be written into it
        folder.dirs.clear();
        folder.files.set(FOLDER_BACKUPS_DIR_NAME, bytes(0));
        folder.handle.getDirectoryHandle = async () => {
          throw new DOMException('Not a folder', 'TypeMismatchError');
        };
        await expect(store.saveBackup('hemoio-backup-b.encrypted', bytes(2))).rejects.toThrow();
        expect(listener).not.toHaveBeenCalled();
      } finally {
        stop();
      }
    });

    it('fails to load a backup that is not there', async () => {
      const store = await providerFor(createFakeFolder());

      await expect(store.loadBackup('hemoio-backup-a.encrypted')).rejects.toThrow();
    });
  });

  describe('load', () => {
    it('throws error when no directory is selected', async () => {
      await expect(provider.load()).rejects.toThrow('No directory selected');
    });

    it('throws error when file is not found', async () => {
      // Select directory first
      window.showDirectoryPicker = vi.fn().mockResolvedValue(mockDirectoryHandle);
      await provider.selectDirectory();

      mockDirectoryHandle.getFileHandle.mockRejectedValue(
        new DOMException('Not found', 'NotFoundError')
      );

      await expect(provider.load()).rejects.toThrow('No backup data found');
    });

    it('returns data when file exists', async () => {
      const testData = new ArrayBuffer(10);

      // Select directory first
      window.showDirectoryPicker = vi.fn().mockResolvedValue(mockDirectoryHandle);
      await provider.selectDirectory();

      mockFileHandle.getFile.mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(testData),
      });

      const result = await provider.load();
      expect(result).toBe(testData);
    });
  });

  describe('loadCurrent', () => {
    beforeEach(async () => {
      window.showDirectoryPicker = vi.fn().mockResolvedValue(mockDirectoryHandle);
      await provider.selectDirectory();
    });

    it('is null only when the folder has no data file', async () => {
      mockDirectoryHandle.getFileHandle.mockRejectedValue(new DOMException('Not found', 'NotFoundError'));

      expect(await provider.loadCurrent()).toBeNull();
    });

    it('fails, rather than reporting no file, when the folder itself is gone', async () => {
      // Chrome says NotFoundError for a missing folder (unmounted, moved) too
      const gone = new DOMException('Folder gone', 'NotFoundError');
      mockDirectoryHandle.getFileHandle.mockRejectedValue(new DOMException('Not found', 'NotFoundError'));
      mockDirectoryHandle.keys.mockReturnValue({ next: vi.fn().mockRejectedValue(gone) });

      await expect(provider.loadCurrent()).rejects.toThrow('Folder gone');
    });

    it('fails, rather than reporting no file, when the file cannot be read', async () => {
      mockDirectoryHandle.getFileHandle.mockRejectedValue(
        new DOMException('Busy', 'NotReadableError')
      );

      await expect(provider.loadCurrent()).rejects.toThrow('Busy');
    });

    it('returns the data file', async () => {
      const testData = new ArrayBuffer(10);
      mockFileHandle.getFile.mockResolvedValue({ arrayBuffer: vi.fn().mockResolvedValue(testData) });

      expect(await provider.loadCurrent()).toBe(testData);
    });
    // An interrupted first write can leave one: nothing to restore or protect
    it('is null when the data file is empty', async () => {
      mockFileHandle.getFile.mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      });

      expect(await provider.loadCurrent()).toBeNull();
    });
  });

  describe('exists', () => {
    it('returns false when no directory is selected', async () => {
      expect(await provider.exists()).toBe(false);
    });

    it('returns false when file does not exist', async () => {
      // Select directory first
      window.showDirectoryPicker = vi.fn().mockResolvedValue(mockDirectoryHandle);
      await provider.selectDirectory();

      mockDirectoryHandle.getFileHandle.mockRejectedValue(
        new DOMException('Not found', 'NotFoundError')
      );

      expect(await provider.exists()).toBe(false);
    });

    it('returns true when file exists', async () => {
      // Select directory first
      window.showDirectoryPicker = vi.fn().mockResolvedValue(mockDirectoryHandle);
      await provider.selectDirectory();

      expect(await provider.exists()).toBe(true);
    });
  });

  describe('getDirectoryName', () => {
    it('returns null when no directory is selected', async () => {
      expect(await provider.getDirectoryName()).toBeNull();
    });

    it('returns directory name when selected', async () => {
      // Select directory first
      window.showDirectoryPicker = vi.fn().mockResolvedValue(mockDirectoryHandle);
      await provider.selectDirectory();

      expect(await provider.getDirectoryName()).toBe('TestFolder');
    });
  });

  describe('getPermissionState', () => {
    it('returns null when no directory is selected', async () => {
      expect(await provider.getPermissionState()).toBeNull();
    });

    it('returns permission state when directory is selected', async () => {
      // Select directory first
      window.showDirectoryPicker = vi.fn().mockResolvedValue(mockDirectoryHandle);
      await provider.selectDirectory();

      mockDirectoryHandle.queryPermission.mockResolvedValue('prompt');
      expect(await provider.getPermissionState()).toBe('prompt');
    });
  });

  describe('requestPermission', () => {
    it('throws error when no directory is selected', async () => {
      await expect(provider.requestPermission()).rejects.toThrow(
        'No directory selected'
      );
    });

    it('returns permission state after request', async () => {
      // Select directory first
      window.showDirectoryPicker = vi.fn().mockResolvedValue(mockDirectoryHandle);
      await provider.selectDirectory();

      mockDirectoryHandle.requestPermission.mockResolvedValue('granted');
      expect(await provider.requestPermission()).toBe('granted');
    });
  });
});
