import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState, type ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { CatalogContext } from '@contexts/useCatalog';
import { fixtureCatalog } from '@/test/loincFixture';
import { PreferencesContext, type PreferencesState } from '@hooks/usePreferences';
import { ReviewStep } from './ReviewStep';
import type { ReviewedResult } from './ReviewStep';
import type { AnalysisResult } from './AnalysisStep';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

const catalog = fixtureCatalog();

/** The providers review needs: Mantine and the LOINC catalog */
function Providers({ children }: { children: ReactNode }) {
  return (
    <MantineProvider env="test">
      <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>
    </MantineProvider>
  );
}

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
      loincCode: '2345-7',
      identifiedBy: 'local',
      identificationFlags: [],
      candidates: [],
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
    <Providers>
      <ReviewStep {...defaultProps} {...props} />
    </Providers>
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
            candidates: [],
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
            candidates: [],
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

      // The printed name, before the test it is saved as
      expect(screen.getAllByText('Glucose')[0]).toBeInTheDocument();
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

      expect(screen.getByText('70 - 100 mg/dL')).toBeInTheDocument();
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
            candidates: [],
          },
        ],
      };

      renderReviewStep({ reviewedResults: [noRangeResult] });

      // Three dashes: one for specimen type (no LOINC test), one for reference range, one for method
      expect(screen.getAllByText('—').length).toBe(3);
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

    it('keeps a negative number typed into a cleared value', async () => {
      const onReviewChange = vi.fn();
      renderReviewStep({ onReviewChange });

      fireEvent.click(screen.getByLabelText('Edit biomarker'));
      const input = screen.getByPlaceholderText('Value');
      await userEvent.clear(input);
      await userEvent.type(input, '-0.5');

      expect(input).toHaveValue('-0.5');
      const [[edited]] = onReviewChange.mock.calls.slice(-1);
      expect(edited[0].editedBiomarkers[0].value).toBe(-0.5);
    });

    it('takes an interval with a cleared end as a value still to fill in', async () => {
      const onReviewChange = vi.fn();
      const interval = {
        ...mockReviewedResult.editedBiomarkers[0],
        value: 7.5,
        isInterval: true,
        intervalLow: 5,
        intervalHigh: 10,
      };
      renderReviewStep({
        reviewedResults: [{ ...mockReviewedResult, editedBiomarkers: [interval] }],
        onReviewChange,
      });

      fireEvent.click(screen.getByLabelText('Edit biomarker'));
      // The interval's Low comes before the reference range's
      await userEvent.clear(screen.getAllByPlaceholderText('Low')[0]);

      const [[edited]] = onReviewChange.mock.calls.slice(-1);
      expect(edited[0].editedBiomarkers[0]).toMatchObject({ intervalLow: undefined, intervalHigh: 10 });
      expect(edited[0].editedBiomarkers[0].value).toBeNaN();
    });

    describe('a qualitative result', () => {
      const bacteria = (value: number) => ({
        ...mockReviewedResult.editedBiomarkers[0],
        name: 'Batteri',
        value,
        unit: '',
        qualitative: { text: 'Assenti', kind: 'boolean' as const, value: 0 },
      });
      const renderBacteria = (value: number) =>
        renderReviewStep({ reviewedResults: [{ ...mockReviewedResult, editedBiomarkers: [bacteria(value)] }] });

      it('shows the result as printed beside its number', () => {
        renderBacteria(0);
        expect(screen.getByText('Assenti (0)')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Edit biomarker'));
        expect(screen.getByPlaceholderText('Value')).toHaveValue('0');
        expect(screen.getByText('Assenti')).toBeInTheDocument();
      });

      it('no longer shows the printed result once its number is changed', () => {
        renderBacteria(2);
        expect(screen.getByText('2')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Edit biomarker'));
        expect(screen.queryByText('Assenti')).toBeNull();
      });
    });

    it('takes a cleared number as missing, not as 0', async () => {
      const onReviewChange = vi.fn();
      renderReviewStep({ onReviewChange });

      fireEvent.click(screen.getByLabelText('Edit biomarker'));
      await userEvent.clear(screen.getByPlaceholderText('Value'));

      const [[edited]] = onReviewChange.mock.calls.slice(-1);
      expect(edited[0].editedBiomarkers[0].value).toBeNaN();
    });

    it('shows a value with no number as blank, and asks for it on Continue', () => {
      const onComplete = vi.fn();
      const blank = { ...mockReviewedResult.editedBiomarkers[0], value: NaN };
      renderReviewStep({
        reviewedResults: [{ ...mockReviewedResult, editedBiomarkers: [blank] }],
        onComplete,
      });

      expect(screen.queryByText('NaN')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Continue to Confirm/i }));
      expect(screen.getByText(/Glucose in "lab-report.pdf" is missing: value/)).toBeInTheDocument();
      expect(onComplete).not.toHaveBeenCalled();
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

    function ThreeValues() {
      const values = [1, 2, 3].map((value) => ({ ...mockReviewedResult.editedBiomarkers[0], value }));
      const [reviewed, setReviewed] = useState<ReviewedResult[]>([
        { ...mockReviewedResult, editedBiomarkers: values },
      ]);
      return <ReviewStep {...defaultProps} reviewedResults={reviewed} onReviewChange={setReviewed} />;
    }

    it.each([
      ['a row above it', 0, '3'],
      ['the row itself', 2, null],
    ])('keeps the edited row on its value when %s is removed', (_, removed, shown) => {
      render(
        <Providers>
          <ThreeValues />
        </Providers>
      );
      fireEvent.click(screen.getAllByLabelText('Edit biomarker')[2]);
      expect(screen.getByPlaceholderText('Value')).toHaveValue('3');

      fireEvent.click(screen.getAllByLabelText('Remove biomarker')[removed]);

      if (shown === null) expect(screen.queryByPlaceholderText('Value')).not.toBeInTheDocument();
      else expect(screen.getByPlaceholderText('Value')).toHaveValue(shown);
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
      // No number until one is typed: 0 would be a reading of its own
      expect(newResults[0].editedBiomarkers[1].value).toBeNaN();
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
      expect(onComplete).toHaveBeenCalled();
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
            candidates: [],
          },
        ],
      };

      renderReviewStep({ reviewedResults: [invalidResult], onComplete });

      fireEvent.click(screen.getByRole('button', { name: /Continue to Confirm/i }));

      expect(screen.getByText('Cannot Continue')).toBeInTheDocument();
      expect(screen.getByText(/missing: name/i)).toBeInTheDocument();
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('folds the list of problems again each time Continue finds some', () => {
      const unnamed = Array.from({ length: 7 }, (_, index) => ({
        name: '',
        value: index,
        unit: 'mg/dL',
        confidence: 0.9,
        candidates: [],
        savedAsUnknown: true,
      }));
      renderReviewStep({ reviewedResults: [{ ...mockReviewedResult, editedBiomarkers: unnamed }] });
      const continueButton = screen.getByRole('button', { name: /Continue to Confirm/i });

      fireEvent.click(continueButton);
      fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));
      expect(screen.queryByRole('button', { name: /more$/ })).not.toBeInTheDocument();

      fireEvent.click(continueButton);
      expect(screen.getByRole('button', { name: 'Show 2 more' })).toBeInTheDocument();
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
            candidates: [],
          },
        ],
      };

      renderReviewStep({ reviewedResults: [invalidResult], onComplete });

      fireEvent.click(screen.getByRole('button', { name: /Continue to Confirm/i }));

      expect(screen.getByText('Cannot Continue')).toBeInTheDocument();
      expect(screen.getByText(/missing: unit/i)).toBeInTheDocument();
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('asks for a test, or "Not a LOINC test", for a value several tests fit', () => {
      const onComplete = vi.fn();
      const reviewed: ReviewedResult = {
        ...mockReviewedResult,
        editedBiomarkers: [
          {
            name: 'Glucosio',
            value: 95,
            unit: 'mg/dL',
            confidence: 0.9,
            identificationFlags: ['ambiguous'],
            candidates: [
              { code: '2345-7', name: 'Glucose [Mass/volume] in Serum or Plasma', score: 1 },
              { code: '2339-0', name: 'Glucose [Mass/volume] in Blood', score: 1 },
            ],
          },
        ],
      };

      renderReviewStep({ reviewedResults: [reviewed], onComplete });
      fireEvent.click(screen.getByRole('button', { name: /Continue to Confirm/i }));

      expect(screen.getByText('Cannot Continue')).toBeInTheDocument();
      expect(
        screen.getByText('Glucosio in "lab-report.pdf" needs a test: choose one or "Not a LOINC test"')
      ).toBeInTheDocument();
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('saves a value the report gives no unit under its own name', () => {
      const onComplete = vi.fn();
      const reviewed: ReviewedResult = {
        ...mockReviewedResult,
        editedBiomarkers: [
          {
            name: 'Proteine (urine)',
            value: 15,
            unit: '',
            confidence: 0.9,
            candidates: [],
            identificationFlags: ['no-unit'],
            savedAsUnknown: true,
            analyzed: {
              name: 'Proteine (urine)',
              unit: '',
              identification: {
                candidates: [],
                identificationFlags: ['no-unit'],
                savedAsUnknown: true,
              },
            },
          },
        ],
      };

      renderReviewStep({ reviewedResults: [reviewed], onComplete });
      fireEvent.click(screen.getByRole('button', { name: /Continue to Confirm/i }));

      expect(onComplete).toHaveBeenCalled();
    });

    it('saves a value the user put as not a LOINC test, whatever its unit', () => {
      const onComplete = vi.fn();
      const reviewed: ReviewedResult = {
        ...mockReviewedResult,
        editedBiomarkers: [
          {
            name: 'Creatinina',
            value: 1.55,
            unit: 'g/24h',
            confidence: 0.9,
            candidates: [],
            identificationFlags: ['not-identified'],
            savedAsUnknown: true,
          },
        ],
      };

      renderReviewStep({ reviewedResults: [reviewed], onComplete });
      fireEvent.click(screen.getByRole('button', { name: /Continue to Confirm/i }));

      expect(screen.queryByText('Cannot Continue')).not.toBeInTheDocument();
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
            candidates: [],
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

  describe('A value left out for another value of its line', () => {
    const shareIdentification = {
      loincCode: '770-8',
      candidates: [],
      identifiedBy: 'ai' as const,
      identificationFlags: [],
    };
    const share: MatchedBiomarker = {
      name: 'Eritroblasti',
      value: 0.2,
      unit: '%',
      confidence: 0.95,
      ...shareIdentification,
      analyzed: { name: 'Eritroblasti', unit: '%', identification: shareIdentification },
    };
    // The same printed name, in a unit UCUM cannot read: no test for it
    const twinIdentification = {
      candidates: [],
      identificationFlags: ['not-identified' as const],
    };
    const twin: MatchedBiomarker = {
      ...share,
      value: 0.5,
      unit: '/100 HPF',
      loincCode: undefined,
      identifiedBy: undefined,
      ...twinIdentification,
      analyzed: { name: 'Eritroblasti', unit: '/100 HPF', identification: twinIdentification },
    };

    it('is labelled "Not saved", says how to keep it, and does not stop the import', () => {
      const onComplete = vi.fn();
      const reviewed: ReviewedResult = { ...mockReviewedResult, editedBiomarkers: [twin, share] };

      renderReviewStep({ reviewedResults: [reviewed], onComplete });

      expect(screen.getAllByText('Not saved:')).toHaveLength(1);
      expect(
        screen.getByText(
          /its unit cannot be read, and another Eritroblasti value is saved\. To keep this one, choose its test or "Not a LOINC test"\./
        )
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Continue to Confirm/i }));
      expect(screen.queryByText('Cannot Continue')).not.toBeInTheDocument();
      expect(onComplete).toHaveBeenCalled();
    });

    it('asks no fix of it, even with no number, as it is not saved', () => {
      const onComplete = vi.fn();
      const reviewed: ReviewedResult = {
        ...mockReviewedResult,
        editedBiomarkers: [{ ...twin, value: NaN }, share],
      };

      renderReviewStep({ reviewedResults: [reviewed], onComplete });

      fireEvent.click(screen.getByRole('button', { name: /Continue to Confirm/i }));
      expect(screen.queryByText('Cannot Continue')).not.toBeInTheDocument();
      expect(onComplete).toHaveBeenCalled();
    });

    it('still stops the import when it is the only value of its line', () => {
      const onComplete = vi.fn();
      const reviewed: ReviewedResult = { ...mockReviewedResult, editedBiomarkers: [twin] };

      renderReviewStep({ reviewedResults: [reviewed], onComplete });

      expect(screen.queryByText('Not saved:')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Continue to Confirm/i }));
      expect(screen.getByText(/Eritroblasti in "lab-report.pdf" needs a test/)).toBeInTheDocument();
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  describe('A value given the test of another value of its file', () => {
    it('is not saved when it is the same measurement in another unit, and says which is', () => {
      const onComplete = vi.fn();
      const molar: MatchedBiomarker = {
        name: 'Glucose',
        value: 5.55,
        unit: 'mmol/L',
        confidence: 0.95,
        candidates: [],
        loincCode: '14749-6',
        identifiedBy: 'user',
        identificationFlags: [],
      };
      const reviewed: ReviewedResult = {
        ...mockReviewedResult,
        editedBiomarkers: [...mockReviewedResult.editedBiomarkers, molar],
      };

      renderReviewStep({ reviewedResults: [reviewed], onComplete });

      expect(screen.getByText(/the same measurement as 100 mg\/dL, which is saved\./)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Continue to Confirm/i }));
      expect(onComplete).toHaveBeenCalled();
    });
  });

  describe('A censored value given the test of another value of its file', () => {
    it('says which value is saved, with its comparator', () => {
      const [first] = mockReviewedResult.editedBiomarkers;
      const molar: MatchedBiomarker = {
        name: 'Glucose',
        value: 5.55,
        unit: 'mmol/L',
        censored: '<',
        confidence: 0.95,
        candidates: [],
        loincCode: '14749-6',
        identifiedBy: 'user',
        identificationFlags: [],
      };
      renderReviewStep({
        reviewedResults: [{ ...mockReviewedResult, editedBiomarkers: [{ ...first, censored: '<' }, molar] }],
      });

      expect(screen.getByText(/the same measurement as < 100 mg\/dL, which is saved\./)).toBeInTheDocument();
    });
  });

  describe('Censored values, the lab\'s mark and decimals', () => {
    const withFirst = (options: Partial<MatchedBiomarker>) => [
      { ...mockReviewedResult, editedBiomarkers: [{ ...mockReviewedResult.editedBiomarkers[0], ...options }] },
    ];

    it('shows a censored value with its comparator, and the lab\'s mark in words', () => {
      renderReviewStep({ reviewedResults: withFirst({ value: 10, censored: '<', labFlag: 'low' }) });

      expect(screen.getByText('< 10')).toBeInTheDocument();
      expect(screen.getByLabelText('flagged low by the lab')).toHaveTextContent('L');
    });

    it('lets the comparator be chosen while editing', async () => {
      const onReviewChange = vi.fn();
      renderReviewStep({ reviewedResults: withFirst({ value: 10, censored: '<' }), onReviewChange });

      fireEvent.click(screen.getByLabelText('Edit biomarker'));
      const comparator = screen.getByRole('combobox', { name: 'Comparator' });
      expect(comparator).toHaveValue('<');
      await userEvent.selectOptions(comparator, '=');

      const [[edited]] = onReviewChange.mock.calls.slice(-1);
      expect(edited[0].editedBiomarkers[0].censored).toBeUndefined();
    });

    it.each(['1.015', '0.005', '0.875'])('keeps %s as typed, every decimal', async (typed) => {
      const onReviewChange = vi.fn();
      renderReviewStep({ onReviewChange });

      fireEvent.click(screen.getByLabelText('Edit biomarker'));
      const input = screen.getByPlaceholderText('Value');
      await userEvent.clear(input);
      await userEvent.type(input, typed);

      expect(input).toHaveValue(typed);
      const [[edited]] = onReviewChange.mock.calls.slice(-1);
      expect(edited[0].editedBiomarkers[0].value).toBe(Number(typed));
    });

    it('opens a value of three decimals uncut', () => {
      renderReviewStep({ reviewedResults: withFirst({ value: 1.015 }) });

      fireEvent.click(screen.getByLabelText('Edit biomarker'));
      expect(screen.getByPlaceholderText('Value')).toHaveValue('1.015');
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
            candidates: [],
          },
          {
            name: 'Hematocrit',
            value: 45,
            unit: '%',
            confidence: 0.85,
            candidates: [],
          },
        ],
      };

      renderReviewStep({ reviewedResults: [mockReviewedResult, secondResult] });

      expect(screen.getByText(/3 biomarker\(s\) from 2 file\(s\)/)).toBeInTheDocument();
    });
  });

  describe('Specimen type display', () => {
    it('renders specimen column header', () => {
      renderReviewStep();

      expect(screen.getByRole('columnheader', { name: /specimen/i })).toBeInTheDocument();
    });

    it("displays the sample of the value's LOINC test", () => {
      renderReviewStep();

      expect(screen.getByText('Serum/Plasma')).toBeInTheDocument();
    });

    it('shows dash for unmatched biomarkers', () => {
      const unmatchedResult: ReviewedResult = {
        ...mockReviewedResult,
        editedBiomarkers: [
          {
            name: 'Unknown Marker',
            value: 50,
            unit: 'U/L',
            confidence: 0.7,
            candidates: [],
            // No LOINC test
          },
        ],
      };

      renderReviewStep({ reviewedResults: [unmatchedResult] });

      // Find specimen cells showing dash
      const cells = screen.getAllByText('—');
      expect(cells.length).toBeGreaterThan(0);
    });
  });

  describe('LOINC tooltip display', () => {
    it('shows biomarker name with tooltip styling when LOINC code exists', () => {
      renderReviewStep();

      // The biomarker name should have help cursor style (indicating tooltip)
      const [glucoseText] = screen.getAllByText('Glucose');
      expect(glucoseText).toHaveStyle({ cursor: 'help' });
    });

    it('shows the LOINC tooltip on keyboard focus too', async () => {
      renderReviewStep();

      const [glucoseText] = screen.getAllByText('Glucose');
      expect(glucoseText).toHaveAttribute('tabindex', '0');
      fireEvent.focus(glucoseText);

      expect(await screen.findByRole('tooltip')).toHaveTextContent('LOINC 2345-7');
    });

    it("puts the test's description on a line of its own in the tooltip", async () => {
      renderReviewStep();

      fireEvent.focus(screen.getAllByText('Glucose')[0]);

      expect(await screen.findByRole('tooltip')).toHaveStyle({ whiteSpace: 'pre-line' });
    });

    it('does not show tooltip styling for biomarkers without LOINC code', () => {
      const noLoincResult: ReviewedResult = {
        ...mockReviewedResult,
        editedBiomarkers: [
          {
            name: 'Test Marker',
            value: 50,
            unit: 'U/L',
            confidence: 0.9,
            candidates: [],
            savedAsUnknown: true,
          },
        ],
      };

      renderReviewStep({ reviewedResults: [noLoincResult] });

      const testMarkerText = screen.getAllByText('Test Marker')[0];
      expect(testMarkerText).not.toHaveStyle({ cursor: 'help' });
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

  describe('Lab date and manual entry', () => {
    it('asks for a lab date before continuing when a file has none', () => {
      const onComplete = vi.fn();
      renderReviewStep({
        reviewedResults: [
          { ...mockReviewedResult, fileName: 'scan.pdf', labDate: undefined, editedLabDate: undefined },
        ],
        onComplete,
      });

      fireEvent.click(screen.getByRole('button', { name: /continue/i }));

      expect(screen.getByText('Enter the lab date for "scan.pdf"')).toBeInTheDocument();
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('labels a manual entry instead of showing a confidence', () => {
      renderReviewStep({
        reviewedResults: [{ ...mockReviewedResult, manualEntry: true }],
      });
      expect(screen.getByText('Entered manually')).toBeInTheDocument();
      expect(screen.queryByText(/ confidence$/)).not.toBeInTheDocument();
    });
  });

  describe("Editing a value's test", () => {
    it('reads the test again from a new name', async () => {
      const onReviewChange = vi.fn();
      renderReviewStep({ onReviewChange });
      await userEvent.click(screen.getAllByRole('button', { name: 'Edit biomarker' })[0]);

      fireEvent.change(screen.getByPlaceholderText('Biomarker name'), { target: { value: 'Zorblatina' } });

      const last = onReviewChange.mock.calls.at(-1)?.[0] as ReviewedResult[];
      expect(last[0].editedBiomarkers[0]).toMatchObject({
        name: 'Zorblatina',
        identificationFlags: ['not-identified'],
      });
      expect(last[0].editedBiomarkers[0].loincCode).toBeUndefined();
    });

    it('reads a new name with the tests the user taught', async () => {
      const onReviewChange = vi.fn();
      const preferences = { learnedTests: { 'zorblatina|mg/dL': '2339-0' } } as unknown as PreferencesState;
      render(
        <Providers>
          <PreferencesContext.Provider value={preferences}>
            <ReviewStep {...defaultProps} onReviewChange={onReviewChange} />
          </PreferencesContext.Provider>
        </Providers>
      );
      await userEvent.click(screen.getAllByRole('button', { name: 'Edit biomarker' })[0]);

      fireEvent.change(screen.getByPlaceholderText('Biomarker name'), { target: { value: 'Zorblatina' } });

      const last = onReviewChange.mock.calls.at(-1)?.[0] as ReviewedResult[];
      expect(last[0].editedBiomarkers[0]).toMatchObject({ loincCode: '2339-0', identifiedBy: 'learned' });
    });

    it('saves a value as "Not a LOINC test" chosen in the Saved as column', async () => {
      const onReviewChange = vi.fn();
      renderReviewStep({ onReviewChange });

      await userEvent.click(screen.getByRole('button', { name: 'Change test for Glucose' }));
      await userEvent.click(screen.getByRole('button', { name: 'Not a LOINC test' }));

      const last = onReviewChange.mock.calls.at(-1)?.[0] as ReviewedResult[];
      expect(last[0].editedBiomarkers[0]).toMatchObject({ savedAsUnknown: true, identifiedBy: 'user' });
    });
  });

  describe('Lab date picker', () => {
    function DatedReview({ labDate }: { labDate: string }) {
      const [reviewed, setReviewed] = useState<ReviewedResult[]>([
        { ...mockReviewedResult, labDate, editedLabDate: undefined },
      ]);
      return (
        <Providers>
          <ReviewStep
            results={[mockAnalysisResult]}
            reviewedResults={reviewed}
            onReviewChange={setReviewed}
            onComplete={vi.fn()}
            onBack={vi.fn()}
          />
        </Providers>
      );
    }

    it('picks the lab date from a calendar that opens on the detected month', async () => {
      render(<DatedReview labDate="2024-01-15" />);
      const labDate = screen.getByRole('textbox', { name: 'Lab Date' });
      expect(labDate).toHaveValue('2024-01-15');

      await userEvent.click(labDate);
      await userEvent.click(await screen.findByRole('button', { name: '20 January 2024' }));

      expect(labDate).toHaveValue('2024-01-20');
    });

    it('accepts a typed lab date', async () => {
      render(<DatedReview labDate="2024-01-15" />);
      const labDate = screen.getByRole('textbox', { name: 'Lab Date' });

      await userEvent.clear(labDate);
      await userEvent.type(labDate, '2024-01-16');
      await userEvent.tab();

      expect(labDate).toHaveValue('2024-01-16');
    });

    it('leaves the field empty for a lab date it cannot read', () => {
      render(<DatedReview labDate="03/04/2024" />);
      expect(screen.getByRole('textbox', { name: 'Lab Date' })).toHaveValue('');
    });
  });

  it('keeps a cleared lab date empty and asks for one', async () => {
    const onComplete = vi.fn();
    function Cleared() {
      const [reviewed, setReviewed] = useState<ReviewedResult[]>([
        { ...mockReviewedResult, editedLabDate: undefined },
      ]);
      return (
        <Providers>
          <ReviewStep
            results={[mockAnalysisResult]}
            reviewedResults={reviewed}
            onReviewChange={setReviewed}
            onComplete={onComplete}
            onBack={vi.fn()}
          />
        </Providers>
      );
    }
    render(<Cleared />);
    const labDate = screen.getByRole('textbox', { name: 'Lab Date' });

    await userEvent.clear(labDate);
    await userEvent.tab();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(labDate).toHaveValue('');
    expect(screen.getByText('Enter the lab date for "lab-report.pdf"')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('names the lab date clear button', () => {
    renderReviewStep();
    expect(screen.getByRole('button', { name: 'Clear lab date' })).toBeInTheDocument();
  });

  it('does not save, or ask a date for, a manual entry left empty', () => {
    const onComplete = vi.fn();
    const empty: ReviewedResult = {
      ...mockReviewedResult,
      fileId: 'empty',
      fileName: 'empty.pdf',
      manualEntry: true,
      biomarkers: [],
      editedBiomarkers: [],
      labDate: undefined,
      editedLabDate: undefined,
    };
    renderReviewStep({ reviewedResults: [mockReviewedResult, empty], onComplete });

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.queryByText('Enter the lab date for "empty.pdf"')).not.toBeInTheDocument();
    // The empty file needs no date, so the import continues
    expect(onComplete).toHaveBeenCalled();
  });

  it('shows what the report said when its date could not be read', () => {
    renderReviewStep({
      reviewedResults: [{ ...mockReviewedResult, labDate: '03/04/2024', editedLabDate: undefined }],
    });
    expect(screen.getByText('The report says "03/04/2024"')).toBeInTheDocument();
  });
});
