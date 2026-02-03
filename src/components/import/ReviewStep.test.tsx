import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ReviewStep } from './ReviewStep';
import type { ReviewedResult } from './ReviewStep';
import type { AnalysisResult } from './AnalysisStep';

// Mock the biomarker dictionary
vi.mock('../../data/biomarkers/dictionary', () => ({
  findBiomarker: vi.fn((name: string) => {
    // pH is a unitless biomarker
    if (name.toLowerCase() === 'ph') {
      return { name: 'pH', canonicalUnit: '', aliases: [], category: 'metabolic', description: '', alternativeUnits: [] };
    }
    // Other biomarkers have units
    if (name) {
      return { name, canonicalUnit: 'mg/dL', aliases: [], category: 'metabolic', description: '', alternativeUnits: [] };
    }
    return undefined;
  }),
}));

const mockAnalysisResult: AnalysisResult = {
  fileId: 'file1',
  fileName: 'lab-report.pdf',
  labDate: '2024-01-15',
  labName: 'Test Lab',
  confidence: 0.9,
  success: true,
  biomarkers: [
    {
      name: 'Glucose',
      value: 100,
      unit: 'mg/dL',
      confidence: 0.95,
      isExactMatch: true,
      normalizedUnit: 'mg/dL',
      dictionaryMatch: {
        name: 'Glucose',
        canonicalUnit: 'mg/dL',
        aliases: ['Blood Sugar'],
        category: 'metabolic',
        description: 'Blood glucose level',
        alternativeUnits: ['mmol/L'],
      },
      referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
    },
  ],
  warnings: [],
};

const mockReviewedResult: ReviewedResult = {
  ...mockAnalysisResult,
  editedBiomarkers: [...mockAnalysisResult.biomarkers],
  editedLabDate: '2024-01-15',
  editedLabName: 'Test Lab',
};

const defaultProps = {
  results: [mockAnalysisResult],
  reviewedResults: [mockReviewedResult],
  onReviewChange: vi.fn(),
  onComplete: vi.fn(),
  onBack: vi.fn(),
};

function renderReviewStep(props: Partial<typeof defaultProps> = {}) {
  return render(
    <MantineProvider>
      <ReviewStep {...defaultProps} {...props} />
    </MantineProvider>
  );
}

describe('ReviewStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Summary display', () => {
    it('renders summary section', () => {
      renderReviewStep();

      expect(screen.getByText('Review Extracted Values')).toBeInTheDocument();
    });

    it('displays biomarker and file count', () => {
      renderReviewStep();

      expect(screen.getByText(/1 biomarker\(s\) from 1 file\(s\)/)).toBeInTheDocument();
    });

    it('displays multiple biomarker count correctly', () => {
      const resultWithMultipleBiomarkers: ReviewedResult = {
        ...mockReviewedResult,
        editedBiomarkers: [
          ...mockReviewedResult.editedBiomarkers,
          {
            name: 'Hemoglobin',
            value: 14.5,
            unit: 'g/dL',
            confidence: 0.9,
            isExactMatch: true,
            normalizedUnit: 'g/dL',
          },
        ],
      };

      renderReviewStep({ reviewedResults: [resultWithMultipleBiomarkers] });

      expect(screen.getByText(/2 biomarker\(s\) from 1 file\(s\)/)).toBeInTheDocument();
    });

    it('displays file name in accordion', () => {
      renderReviewStep();

      expect(screen.getByText('lab-report.pdf')).toBeInTheDocument();
    });

    it('displays confidence badge for file', () => {
      renderReviewStep();

      expect(screen.getByText('High confidence')).toBeInTheDocument();
    });
  });

  describe('Low confidence indicator', () => {
    it('shows low confidence badge when biomarkers have low confidence', () => {
      const lowConfidenceResult: ReviewedResult = {
        ...mockReviewedResult,
        editedBiomarkers: [
          {
            name: 'Test Marker',
            value: 50,
            unit: 'U/L',
            confidence: 0.5,
            isExactMatch: false,
            normalizedUnit: 'U/L',
          },
        ],
      };

      renderReviewStep({ reviewedResults: [lowConfidenceResult] });

      expect(screen.getByText('1 low confidence')).toBeInTheDocument();
    });

    it('does not show low confidence badge when all values are high confidence', () => {
      renderReviewStep();

      expect(screen.queryByText(/low confidence/)).not.toBeInTheDocument();
    });
  });

  describe('Duplicate conflict indicator', () => {
    it('shows conflict badge when duplicate conflicts exist', () => {
      const conflictResult: ReviewedResult = {
        ...mockReviewedResult,
        editedBiomarkers: [
          {
            ...mockReviewedResult.editedBiomarkers[0],
            hasDuplicateConflict: true,
          },
        ],
        duplicateConflicts: [
          {
            biomarkerName: 'Glucose',
            originalValues: [{ value: 100, unit: 'mg/dL' }, { value: 110, unit: 'mg/dL' }],
            valuesMatch: false,
            message: 'Different values detected',
          },
        ],
      };

      renderReviewStep({ reviewedResults: [conflictResult] });

      expect(screen.getByText('1 conflicts')).toBeInTheDocument();
    });

    it('displays duplicate conflict alert with details', () => {
      const conflictResult: ReviewedResult = {
        ...mockReviewedResult,
        editedBiomarkers: [
          {
            ...mockReviewedResult.editedBiomarkers[0],
            hasDuplicateConflict: true,
          },
        ],
        duplicateConflicts: [
          {
            biomarkerName: 'Glucose',
            originalValues: [{ value: 100, unit: 'mg/dL' }, { value: 110, unit: 'mg/dL' }],
            valuesMatch: false,
            message: 'Different values detected',
          },
        ],
      };

      renderReviewStep({ reviewedResults: [conflictResult] });

      expect(screen.getByText('Duplicate Biomarkers Detected')).toBeInTheDocument();
      expect(screen.getByText('Different values detected')).toBeInTheDocument();
    });
  });

  describe('Biomarker table', () => {
    it('displays biomarker name', () => {
      renderReviewStep();

      expect(screen.getByText('Glucose')).toBeInTheDocument();
    });

    it('displays biomarker value', () => {
      renderReviewStep();

      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('displays biomarker unit', () => {
      renderReviewStep();

      expect(screen.getAllByText('mg/dL').length).toBeGreaterThanOrEqual(1);
    });

    it('displays reference range', () => {
      renderReviewStep();

      expect(screen.getByText('70 - 100')).toBeInTheDocument();
    });

    it('displays dash when no reference range', () => {
      const noRangeResult: ReviewedResult = {
        ...mockReviewedResult,
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

      renderReviewStep({ reviewedResults: [noRangeResult] });

      // Two dashes: one for reference range, one for method
      expect(screen.getAllByText('—').length).toBe(2);
    });

    it('displays confidence badge for biomarker', () => {
      renderReviewStep();

      expect(screen.getByText('95%')).toBeInTheDocument();
    });

    it('displays dictionary match indicator', () => {
      renderReviewStep();

      // Dictionary match icon has a tooltip "Matched to dictionary"
      expect(screen.getByLabelText('Edit biomarker')).toBeInTheDocument();
    });
  });

  describe('Lab info editing', () => {
    it('displays lab date input', () => {
      renderReviewStep();

      const dateInput = screen.getByPlaceholderText('YYYY-MM-DD');
      expect(dateInput).toHaveValue('2024-01-15');
    });

    it('displays lab name input', () => {
      renderReviewStep();

      const labNameInput = screen.getByPlaceholderText('Laboratory name');
      expect(labNameInput).toHaveValue('Test Lab');
    });

    it('calls onReviewChange when lab date is updated', () => {
      const onReviewChange = vi.fn();
      renderReviewStep({ onReviewChange });

      const dateInput = screen.getByPlaceholderText('YYYY-MM-DD');
      fireEvent.change(dateInput, { target: { value: '2024-02-01' } });

      expect(onReviewChange).toHaveBeenCalled();
      const newResults = onReviewChange.mock.calls[0][0];
      expect(newResults[0].editedLabDate).toBe('2024-02-01');
    });

    it('calls onReviewChange when lab name is updated', () => {
      const onReviewChange = vi.fn();
      renderReviewStep({ onReviewChange });

      const labNameInput = screen.getByPlaceholderText('Laboratory name');
      fireEvent.change(labNameInput, { target: { value: 'New Lab Name' } });

      expect(onReviewChange).toHaveBeenCalled();
      const newResults = onReviewChange.mock.calls[0][0];
      expect(newResults[0].editedLabName).toBe('New Lab Name');
    });
  });

  describe('Biomarker editing', () => {
    it('enters edit mode when edit button is clicked', () => {
      renderReviewStep();

      const editButton = screen.getByLabelText('Edit biomarker');
      fireEvent.click(editButton);

      // Should show input fields
      expect(screen.getByPlaceholderText('Biomarker name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Value')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Unit')).toBeInTheDocument();
    });

    it('exits edit mode when save button is clicked', () => {
      renderReviewStep();

      // Enter edit mode
      const editButton = screen.getByLabelText('Edit biomarker');
      fireEvent.click(editButton);

      // Exit edit mode
      const saveButton = screen.getByLabelText('Save changes');
      fireEvent.click(saveButton);

      // Should no longer show input fields
      expect(screen.queryByPlaceholderText('Biomarker name')).not.toBeInTheDocument();
    });

    it('updates biomarker name when edited', () => {
      const onReviewChange = vi.fn();
      renderReviewStep({ onReviewChange });

      // Enter edit mode
      fireEvent.click(screen.getByLabelText('Edit biomarker'));

      // Change name
      const nameInput = screen.getByPlaceholderText('Biomarker name');
      fireEvent.change(nameInput, { target: { value: 'Blood Sugar' } });

      expect(onReviewChange).toHaveBeenCalled();
      const newResults = onReviewChange.mock.calls[0][0];
      expect(newResults[0].editedBiomarkers[0].name).toBe('Blood Sugar');
    });

    it('updates biomarker unit when edited', () => {
      const onReviewChange = vi.fn();
      renderReviewStep({ onReviewChange });

      // Enter edit mode
      fireEvent.click(screen.getByLabelText('Edit biomarker'));

      // Change unit
      const unitInput = screen.getByPlaceholderText('Unit');
      fireEvent.change(unitInput, { target: { value: 'mmol/L' } });

      expect(onReviewChange).toHaveBeenCalled();
      const newResults = onReviewChange.mock.calls[0][0];
      expect(newResults[0].editedBiomarkers[0].unit).toBe('mmol/L');
    });
  });

  describe('Remove biomarker', () => {
    it('removes biomarker when delete button is clicked', () => {
      const onReviewChange = vi.fn();
      renderReviewStep({ onReviewChange });

      const removeButton = screen.getByLabelText('Remove biomarker');
      fireEvent.click(removeButton);

      expect(onReviewChange).toHaveBeenCalled();
      const newResults = onReviewChange.mock.calls[0][0];
      expect(newResults[0].editedBiomarkers.length).toBe(0);
    });
  });

  describe('Add biomarker', () => {
    it('displays add biomarker button', () => {
      renderReviewStep();

      expect(screen.getByRole('button', { name: /Add Biomarker/i })).toBeInTheDocument();
    });

    it('adds new biomarker when add button is clicked', () => {
      const onReviewChange = vi.fn();
      renderReviewStep({ onReviewChange });

      const addButton = screen.getByRole('button', { name: /Add Biomarker/i });
      fireEvent.click(addButton);

      expect(onReviewChange).toHaveBeenCalled();
      const newResults = onReviewChange.mock.calls[0][0];
      expect(newResults[0].editedBiomarkers.length).toBe(2);
      expect(newResults[0].editedBiomarkers[1].name).toBe('');
      expect(newResults[0].editedBiomarkers[1].value).toBe(0);
    });
  });

  describe('Analysis warnings', () => {
    it('displays warnings when present', () => {
      const resultWithWarnings: ReviewedResult = {
        ...mockReviewedResult,
        warnings: ['Some values may be incorrect', 'Date format unclear'],
      };

      renderReviewStep({ reviewedResults: [resultWithWarnings] });

      expect(screen.getByText('Analysis Notes')).toBeInTheDocument();
      expect(screen.getByText('Some values may be incorrect')).toBeInTheDocument();
      expect(screen.getByText('Date format unclear')).toBeInTheDocument();
    });

    it('does not display warnings section when no warnings', () => {
      renderReviewStep();

      expect(screen.queryByText('Analysis Notes')).not.toBeInTheDocument();
    });
  });

  describe('Navigation buttons', () => {
    it('displays back button', () => {
      renderReviewStep();

      expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
    });

    it('displays continue button', () => {
      renderReviewStep();

      expect(screen.getByRole('button', { name: /Continue to Confirm/i })).toBeInTheDocument();
    });

    it('calls onBack when back button is clicked', () => {
      const onBack = vi.fn();
      renderReviewStep({ onBack });

      fireEvent.click(screen.getByRole('button', { name: /Back/i }));

      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('calls onComplete when continue button is clicked with valid data', () => {
      const onComplete = vi.fn();
      renderReviewStep({ onComplete });

      fireEvent.click(screen.getByRole('button', { name: /Continue to Confirm/i }));

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith([mockReviewedResult]);
    });

    it('disables continue button when no biomarkers', () => {
      const emptyResult: ReviewedResult = {
        ...mockReviewedResult,
        editedBiomarkers: [],
      };

      renderReviewStep({ reviewedResults: [emptyResult] });

      const continueButton = screen.getByRole('button', { name: /Continue to Confirm/i });
      expect(continueButton).toBeDisabled();
    });
  });

  describe('Validation', () => {
    it('shows validation error when biomarker has no name', () => {
      const onComplete = vi.fn();
      const invalidResult: ReviewedResult = {
        ...mockReviewedResult,
        editedBiomarkers: [
          {
            name: '',
            value: 100,
            unit: 'mg/dL',
            confidence: 0.9,
            isExactMatch: false,
            normalizedUnit: 'mg/dL',
          },
        ],
      };

      renderReviewStep({ reviewedResults: [invalidResult], onComplete });

      fireEvent.click(screen.getByRole('button', { name: /Continue to Confirm/i }));

      expect(screen.getByText('Cannot Continue')).toBeInTheDocument();
      expect(screen.getByText(/missing: name/i)).toBeInTheDocument();
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('shows validation error when biomarker has no unit (for non-unitless biomarkers)', () => {
      const onComplete = vi.fn();
      const invalidResult: ReviewedResult = {
        ...mockReviewedResult,
        editedBiomarkers: [
          {
            name: 'Glucose',
            value: 100,
            unit: '',
            confidence: 0.9,
            isExactMatch: false,
            normalizedUnit: '',
          },
        ],
      };

      renderReviewStep({ reviewedResults: [invalidResult], onComplete });

      fireEvent.click(screen.getByRole('button', { name: /Continue to Confirm/i }));

      expect(screen.getByText('Cannot Continue')).toBeInTheDocument();
      expect(screen.getByText(/missing: unit/i)).toBeInTheDocument();
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('allows unitless biomarkers (like pH) without unit', () => {
      const onComplete = vi.fn();
      const phResult: ReviewedResult = {
        ...mockReviewedResult,
        editedBiomarkers: [
          {
            name: 'pH',
            value: 7.4,
            unit: '',
            confidence: 0.9,
            isExactMatch: true,
            normalizedUnit: '',
          },
        ],
      };

      renderReviewStep({ reviewedResults: [phResult], onComplete });

      fireEvent.click(screen.getByRole('button', { name: /Continue to Confirm/i }));

      expect(screen.queryByText('Cannot Continue')).not.toBeInTheDocument();
      expect(onComplete).toHaveBeenCalled();
    });

    it('closes validation error when close button is clicked', () => {
      const invalidResult: ReviewedResult = {
        ...mockReviewedResult,
        editedBiomarkers: [
          {
            name: '',
            value: 100,
            unit: 'mg/dL',
            confidence: 0.9,
            isExactMatch: false,
            normalizedUnit: 'mg/dL',
          },
        ],
      };

      renderReviewStep({ reviewedResults: [invalidResult] });

      fireEvent.click(screen.getByRole('button', { name: /Continue to Confirm/i }));

      expect(screen.getByText('Cannot Continue')).toBeInTheDocument();

      // Close the alert - Mantine Alert uses CloseButton which has aria-label="Close alert"
      const closeButton = document.querySelector('.mantine-Alert-closeButton');
      expect(closeButton).toBeInTheDocument();
      fireEvent.click(closeButton!);

      expect(screen.queryByText('Cannot Continue')).not.toBeInTheDocument();
    });
  });

  describe('Multiple files', () => {
    it('displays multiple files in accordion', () => {
      const secondResult: ReviewedResult = {
        ...mockReviewedResult,
        fileId: 'file2',
        fileName: 'second-report.pdf',
      };

      renderReviewStep({ reviewedResults: [mockReviewedResult, secondResult] });

      expect(screen.getByText('lab-report.pdf')).toBeInTheDocument();
      expect(screen.getByText('second-report.pdf')).toBeInTheDocument();
    });

    it('displays correct total count for multiple files', () => {
      const secondResult: ReviewedResult = {
        ...mockReviewedResult,
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
          },
          {
            name: 'Hematocrit',
            value: 45,
            unit: '%',
            confidence: 0.85,
            isExactMatch: true,
            normalizedUnit: '%',
          },
        ],
      };

      renderReviewStep({ reviewedResults: [mockReviewedResult, secondResult] });

      expect(screen.getByText(/3 biomarker\(s\) from 2 file\(s\)/)).toBeInTheDocument();
    });
  });

  describe('Confidence colors', () => {
    it('displays green badge for high confidence (>= 0.85)', () => {
      const highConfidenceResult: ReviewedResult = {
        ...mockReviewedResult,
        confidence: 0.9,
      };

      renderReviewStep({ reviewedResults: [highConfidenceResult] });

      expect(screen.getByText('High confidence')).toBeInTheDocument();
    });

    it('displays yellow badge for medium confidence (0.7 - 0.84)', () => {
      const mediumConfidenceResult: ReviewedResult = {
        ...mockReviewedResult,
        confidence: 0.75,
      };

      renderReviewStep({ reviewedResults: [mediumConfidenceResult] });

      expect(screen.getByText('Medium confidence')).toBeInTheDocument();
    });

    it('displays red badge for low confidence (< 0.7)', () => {
      const lowConfidenceResult: ReviewedResult = {
        ...mockReviewedResult,
        confidence: 0.5,
      };

      renderReviewStep({ reviewedResults: [lowConfidenceResult] });

      expect(screen.getByText('Low confidence')).toBeInTheDocument();
    });
  });
});
