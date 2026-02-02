/**
 * Tests for LabResultCard component
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { LabResultCard } from './LabResultCard';
import type { LabResultWithDetails, EnrichedTestValue } from '@hooks/useLabResults';

// Mock the biomarker dictionary
vi.mock('@data/biomarkers/dictionary', () => ({
  findBiomarker: vi.fn(() => null),
}));

// Clean up after each test to ensure modals are properly unmounted
afterEach(() => {
  cleanup();
});

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

function createMockTestValue(
  id: number,
  options: Partial<EnrichedTestValue> = {}
): EnrichedTestValue {
  return {
    id,
    labResultId: 1,
    biomarkerId: 1,
    value: 14.5,
    unit: 'g/dL',
    status: 'normal',
    rawText: 'Hemoglobin',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...options,
  };
}

function createMockResult(
  options: Partial<LabResultWithDetails> = {}
): LabResultWithDetails {
  return {
    id: 1,
    date: new Date('2024-01-15'),
    labName: 'Quest Diagnostics',
    createdAt: new Date(),
    updatedAt: new Date(),
    testValues: [createMockTestValue(1)],
    abnormalCount: 0,
    totalCount: 1,
    ...options,
  };
}

describe('LabResultCard', () => {
  it('should render lab date', () => {
    const result = createMockResult();
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    expect(screen.getByText(/jan.*15.*2024/i)).toBeInTheDocument();
  });

  it('should render lab name', () => {
    const result = createMockResult({ labName: 'LabCorp' });
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    expect(screen.getByText('LabCorp')).toBeInTheDocument();
  });

  it('should render test count badge', () => {
    const result = createMockResult({ totalCount: 5 });
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    expect(screen.getByText('5 tests')).toBeInTheDocument();
  });

  it('should render singular test badge for single test', () => {
    const result = createMockResult({ totalCount: 1 });
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    expect(screen.getByText('1 test')).toBeInTheDocument();
  });

  it('should render abnormal count badge when there are abnormal values', () => {
    const result = createMockResult({ abnormalCount: 2 });
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    expect(screen.getByText('2 abnormal')).toBeInTheDocument();
  });

  it('should not render abnormal badge when no abnormal values', () => {
    const result = createMockResult({ abnormalCount: 0 });
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    expect(screen.queryByText(/abnormal/i)).not.toBeInTheDocument();
  });

  it('should expand when header is clicked', async () => {
    const result = createMockResult();
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    // Initially collapsed - test values not visible
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    // Click to expand
    const expandButton = screen.getByRole('button', { name: /expand/i });
    fireEvent.click(expandButton);

    // Now test values table should be visible
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  it('should collapse when expanded header is clicked', async () => {
    const result = createMockResult();
    renderWithProviders(
      <LabResultCard result={result} onDelete={() => {}} defaultExpanded />
    );

    // Initially expanded
    expect(screen.getByRole('table')).toBeInTheDocument();

    // Click to collapse
    const collapseButton = screen.getByRole('button', { name: /collapse/i });
    fireEvent.click(collapseButton);

    // Table should be hidden
    await waitFor(() => {
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  it('should expand with keyboard (Enter)', async () => {
    const result = createMockResult();
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    const expandButton = screen.getByRole('button', { name: /expand/i });
    fireEvent.keyDown(expandButton, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  it('should expand with keyboard (Space)', async () => {
    const result = createMockResult();
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    const expandButton = screen.getByRole('button', { name: /expand/i });
    fireEvent.keyDown(expandButton, { key: ' ' });

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  it('should open delete confirmation when delete button is clicked', async () => {
    const result = createMockResult();
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    const deleteButton = screen.getByRole('button', { name: /delete this lab result/i });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
  });

  it('should show warning about irreversible action in delete dialog', async () => {
    const result = createMockResult();
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    const deleteButton = screen.getByRole('button', { name: /delete this lab result/i });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    });
  });

  it('should call onDelete when deletion is confirmed', async () => {
    const handleDelete = vi.fn();
    const result = createMockResult({ id: 42 });
    renderWithProviders(<LabResultCard result={result} onDelete={handleDelete} />);

    // Open modal
    const deleteButton = screen.getByRole('button', { name: /delete this lab result/i });
    fireEvent.click(deleteButton);

    // Wait for modal and find confirm button
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Find the confirm button within the dialog
    const dialog = screen.getByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: /^delete$/i });
    fireEvent.click(confirmButton);

    expect(handleDelete).toHaveBeenCalledWith(42);
  });

  it('should close modal when cancel is clicked', async () => {
    const result = createMockResult();
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    // Open modal
    const deleteButton = screen.getByRole('button', { name: /delete this lab result/i });
    fireEvent.click(deleteButton);

    // Wait for modal
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Cancel
    const dialog = screen.getByRole('dialog');
    const cancelButton = within(dialog).getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('should not call onDelete when deletion is cancelled', async () => {
    const handleDelete = vi.fn();
    const result = createMockResult();
    renderWithProviders(<LabResultCard result={result} onDelete={handleDelete} />);

    // Open modal
    const deleteButton = screen.getByRole('button', { name: /delete this lab result/i });
    fireEvent.click(deleteButton);

    // Wait for modal
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Cancel
    const dialog = screen.getByRole('dialog');
    const cancelButton = within(dialog).getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(handleDelete).not.toHaveBeenCalled();
  });

  it('should have accessible region role', () => {
    const result = createMockResult();
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    expect(
      screen.getByRole('region', { name: /lab result from/i })
    ).toBeInTheDocument();
  });

  it('should have aria-expanded attribute', () => {
    const result = createMockResult();
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('aria-expanded', 'false');
  });

  it('should update aria-expanded when expanded', () => {
    const result = createMockResult();
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    const expandButton = screen.getByRole('button', { name: /expand/i });
    fireEvent.click(expandButton);

    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('aria-expanded', 'true');
  });

  it('should render with defaultExpanded true', () => {
    const result = createMockResult();
    renderWithProviders(
      <LabResultCard result={result} onDelete={() => {}} defaultExpanded />
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
