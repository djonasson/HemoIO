/**
 * Tests for BackupRestore component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { BackupRestore } from './BackupRestore';
import type { ExportDataSources } from '@services/export';

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

function createMockDataSources(isEmpty = false): ExportDataSources {
  if (isEmpty) {
    return {
      labResults: [],
      testValues: [],
      userNotes: [],
      userPreferences: null,
      settings: null,
    };
  }

  return {
    labResults: [
      {
        id: 1,
        date: new Date('2024-01-15'),
        labName: 'Quest Diagnostics',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        date: new Date('2024-03-20'),
        labName: 'LabCorp',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    testValues: [
      {
        id: 1,
        labResultId: 1,
        biomarkerId: 1,
        value: 95,
        unit: 'mg/dL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    userNotes: [
      {
        id: 1,
        content: 'Test note',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    userPreferences: null,
    settings: null,
  };
}

describe('BackupRestore', () => {
  const defaultProps = {
    dataSources: createMockDataSources(),
    onRestore: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render main title', () => {
      renderWithProviders(<BackupRestore {...defaultProps} />);

      expect(screen.getByText('Backup & Restore')).toBeInTheDocument();
    });

    it('should render section headers', () => {
      renderWithProviders(<BackupRestore {...defaultProps} />);

      expect(screen.getByText('Restore from Backup')).toBeInTheDocument();
    });

    it('should show data stats', () => {
      renderWithProviders(<BackupRestore {...defaultProps} />);

      expect(screen.getByText(/2 lab results/)).toBeInTheDocument();
      expect(screen.getByText(/1 test value/)).toBeInTheDocument();
      expect(screen.getByText(/1 note/)).toBeInTheDocument();
    });

    it('should show create backup button', () => {
      renderWithProviders(<BackupRestore {...defaultProps} />);

      expect(screen.getByRole('button', { name: /create backup/i })).toBeInTheDocument();
    });

    it('should show file input for restore', () => {
      renderWithProviders(<BackupRestore {...defaultProps} />);

      expect(screen.getByLabelText(/select backup file to restore/i)).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show warning when no data', () => {
      const props = {
        ...defaultProps,
        dataSources: createMockDataSources(true),
      };

      renderWithProviders(<BackupRestore {...props} />);

      expect(screen.getByText(/don't have any data to backup/i)).toBeInTheDocument();
    });

    it('should disable create backup button when no data', () => {
      const props = {
        ...defaultProps,
        dataSources: createMockDataSources(true),
      };

      renderWithProviders(<BackupRestore {...props} />);

      expect(screen.getByRole('button', { name: /create backup/i })).toBeDisabled();
    });
  });

  describe('create backup button', () => {
    it('should be enabled when data exists', () => {
      renderWithProviders(<BackupRestore {...defaultProps} />);

      expect(screen.getByRole('button', { name: /create backup/i })).not.toBeDisabled();
    });
  });

  describe('processing state', () => {
    it('should disable buttons when processing', () => {
      renderWithProviders(<BackupRestore {...defaultProps} isProcessing />);

      expect(screen.getByRole('button', { name: /create backup/i })).toBeDisabled();
    });
  });
});
