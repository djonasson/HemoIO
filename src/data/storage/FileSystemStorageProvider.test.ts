import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FOLDER_DATA_FILE_NAME,
  FOLDER_PREVIOUS_FILE_NAME,
  FileSystemStorageProvider,
} from './FileSystemStorageProvider';

/**
 * A folder of real (in-memory) files: a write lands only when it is closed,
 * as with the File System Access API
 */
function createFakeFolder(files: Map<string, ArrayBuffer> = new Map()) {
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
  };
  return { handle, files, failingWrites };
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

    it('writes only the copy when the folder holds none yet', async () => {
      const folder = createFakeFolder();

      await (await providerFor(folder)).save(bytes(1, 2, 3));

      expect(read(folder.files.get(FOLDER_DATA_FILE_NAME))).toEqual([1, 2, 3]);
      expect(folder.files.has(FOLDER_PREVIOUS_FILE_NAME)).toBe(false);
    });

    it('keeps the replaced bytes, unchanged, as the previous copy', async () => {
      const folder = createFakeFolder(new Map([[FOLDER_DATA_FILE_NAME, bytes(9, 9)]]));

      await (await providerFor(folder)).save(bytes(1, 2, 3));

      expect(read(folder.files.get(FOLDER_DATA_FILE_NAME))).toEqual([1, 2, 3]);
      expect(read(folder.files.get(FOLDER_PREVIOUS_FILE_NAME))).toEqual([9, 9]);
    });

    it('replaces an older previous copy with the one just replaced', async () => {
      const folder = createFakeFolder(
        new Map([
          [FOLDER_DATA_FILE_NAME, bytes(2)],
          [FOLDER_PREVIOUS_FILE_NAME, bytes(1)],
        ])
      );

      await (await providerFor(folder)).save(bytes(3));

      expect(read(folder.files.get(FOLDER_PREVIOUS_FILE_NAME))).toEqual([2]);
    });

    it('does not keep an empty file as the previous copy', async () => {
      const folder = createFakeFolder(
        new Map([
          [FOLDER_DATA_FILE_NAME, new ArrayBuffer(0)],
          [FOLDER_PREVIOUS_FILE_NAME, bytes(7)],
        ])
      );

      await (await providerFor(folder)).save(bytes(3));

      expect(read(folder.files.get(FOLDER_PREVIOUS_FILE_NAME))).toEqual([7]);
    });

    it('leaves the copy alone when the previous copy cannot be written', async () => {
      const folder = createFakeFolder(new Map([[FOLDER_DATA_FILE_NAME, bytes(9, 9)]]));
      folder.failingWrites.add(FOLDER_PREVIOUS_FILE_NAME);

      await expect((await providerFor(folder)).save(bytes(1))).rejects.toThrow();

      expect(read(folder.files.get(FOLDER_DATA_FILE_NAME))).toEqual([9, 9]);
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
