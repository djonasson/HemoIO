/**
 * Tests for LabResultCard component
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { LabResultCard } from './LabResultCard';
import type { LabResultWithDetails, EnrichedTestValue } from '@hooks/useLabResults';

vi.mock('@hooks/usePreferences', () => ({
  usePreferences: () => ({
    unitPreferences: {},
    personalTargets: {},
    isLoaded: true,
    setPreferredUnit: vi.fn(),
    setPersonalTarget: vi.fn(),
    reload: vi.fn(),
  }),
}));

// Names and samples come from the LOINC catalog; these values' keys are not in it
vi.mock('@contexts/useCatalog', async () => {
  const { fixtureCatalog } = await import('@/test/loincFixture');
  const catalog = fixtureCatalog();
  return { useCatalog: () => catalog };
});

// Clean up after each test to ensure modals are properly unmounted
afterEach(() => {
  cleanup();
});

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider env="test">{ui}</MantineProvider>);
}

function createMockTestValue(
  id: number,
  options: Partial<EnrichedTestValue> = {}
): EnrichedTestValue {
  return {
    id,
    labResultId: 1,
    biomarkerKey: 'marker-1',
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
  it('shows "No date" for a result without a valid date', () => {
    const result = createMockResult({ date: new Date('garbage') });
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    expect(screen.getByText('No date')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid/i)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Lab result with no date' })).toBeInTheDocument();
  });

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

  it.each(['{Enter}', ' '])('opens the delete confirmation from the keyboard (%s)', async (key) => {
    const result = createMockResult();
    renderWithProviders(<LabResultCard result={result} onDelete={() => {}} />);

    screen.getByRole('button', { name: 'Delete this lab result' }).focus();
    await userEvent.keyboard(key);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // The card stays as it was: the key did not reach its expand button
    expect(screen.getByRole('button', { name: /^Expand lab result/, hidden: true })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
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

  it('tells screen readers its expand button is collapsed', () => {
    renderWithProviders(<LabResultCard result={createMockResult()} onDelete={() => {}} />);

    expect(screen.getByRole('button', { name: /expand/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('tells screen readers its expand button is expanded once clicked', () => {
    renderWithProviders(<LabResultCard result={createMockResult()} onDelete={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /expand/i }));

    expect(screen.getByRole('button', { name: /collapse/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('holds no other button in its expand button, hidden or not', () => {
    renderWithProviders(<LabResultCard result={createMockResult()} onDelete={() => {}} />);

    const expandButton = screen.getByRole('button', { name: /expand/i });
    expect(expandButton.querySelector('button, [role="button"], [tabindex]:not([tabindex="0"])')).toBeNull();
  });

  it('should render with defaultExpanded true', () => {
    const result = createMockResult();
    renderWithProviders(
      <LabResultCard result={result} onDelete={() => {}} defaultExpanded />
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
  });
  it("opens a test's trend at the result's date", async () => {
    const onOpenTrend = vi.fn();
    const result = createMockResult({ date: new Date('2024-01-15T12:00:00Z') });
    renderWithProviders(
      <LabResultCard result={result} onDelete={() => {}} defaultExpanded onOpenTrend={onOpenTrend} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hemoglobin, open trend' }));

    expect(onOpenTrend).toHaveBeenCalledWith('marker-1', new Date('2024-01-15T12:00:00Z'), 1);
  });

  it('offers no trend links on an undated result: its values are on no trend', () => {
    const result = createMockResult({ date: new Date('garbage') });
    renderWithProviders(
      <LabResultCard result={result} onDelete={() => {}} defaultExpanded onOpenTrend={vi.fn()} />
    );

    expect(screen.queryByRole('button', { name: 'Hemoglobin, open trend' })).not.toBeInTheDocument();
  });
});
