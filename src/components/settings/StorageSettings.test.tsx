import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { isFileSystemAccessSupported } from '@/utils/fileSystemSupport';
import { FileSystemStorageProvider } from '@data/storage/FileSystemStorageProvider';
import { notifyFolderAccessChanged } from '@data/storage/folderAccessEvents';
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

vi.mock('@data/storage/folderAccessEvents', () => ({
  notifyFolderAccessChanged: vi.fn(),
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

  it('does not list them with local storage', () => {
    folderProvider('granted');
    renderWithProviders(<StorageSettings onRestore={vi.fn()} />);

    expect(screen.queryByRole('region', { name: 'Folder backups' })).not.toBeInTheDocument();
  });
});

describe('StorageSettings tells folder sync when folder access changes', () => {
  function folderProvider(permission: 'granted' | 'prompt'): void {
    vi.mocked(isFileSystemAccessSupported).mockReturnValue(true);
    vi.mocked(FileSystemStorageProvider).mockImplementation(
      class {
        getDirectoryName = vi.fn().mockResolvedValue('Health');
        getPermissionState = vi.fn().mockResolvedValue(permission);
        requestPermission = vi.fn().mockResolvedValue('granted');
        selectDirectory = vi.fn().mockResolvedValue({ name: 'Other' });
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
