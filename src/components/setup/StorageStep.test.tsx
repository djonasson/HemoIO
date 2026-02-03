import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { StorageStep } from './StorageStep';
import type { StorageProviderType } from '@/types';

function renderStorageStep(props: Partial<{
  selectedStorage: StorageProviderType;
  onStorageChange: (storage: StorageProviderType) => void;
}> = {}) {
  const defaultProps = {
    selectedStorage: 'local' as StorageProviderType,
    onStorageChange: vi.fn(),
    ...props,
  };

  return render(
    <MantineProvider>
      <StorageStep {...defaultProps} />
    </MantineProvider>
  );
}

describe('StorageStep', () => {
  describe('Rendering', () => {
    it('renders storage options heading text', () => {
      renderStorageStep();

      expect(screen.getByText(/Choose where to store your encrypted lab data/)).toBeInTheDocument();
    });

    it('renders Local Storage option', () => {
      renderStorageStep();

      expect(screen.getByText('Local Storage')).toBeInTheDocument();
      expect(screen.getByText(/Store data in your browser/)).toBeInTheDocument();
    });

    it('renders Dropbox option', () => {
      renderStorageStep();

      expect(screen.getByText('Dropbox')).toBeInTheDocument();
      expect(screen.getByText(/Sync encrypted data across devices via Dropbox/)).toBeInTheDocument();
    });

    it('renders Google Drive option', () => {
      renderStorageStep();

      expect(screen.getByText('Google Drive')).toBeInTheDocument();
      expect(screen.getByText(/Sync encrypted data across devices via Google Drive/)).toBeInTheDocument();
    });

    it('shows coming soon note for cloud storage', () => {
      renderStorageStep();

      expect(screen.getByText(/Cloud storage options will be available in a future update/)).toBeInTheDocument();
    });

    it('shows encryption note', () => {
      renderStorageStep();

      expect(screen.getByText(/All data is encrypted before being stored/)).toBeInTheDocument();
    });
  });

  describe('Selection', () => {
    it('shows Local Storage as selected by default', () => {
      renderStorageStep({ selectedStorage: 'local' });

      const localOption = screen.getByRole('radio', { name: /Local Storage/i });
      expect(localOption).toHaveAttribute('aria-checked', 'true');
    });

    it('calls onStorageChange when Local Storage is clicked', () => {
      const onStorageChange = vi.fn();
      renderStorageStep({ selectedStorage: 'dropbox', onStorageChange });

      const localOption = screen.getByText('Local Storage').closest('[role="radio"]');
      fireEvent.click(localOption!);

      expect(onStorageChange).toHaveBeenCalledWith('local');
    });

    it('does not call onStorageChange when clicking disabled option', () => {
      const onStorageChange = vi.fn();
      renderStorageStep({ onStorageChange });

      const dropboxOption = screen.getByText('Dropbox').closest('[role="radio"]');
      fireEvent.click(dropboxOption!);

      expect(onStorageChange).not.toHaveBeenCalled();
    });
  });

  describe('Disabled options', () => {
    it('shows Dropbox as coming soon', () => {
      renderStorageStep();

      const dropboxOption = screen.getByText('Dropbox').closest('[role="radio"]');
      expect(dropboxOption).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getAllByText('(Coming soon)').length).toBeGreaterThanOrEqual(1);
    });

    it('shows Google Drive as coming soon', () => {
      renderStorageStep();

      const googleDriveOption = screen.getByText('Google Drive').closest('[role="radio"]');
      expect(googleDriveOption).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('Accessibility', () => {
    it('has radiogroup role', () => {
      renderStorageStep();

      expect(screen.getByRole('radiogroup', { name: /Storage provider selection/i })).toBeInTheDocument();
    });

    it('allows keyboard selection with Enter', () => {
      const onStorageChange = vi.fn();
      renderStorageStep({ onStorageChange });

      const localOption = screen.getByText('Local Storage').closest('[role="radio"]');
      fireEvent.keyDown(localOption!, { key: 'Enter' });

      expect(onStorageChange).toHaveBeenCalledWith('local');
    });

    it('allows keyboard selection with Space', () => {
      const onStorageChange = vi.fn();
      renderStorageStep({ onStorageChange });

      const localOption = screen.getByText('Local Storage').closest('[role="radio"]');
      fireEvent.keyDown(localOption!, { key: ' ' });

      expect(onStorageChange).toHaveBeenCalledWith('local');
    });

    it('disabled options have tabIndex -1', () => {
      renderStorageStep();

      const dropboxOption = screen.getByText('Dropbox').closest('[role="radio"]');
      expect(dropboxOption).toHaveAttribute('tabIndex', '-1');
    });

    it('enabled option has tabIndex 0', () => {
      renderStorageStep();

      const localOption = screen.getByText('Local Storage').closest('[role="radio"]');
      expect(localOption).toHaveAttribute('tabIndex', '0');
    });
  });
});
