/**
 * Tests for TimelineView component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { TimelineView } from './TimelineView';
import { notifications } from '@mantine/notifications';
import type { LabResultWithDetails } from '@hooks/useLabResults';

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

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

// Mock useLabResults hook
vi.mock('@hooks/useLabResults', () => ({
  useLabResults: vi.fn(),
}));

// Mock useNotes hook
vi.mock('@hooks/useNotes', () => ({
  useNotes: vi.fn(() => ({
    notes: [],
    isLoading: false,
    error: null,
    filters: {},
    setFilters: vi.fn(),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    refresh: vi.fn(),
    getNotesForLabResult: vi.fn(() => []),
    getNotesForBiomarker: vi.fn(() => []),
    getNotesForTestValue: vi.fn(() => []),
    allTags: [],
  })),
}));

// Mock the biomarker dictionary
vi.mock('@data/biomarkers/dictionary', () => ({
  findBiomarker: vi.fn(() => null),
}));

import { useLabResults } from '@hooks/useLabResults';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MantineProvider env="test">
      <DatesProvider settings={{ locale: 'en' }}>{ui}</DatesProvider>
    </MantineProvider>
  );
}

function createMockResult(
  id: number,
  date: string,
  labName: string,
  abnormalCount = 0
): LabResultWithDetails {
  return {
    id,
    date: new Date(date),
    labName,
    createdAt: new Date(),
    updatedAt: new Date(),
    testValues: [],
    abnormalCount,
    totalCount: 3,
  };
}

describe('TimelineView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state', () => {
    vi.mocked(useLabResults).mockReturnValue({
      results: [],
      isLoading: true,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TimelineView onNavigateToImport={() => {}} />);

    expect(screen.getByText(/loading lab results/i)).toBeInTheDocument();
  });

  it('should render error state', () => {
    vi.mocked(useLabResults).mockReturnValue({
      results: [],
      isLoading: false,
      error: 'Database connection failed',
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TimelineView onNavigateToImport={() => {}} />);

    expect(screen.getByText(/database connection failed/i)).toBeInTheDocument();
    expect(screen.getByText(/try again/i)).toBeInTheDocument();
  });

  it('should call refresh when try again is clicked', () => {
    const mockRefresh = vi.fn();
    vi.mocked(useLabResults).mockReturnValue({
      results: [],
      isLoading: false,
      error: 'Database error',
      filters: {},
      setFilters: vi.fn(),
      refresh: mockRefresh,
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TimelineView onNavigateToImport={() => {}} />);

    fireEvent.click(screen.getByText(/try again/i));

    expect(mockRefresh).toHaveBeenCalled();
  });

  it('should render empty state when no results', () => {
    vi.mocked(useLabResults).mockReturnValue({
      results: [],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TimelineView onNavigateToImport={() => {}} />);

    expect(screen.getByText(/no lab results yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /import lab results/i })
    ).toBeInTheDocument();
  });

  it('should call onNavigateToImport when import button is clicked', () => {
    const handleNavigate = vi.fn();
    vi.mocked(useLabResults).mockReturnValue({
      results: [],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TimelineView onNavigateToImport={handleNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: /import lab results/i }));

    expect(handleNavigate).toHaveBeenCalled();
  });

  it('should render lab result cards', () => {
    const mockResults = [
      createMockResult(1, '2024-01-15', 'Quest Diagnostics'),
      createMockResult(2, '2024-03-20', 'LabCorp'),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      results: mockResults,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TimelineView onNavigateToImport={() => {}} />);

    expect(screen.getByText('Quest Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('LabCorp')).toBeInTheDocument();
  });

  it('should render filters', () => {
    const mockResults = [createMockResult(1, '2024-01-15', 'Quest Diagnostics')];

    vi.mocked(useLabResults).mockReturnValue({
      results: mockResults,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TimelineView onNavigateToImport={() => {}} />);

    expect(screen.getByLabelText(/search by lab name/i)).toBeInTheDocument();
  });

  it('should show no results message when filters match nothing', () => {
    vi.mocked(useLabResults).mockReturnValue({
      results: [],
      isLoading: false,
      error: null,
      filters: { searchTerm: 'nonexistent' },
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TimelineView onNavigateToImport={() => {}} />);

    expect(screen.getByText(/no lab results match your filters/i)).toBeInTheDocument();
    expect(screen.getByText(/clear filters/i)).toBeInTheDocument();
  });

  it('should clear filters when clear filters link is clicked', () => {
    const mockSetFilters = vi.fn();
    vi.mocked(useLabResults).mockReturnValue({
      results: [],
      isLoading: false,
      error: null,
      filters: { searchTerm: 'nonexistent' },
      setFilters: mockSetFilters,
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TimelineView onNavigateToImport={() => {}} />);

    fireEvent.click(screen.getByText(/clear filters/i));

    expect(mockSetFilters).toHaveBeenCalledWith({});
  });

  it('should call deleteResult when card delete is confirmed', async () => {
    const mockDelete = vi.fn();
    const mockResults = [createMockResult(42, '2024-01-15', 'Quest Diagnostics')];

    vi.mocked(useLabResults).mockReturnValue({
      results: mockResults,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: mockDelete,
    });

    renderWithProviders(<TimelineView onNavigateToImport={() => {}} />);

    // Open delete modal
    const deleteButton = screen.getByRole('button', { name: /delete this lab result/i });
    fireEvent.click(deleteButton);

    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Confirm delete
    const dialog = screen.getByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: /^delete$/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith(42);
    });
  });

  it('should update filters when setFilters is called', () => {
    const mockSetFilters = vi.fn();
    const mockResults = [createMockResult(1, '2024-01-15', 'Quest Diagnostics')];

    vi.mocked(useLabResults).mockReturnValue({
      results: mockResults,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: mockSetFilters,
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TimelineView onNavigateToImport={() => {}} />);

    // Type in search field
    const searchInput = screen.getByLabelText(/search by lab name/i);
    fireEvent.change(searchInput, { target: { value: 'Quest' } });

    expect(mockSetFilters).toHaveBeenCalledWith({ searchTerm: 'Quest' });
  });

  describe('deleting a lab result', () => {
    async function deleteFirstResult(deleteResult: () => Promise<void>) {
      vi.mocked(useLabResults).mockReturnValue({
        results: [createMockResult(1, '2024-01-15', 'Quest Diagnostics')],
        isLoading: false,
        error: null,
        filters: {},
        setFilters: vi.fn(),
        refresh: vi.fn(),
        deleteResult,
      });
      renderWithProviders(<TimelineView onNavigateToImport={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Delete this lab result' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    }

    it('shows a success notification after deleting', async () => {
      const deleteResult = vi.fn().mockResolvedValue(undefined);

      await deleteFirstResult(deleteResult);

      await waitFor(() => {
        expect(notifications.show).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Lab result deleted', color: 'green' })
        );
      });
      expect(deleteResult).toHaveBeenCalledWith(1);
    });

    it('shows an error notification when deleting fails', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const deleteResult = vi.fn().mockRejectedValue(new Error('Database error'));

      await deleteFirstResult(deleteResult);

      await waitFor(() => {
        expect(notifications.show).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Could not delete lab result', color: 'red' })
        );
      });
      expect(consoleError).toHaveBeenCalledWith('Failed to delete result:', expect.any(Error));
    });
  });

  it('opens the requested lab result', () => {
    vi.mocked(useLabResults).mockReturnValue({
      results: [
        createMockResult(1, '2024-01-15', 'Quest Diagnostics'),
        createMockResult(2, '2024-03-20', 'LabCorp'),
      ],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TimelineView onNavigateToImport={() => {}} focusLabResultId={2} />);

    const regions = screen.getAllByRole('region', { name: /^Lab result from / });
    const expanded = regions.filter((r) => r.getAttribute('aria-expanded') === 'true');
    expect(expanded).toHaveLength(1);
    expect(expanded[0]).toHaveTextContent('LabCorp');
    expect(expanded[0]).toHaveFocus();
  });
});
