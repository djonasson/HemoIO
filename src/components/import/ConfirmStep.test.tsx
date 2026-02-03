import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ConfirmStep } from './ConfirmStep';
import type { ReviewedResult } from './ReviewStep';

const mockResult: ReviewedResult = {
  fileId: 'file1',
  fileName: 'lab-report.pdf',
  labDate: '2024-01-15',
  labName: 'Test Lab',
  confidence: 0.9,
  warnings: [],
  success: true,
  biomarkers: [
    {
      name: 'Glucose',
      value: 100,
      unit: 'mg/dL',
      confidence: 0.95,
      isExactMatch: true,
      normalizedUnit: 'mg/dL',
      referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
    },
  ],
  editedBiomarkers: [
    {
      name: 'Glucose',
      value: 100,
      unit: 'mg/dL',
      confidence: 0.95,
      isExactMatch: true,
      normalizedUnit: 'mg/dL',
      referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
    },
  ],
  editedLabDate: '2024-01-15',
  editedLabName: 'Test Lab',
};

function renderConfirmStep(props: Partial<React.ComponentProps<typeof ConfirmStep>> = {}) {
  const defaultProps = {
    results: [mockResult],
    onConfirm: vi.fn(),
    onBack: vi.fn(),
    ...props,
  };

  return render(
    <MantineProvider>
      <ConfirmStep {...defaultProps} />
    </MantineProvider>
  );
}

describe('ConfirmStep', () => {
  it('renders summary cards with correct labels', () => {
    renderConfirmStep();

    // Should show summary card labels
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('Biomarkers')).toBeInTheDocument();
    expect(screen.getByText('Lab Date(s)')).toBeInTheDocument();
    expect(screen.getByText('Lab(s)')).toBeInTheDocument();
  });

  it('displays lab date in summary', () => {
    renderConfirmStep();

    expect(screen.getByText('Lab Date(s)')).toBeInTheDocument();
    // Lab date appears in both summary and detailed view
    expect(screen.getAllByText('2024-01-15').length).toBeGreaterThanOrEqual(1);
  });

  it('displays lab name in summary', () => {
    renderConfirmStep();

    expect(screen.getByText('Lab(s)')).toBeInTheDocument();
    // Lab name appears in both summary and detailed view
    expect(screen.getAllByText('Test Lab').length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Not specified" when no lab date is provided', () => {
    const resultWithoutDate: ReviewedResult = {
      ...mockResult,
      labDate: undefined,
      editedLabDate: undefined,
      labName: undefined,
      editedLabName: undefined,
    };

    renderConfirmStep({ results: [resultWithoutDate] });

    // "Not specified" appears for both date and lab name when not provided
    expect(screen.getAllByText('Not specified').length).toBeGreaterThanOrEqual(1);
  });

  it('displays file name in detailed summary', () => {
    renderConfirmStep();

    expect(screen.getByText('lab-report.pdf')).toBeInTheDocument();
  });

  it('displays biomarker details in table', () => {
    renderConfirmStep();

    expect(screen.getByText('Glucose')).toBeInTheDocument();
    expect(screen.getByText('100 mg/dL')).toBeInTheDocument();
  });

  it('displays reference range in table', () => {
    renderConfirmStep();

    expect(screen.getByText('70 - 100 mg/dL')).toBeInTheDocument();
  });

  it('shows dash when no reference range is provided', () => {
    const resultWithoutRange: ReviewedResult = {
      ...mockResult,
      editedBiomarkers: [
        {
          name: 'Test Marker',
          value: 50,
          unit: 'U/L',
          confidence: 0.9,
          isExactMatch: true,
          normalizedUnit: 'U/L',
        },
      ],
    };

    renderConfirmStep({ results: [resultWithoutRange] });

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows ready to save message', () => {
    renderConfirmStep();

    expect(screen.getByText('Ready to Save')).toBeInTheDocument();
    expect(
      screen.getByText(/Click "Save Results" to add these values/)
    ).toBeInTheDocument();
  });

  it('displays back button', () => {
    renderConfirmStep();

    expect(screen.getByRole('button', { name: /Back to Review/i })).toBeInTheDocument();
  });

  it('displays save button', () => {
    renderConfirmStep();

    expect(screen.getByRole('button', { name: /Save Results/i })).toBeInTheDocument();
  });

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn();
    renderConfirmStep({ onBack });

    fireEvent.click(screen.getByRole('button', { name: /Back to Review/i }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when save button is clicked', () => {
    const onConfirm = vi.fn();
    renderConfirmStep({ onConfirm });

    fireEvent.click(screen.getByRole('button', { name: /Save Results/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('handles multiple results', () => {
    const secondResult: ReviewedResult = {
      ...mockResult,
      fileId: 'file2',
      fileName: 'second-report.pdf',
      editedBiomarkers: [
        {
          name: 'Hemoglobin',
          value: 14.5,
          unit: 'g/dL',
          confidence: 0.9,
          isExactMatch: true,
          normalizedUnit: 'g/dL',
          referenceRange: { low: 12, high: 17.5, unit: 'g/dL' },
        },
      ],
    };

    renderConfirmStep({ results: [mockResult, secondResult] });

    // Should show both file names
    expect(screen.getByText('lab-report.pdf')).toBeInTheDocument();
    expect(screen.getByText('second-report.pdf')).toBeInTheDocument();

    // Should show both biomarkers
    expect(screen.getByText('Glucose')).toBeInTheDocument();
    expect(screen.getByText('Hemoglobin')).toBeInTheDocument();
  });

  it('shows correct total counts for multiple results', () => {
    const secondResult: ReviewedResult = {
      ...mockResult,
      fileId: 'file2',
      fileName: 'second-report.pdf',
      editedBiomarkers: [
        { name: 'Hemoglobin', value: 14.5, unit: 'g/dL', confidence: 0.9, isExactMatch: true, normalizedUnit: 'g/dL' },
        { name: 'Hematocrit', value: 45, unit: '%', confidence: 0.9, isExactMatch: true, normalizedUnit: '%' },
      ],
    };

    renderConfirmStep({ results: [mockResult, secondResult] });

    // Should show 2 files
    expect(screen.getByText('2')).toBeInTheDocument();

    // Should show 3 total biomarkers (1 + 2)
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
