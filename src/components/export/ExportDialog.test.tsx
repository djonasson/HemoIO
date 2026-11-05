/**
 * Tests for ExportDialog component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { ExportDialog } from './ExportDialog';
import type { LabResultForExport, ExportDataSources } from '@services/export';
import type { LabResult, TestValue } from '@/types';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MantineProvider env="test">
      <DatesProvider settings={{ locale: 'en' }}>{ui}</DatesProvider>
    </MantineProvider>
  );
}

function createMockLabResultForExport(): LabResultForExport {
  const labResult: LabResult = {
    id: 1,
    date: new Date('2024-01-15'),
    labName: 'Quest Diagnostics',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testValues: TestValue[] = [
    {
      id: 1,
      labResultId: 1,
      biomarkerKey: 'marker-1',
      value: 95,
      unit: 'mg/dL',
      referenceRangeLow: 70,
      referenceRangeHigh: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  return {
    labResult,
    testValues,
    biomarkerNames: new Map([['marker-1', 'Glucose']]),
  };
}

function createMockDataSources(): ExportDataSources {
  return {
    labResults: [
      {
        id: 1,
        date: new Date('2024-01-15'),
        labName: 'Quest Diagnostics',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    testValues: [
      {
        id: 1,
        labResultId: 1,
        biomarkerKey: 'marker-1',
        value: 95,
        unit: 'mg/dL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    userNotes: [],
    userPreferences: null,
    settings: null,
  };
}

describe('ExportDialog', () => {
  const defaultProps = {
    opened: true,
    onClose: vi.fn(),
    labResultsData: [createMockLabResultForExport()],
    fullDataSources: createMockDataSources(),
    biomarkerOptions: [{ value: 'marker-1', label: 'Glucose', keys: ['marker-1'] }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('waits for the current data before allowing an export', () => {
      renderWithProviders(<ExportDialog {...defaultProps} isLoading />);
      expect(screen.getByRole('button', { name: /^Export$/ })).toBeDisabled();
    });

    it('should render dialog when opened', () => {
      renderWithProviders(<ExportDialog {...defaultProps} />);

      expect(screen.getByText('Export Data')).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      renderWithProviders(<ExportDialog {...defaultProps} opened={false} />);

      expect(screen.queryByText('Export Data')).not.toBeInTheDocument();
    });

    it('should show format selection', () => {
      renderWithProviders(<ExportDialog {...defaultProps} />);

      expect(screen.getByText('Export Format')).toBeInTheDocument();
    });

    it('should show export preview', () => {
      renderWithProviders(<ExportDialog {...defaultProps} />);

      expect(screen.getByText('Export Preview')).toBeInTheDocument();
      expect(screen.getByText(/1 lab result/)).toBeInTheDocument();
    });

    it('includes the values of every code of a chosen test', async () => {
      const [result] = defaultProps.labResultsData;
      const glucose = { ...result.testValues[0], biomarkerKey: '2345-7' };
      const molar = { ...glucose, id: 2, biomarkerKey: '14749-6', value: 5, unit: 'mmol/L' };
      const hemoglobin = { ...glucose, id: 3, biomarkerKey: '718-7', value: 14, unit: 'g/dL' };
      renderWithProviders(
        <ExportDialog
          {...defaultProps}
          labResultsData={[{ ...result, testValues: [glucose, molar, hemoglobin] }]}
          biomarkerOptions={[
            { value: '2345-7', label: 'Glucose', keys: ['2345-7', '14749-6'] },
            { value: '718-7', label: 'Hemoglobin', keys: ['718-7'] },
          ]}
        />
      );

      await userEvent.click(screen.getByRole('textbox', { name: 'Select biomarkers to include' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Glucose' }));

      expect(await screen.findByText(/2 test values/)).toBeInTheDocument();
    });

    it('should show export and cancel buttons', () => {
      renderWithProviders(<ExportDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show warning when no data', () => {
      const props = {
        ...defaultProps,
        labResultsData: [],
        fullDataSources: {
          ...defaultProps.fullDataSources,
          labResults: [],
          testValues: [],
        },
      };

      renderWithProviders(<ExportDialog {...props} />);

      expect(screen.getByText(/no data to export/i)).toBeInTheDocument();
    });

    it('should disable export button when no data', () => {
      const props = {
        ...defaultProps,
        labResultsData: [],
      };

      renderWithProviders(<ExportDialog {...props} />);

      expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
    });
  });

  describe('format selection', () => {
    it('should default to CSV format', () => {
      renderWithProviders(<ExportDialog {...defaultProps} />);

      expect(screen.getByText('Date Range')).toBeInTheDocument();
    });

    it('should show CSV options when CSV selected', () => {
      renderWithProviders(<ExportDialog {...defaultProps} />);

      expect(screen.getByText('Date Range')).toBeInTheDocument();
      expect(screen.getByText('Biomarkers')).toBeInTheDocument();
      expect(screen.getByText('Include reference ranges')).toBeInTheDocument();
    });

    it('should show JSON description when JSON selected', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExportDialog {...defaultProps} />);

      // Click on the select to open it
      const formatSelect = screen.getByRole('textbox', { name: /select export format/i });
      await user.click(formatSelect);

      // Select JSON option
      await user.click(await screen.findByRole('option', { name: 'JSON (Full Backup)' }));

      expect(screen.getByText(/JSON export includes all lab results/)).toBeInTheDocument();
    });
  });

  describe('date range', () => {
    it('should show date range presets', () => {
      renderWithProviders(<ExportDialog {...defaultProps} />);

      expect(screen.getByText('Date Range')).toBeInTheDocument();
    });

    it('should show custom date inputs when custom is selected', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ExportDialog {...defaultProps} />);

      // Click on date range select
      const dateRangeSelect = screen.getByRole('textbox', { name: /select date range/i });
      await user.click(dateRangeSelect);

      // Select custom option
      await user.click(await screen.findByRole('option', { name: 'Custom Range' }));

      await waitFor(() => {
        expect(screen.getByLabelText('Start date')).toBeInTheDocument();
        expect(screen.getByLabelText('End date')).toBeInTheDocument();
      });
    });
  });

  describe('cancel', () => {
    it('should call onClose when cancel clicked', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<ExportDialog {...defaultProps} onClose={onClose} />);

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('export', () => {
    it('should have enabled export button with data', () => {
      renderWithProviders(<ExportDialog {...defaultProps} />);

      const exportButton = screen.getByRole('button', { name: /export/i });
      expect(exportButton).not.toBeDisabled();
    });

    it('exports nothing, not every value, once the chosen tests have no values left', async () => {
      const [result] = defaultProps.labResultsData;
      const glucose = { ...result.testValues[0], biomarkerKey: '2345-7' };
      const hemoglobin = { ...glucose, id: 2, biomarkerKey: '718-7', value: 14, unit: 'g/dL' };
      const options = [
        { value: '2345-7', label: 'Glucose', keys: ['2345-7'] },
        { value: '718-7', label: 'Hemoglobin', keys: ['718-7'] },
      ];
      const before = [{ ...result, testValues: [glucose, hemoglobin] }];
      const ui = (props: Partial<typeof defaultProps>) => (
        <MantineProvider env="test">
          <DatesProvider settings={{ locale: 'en' }}>
            <ExportDialog
              {...defaultProps}
              labResultsData={before}
              biomarkerOptions={options}
              {...props}
            />
          </DatesProvider>
        </MantineProvider>
      );
      const { rerender } = render(ui({}));
      await userEvent.click(screen.getByRole('textbox', { name: 'Select biomarkers to include' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Glucose' }));

      // The glucose values are deleted while the dialog is closed, then it opens on the data as it is now
      rerender(ui({ opened: false }));
      rerender(ui({ labResultsData: [{ ...result, testValues: [hemoglobin] }], biomarkerOptions: [options[1]] }));

      expect(await screen.findByText(/0 test values/)).toBeInTheDocument();
      expect(screen.getByText(/The biomarkers you chose have no values now/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Export$/ })).toBeDisabled();

      // Clearing the choice exports every biomarker again
      await userEvent.click(screen.getByRole('button', { name: 'Clear the choice' }));
      expect(await screen.findByText(/1 test value\b/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Export$/ })).toBeEnabled();
    });
  });

  describe('accessibility', () => {
    it('should have accessible labels on form controls', () => {
      renderWithProviders(<ExportDialog {...defaultProps} />);

      expect(screen.getByText('Export Format')).toBeInTheDocument();
      expect(screen.getByText('Date Range')).toBeInTheDocument();
    });
  });
});
