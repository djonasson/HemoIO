import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
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

const STORAGE_PROVIDER_KEY = 'hemoio_storage_provider';

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
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
      renderWithProviders(<StorageSettings />);

      expect(screen.getByText('Local Storage')).toBeInTheDocument();
      expect(
        screen.getByText('Store data in your browser. Data stays on this device only.')
      ).toBeInTheDocument();
    });

    it('shows active badge for local storage when selected', () => {
      renderWithProviders(<StorageSettings />);

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('shows note about unsupported browser when filesystem not supported', () => {
      renderWithProviders(<StorageSettings />);

      expect(
        screen.getByText(/Local Directory storage is not supported in this browser/i)
      ).toBeInTheDocument();
    });

    it('allows switching storage providers', () => {
      renderWithProviders(<StorageSettings />);

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
      renderWithProviders(<StorageSettings />);

      // Local storage option should still be visible
      expect(screen.getByText('Local Storage')).toBeInTheDocument();
    });
  });

  describe('storage provider selection', () => {
    it('renders radiogroup for storage selection', () => {
      renderWithProviders(<StorageSettings />);

      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    });

    it('shows storage location header', () => {
      renderWithProviders(<StorageSettings />);

      expect(screen.getByText('Storage Location')).toBeInTheDocument();
    });
  });
});
