import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { isFileSystemAccessSupported } from '@/utils/fileSystemSupport';
import { FileSystemStorageProvider } from '@data/storage/FileSystemStorageProvider';
import { notifyFolderAccessChanged } from '@data/storage/folderAccessEvents';
import { FolderSyncIssueContext } from '@hooks/useFolderSyncIssue';
import { StorageSettings } from './StorageSettings';

// Mock the fileSystemSupport module
vi.mock('@/utils/fileSystemSupport', () => ({
  isFileSystemAccessSupported: vi.fn(() => false),
}));

// Mock the FileSystemStorageProvider
vi.mock('@data/storage/FileSystemStorageProvider', () => ({
  FileSystemStorageProvider: vi.fn().mockImplementation(() => ({
    getDirectoryName: vi.fn().mockResolvedValue(null),
    getPermissionState: vi.fn().mockResolvedValue(null),
    requestPermission: vi.fn().mockResolvedValue('granted'),
    selectDirectory: vi.fn().mockResolvedValue({ name: 'TestFolder' }),
  })),
}));

// Folder access changed elsewhere (the restore question, a sync notice, another tab)
const folderAccessListeners = new Set<() => void>();
vi.mock('@data/storage/folderAccessEvents', () => ({
  // Heard in this tab too, as the real event is
  notifyFolderAccessChanged: vi.fn(() => folderAccessListeners.forEach((listener) => listener())),
  onFolderAccessChanged: (listener: () => void) => {
    folderAccessListeners.add(listener);
    return () => folderAccessListeners.delete(listener);
  },
}));

vi.mock('./FolderBackups', () => ({
  FolderBackups: () => <section aria-label="Folder backups" />,
}));

const STORAGE_PROVIDER_KEY = 'hemoio_storage_provider';

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider env="test">{ui}</MantineProvider>);
}

describe('StorageSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('with local storage', () => {
    it('renders local storage option', () => {
      renderWithProviders(<StorageSettings onRestore={vi.fn()} />);

      expect(screen.getByText('Local Storage')).toBeInTheDocument();
      expect(
        screen.getByText('Store data in your browser. Data stays on this device only.')
      ).toBeInTheDocument();
    });

    it('shows active badge for local storage when selected', () => {
      renderWithProviders(<StorageSettings onRestore={vi.fn()} />);

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('shows note about unsupported browser when filesystem not supported', () => {
      renderWithProviders(<StorageSettings onRestore={vi.fn()} />);

      expect(
        screen.getByText(/Local Directory storage is not supported in this browser/i)
      ).toBeInTheDocument();
    });

    it('allows switching storage providers', () => {
      renderWithProviders(<StorageSettings onRestore={vi.fn()} />);

      expect(
        screen.getByText(/Choose where to store your encrypted data/i)
      ).toBeInTheDocument();
    });
  });

  describe('with filesystem storage', () => {
    beforeEach(() => {
      localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
    });

    it('renders filesystem storage when selected', () => {
      renderWithProviders(<StorageSettings onRestore={vi.fn()} />);

      // Local storage option should still be visible
      expect(screen.getByText('Local Storage')).toBeInTheDocument();
    });
  });

  describe('storage provider selection', () => {
    it('renders radiogroup for storage selection', () => {
      renderWithProviders(<StorageSettings onRestore={vi.fn()} />);

      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    });

    it('shows storage location header', () => {
      renderWithProviders(<StorageSettings onRestore={vi.fn()} />);

      expect(screen.getByText('Storage Location')).toBeInTheDocument();
    });
  });
});

describe('StorageSettings folder backups', () => {
  function folderProvider(permission: 'granted' | 'prompt'): void {
    vi.mocked(isFileSystemAccessSupported).mockReturnValue(true);
    vi.mocked(FileSystemStorageProvider).mockImplementation(
      class {
        getDirectoryName = vi.fn().mockResolvedValue('Health');
        getPermissionState = vi.fn().mockResolvedValue(permission);
      } as unknown as typeof FileSystemStorageProvider
    );
  }

  afterEach(() => {
    localStorage.clear();
    vi.mocked(isFileSystemAccessSupported).mockReturnValue(false);
    vi.clearAllMocks();
  });

  it('lists them when folder storage is on and the folder is open to HemoIO', async () => {
    localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
    folderProvider('granted');
    renderWithProviders(<StorageSettings onRestore={vi.fn()} />);

    expect(await screen.findByRole('region', { name: 'Folder backups' })).toBeInTheDocument();
  });

  it('hides them until access is granted, then lists them', async () => {
    localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
    vi.mocked(isFileSystemAccessSupported).mockReturnValue(true);
    // Access granted stays granted, as the browser keeps it
    let permission = 'prompt';
    vi.mocked(FileSystemStorageProvider).mockImplementation(
      class {
        getDirectoryName = vi.fn().mockResolvedValue('Health');
        getPermissionState = vi.fn(async () => permission);
        requestPermission = vi.fn(async () => (permission = 'granted'));
      } as unknown as typeof FileSystemStorageProvider
    );
    renderWithProviders(<StorageSettings onRestore={vi.fn()} />);

    const grant = await screen.findByRole('button', { name: 'Grant Access' });
    expect(screen.queryByRole('region', { name: 'Folder backups' })).not.toBeInTheDocument();
    await userEvent.click(grant);

    expect(await screen.findByRole('region', { name: 'Folder backups' })).toBeInTheDocument();
  });

  it('does not list them with local storage', () => {
    folderProvider('granted');
    renderWithProviders(<StorageSettings onRestore={vi.fn()} />);

    expect(screen.queryByRole('region', { name: 'Folder backups' })).not.toBeInTheDocument();
  });
});

describe('StorageSettings tells folder sync when folder access changes', () => {
  function folderProvider(permission: 'granted' | 'prompt'): void {
    vi.mocked(isFileSystemAccessSupported).mockReturnValue(true);
    // The folder kept, and its access, as the provider stores them
    let folder = 'Health';
    let access: string = permission;
    vi.mocked(FileSystemStorageProvider).mockImplementation(
      class {
        getDirectoryName = vi.fn(async () => folder);
        getPermissionState = vi.fn(async () => access);
        requestPermission = vi.fn(async () => (access = 'granted'));
        selectDirectory = vi.fn(async () => {
          folder = 'Other';
          access = 'granted';
          return { name: folder };
        });
      } as unknown as typeof FileSystemStorageProvider
    );
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.mocked(isFileSystemAccessSupported).mockReturnValue(false);
    vi.clearAllMocks();
  });

  it('after access is granted again', async () => {
    localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
    folderProvider('prompt');
    renderWithProviders(<StorageSettings onRestore={vi.fn()} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Grant Access' }));

    await waitFor(() => expect(notifyFolderAccessChanged).toHaveBeenCalledTimes(1));
  });

  it('after another folder is chosen', async () => {
    localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
    folderProvider('granted');
    renderWithProviders(<StorageSettings onRestore={vi.fn()} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Change' }));

    await waitFor(() => expect(screen.getByText('Other')).toBeInTheDocument());
    expect(notifyFolderAccessChanged).toHaveBeenCalled();
  });

  it('never shows the error of a failed folder choice or access request, which can name a path', async () => {
    localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
    folderProvider('prompt');
    const named = new Error('/home/someone/Lab Folder is not allowed');
    vi.mocked(FileSystemStorageProvider).mockImplementation(
      class {
        getDirectoryName = vi.fn(async () => 'Health');
        getPermissionState = vi.fn(async () => 'prompt');
        requestPermission = vi.fn(async () => {
          throw named;
        });
        selectDirectory = vi.fn(async () => {
          throw named;
        });
      } as unknown as typeof FileSystemStorageProvider
    );
    renderWithProviders(<StorageSettings onRestore={vi.fn()} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Grant Access' }));

    expect(await screen.findByText('HemoIO could not get access to the folder. Try again.')).toBeInTheDocument();
    expect(screen.queryByText(/Lab Folder/)).not.toBeInTheDocument();
  });

  it('after switching to folder storage, once the folder is the storage', async () => {
    folderProvider('granted');
    vi.mocked(notifyFolderAccessChanged).mockImplementation(() => {
      // Sync reads the storage choice when told, so it must be saved by then
      expect(localStorage.getItem(STORAGE_PROVIDER_KEY)).toBe('filesystem');
    });
    renderWithProviders(<StorageSettings onRestore={vi.fn()} />);

    await userEvent.click(screen.getByRole('radio', { name: /Local Directory/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Select Folder & Switch' }));

    await waitFor(() => expect(notifyFolderAccessChanged).toHaveBeenCalled());
  });
});

describe('StorageSettings shows the current folder', () => {
  let folderName = 'Health';
  /** The line naming the folder: its name is an element of its own */
  const currentFolder =
    (name: string) =>
    (_content: string, element: Element | null): boolean =>
      element?.tagName === 'P' && element.textContent === `Current folder: “${name}”`;

  beforeEach(() => {
    localStorage.clear();
    folderName = 'Health';
    localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
    vi.mocked(isFileSystemAccessSupported).mockReturnValue(true);
    vi.mocked(FileSystemStorageProvider).mockImplementation(
      class {
        getDirectoryName = vi.fn(async () => folderName);
        getPermissionState = vi.fn().mockResolvedValue('granted');
      } as unknown as typeof FileSystemStorageProvider
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.mocked(isFileSystemAccessSupported).mockReturnValue(false);
    vi.clearAllMocks();
  });

  it("names it as the current folder, and says browsers show only a folder's name", async () => {
    renderWithProviders(<StorageSettings onRestore={vi.fn()} />);

    expect(await screen.findByText(currentFolder('Health'))).toBeInTheDocument();
    expect(screen.getByText("Browsers show only the folder's name, not where it is.")).toBeInTheDocument();
  });

  it('shows a folder chosen elsewhere', async () => {
    renderWithProviders(<StorageSettings onRestore={vi.fn()} />);
    await screen.findByText(currentFolder('Health'));

    folderName = 'Other';
    act(() => folderAccessListeners.forEach((listener) => listener()));

    expect(await screen.findByText(currentFolder('Other'))).toBeInTheDocument();
  });

  it('stops listening once closed', async () => {
    const { unmount } = renderWithProviders(<StorageSettings onRestore={vi.fn()} />);
    await screen.findByText(currentFolder('Health'));

    unmount();

    expect(folderAccessListeners.size).toBe(0);
  });
});

describe('StorageSettings keeps a folder copy that cannot be read in view', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
    vi.mocked(isFileSystemAccessSupported).mockReturnValue(true);
    vi.mocked(FileSystemStorageProvider).mockImplementation(
      class {
        getDirectoryName = vi.fn().mockResolvedValue('Health');
        getPermissionState = vi.fn().mockResolvedValue('granted');
      } as unknown as typeof FileSystemStorageProvider
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.mocked(isFileSystemAccessSupported).mockReturnValue(false);
    vi.clearAllMocks();
  });

  function renderWithIssue(replaceable: boolean) {
    const askReplace = vi.fn();
    renderWithProviders(
      <FolderSyncIssueContext.Provider value={{ replaceable, askReplace }}>
        <StorageSettings onRestore={vi.fn()} />
      </FolderSyncIssueContext.Provider>
    );
    return { askReplace };
  }

  it('says so and offers to replace it, with the same confirmation as the notice', async () => {
    const { askReplace } = renderWithIssue(true);

    expect(await screen.findByText("The folder copy can't be read.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));

    expect(askReplace).toHaveBeenCalledTimes(1);
  });

  it('says nothing while the copy may not be replaced', async () => {
    renderWithIssue(false);
    await screen.findByRole('button', { name: 'Change' });

    expect(screen.queryByText("The folder copy can't be read.")).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replace folder copy…' })).not.toBeInTheDocument();
  });

  it('reads the storage choice again when it changes elsewhere', async () => {
    localStorage.setItem(STORAGE_PROVIDER_KEY, 'local');
    renderWithProviders(<StorageSettings onRestore={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();

    localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
    act(() => folderAccessListeners.forEach((listener) => listener()));

    expect(await screen.findByRole('button', { name: 'Change' })).toBeInTheDocument();
  });
});
