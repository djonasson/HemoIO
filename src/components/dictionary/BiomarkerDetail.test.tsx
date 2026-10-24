/**
 * Tests for BiomarkerDetail component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { BiomarkerDetail, type BiomarkerDetailProps } from './BiomarkerDetail';
import { getBiomarkerByKey, type BiomarkerDefinition } from '@data/biomarkers';

/** Renders the detail of `biomarker` with no results, no target and spy callbacks */
function renderDetailOf(
  biomarker: BiomarkerDefinition,
  overrides: Partial<BiomarkerDetailProps> = {}
): { props: BiomarkerDetailProps } {
  const props: BiomarkerDetailProps = {
    biomarker,
    summary: null,
    onBack: vi.fn(),
    onViewTrend: vi.fn(),
    onEditTarget: vi.fn(),
    onSelectRelated: vi.fn(),
    ...overrides,
  };
  render(
    <MantineProvider env="test">
      <BiomarkerDetail {...props} />
    </MantineProvider>
  );
  return { props };
}

function createMockBiomarker(): BiomarkerDefinition {
  return {
    key: 'white-blood-cell-count',
    name: 'White Blood Cell Count',
    aliases: ['WBC', 'Leukocytes'],
    category: 'cbc',
    canonicalUnit: '10^9/L',
    alternativeUnits: ['K/uL', 'cells/µL'],
    defaultReferenceRange: { low: 4.5, high: 11.0, unit: '10^9/L' },
    description: 'Measures the total number of white blood cells, which fight infection.',
    highIndication: 'May indicate infection, inflammation, or immune disorders',
    lowIndication: 'May indicate bone marrow problems or autoimmune conditions',
    specimenType: 'whole-blood',
    loincCode: '6690-2',
    related: [],
  };
}

describe('BiomarkerDetail', () => {
  describe('rendering', () => {
    it('should render the biomarker name', () => {
      const biomarker = createMockBiomarker();
      renderDetailOf(biomarker);

      expect(screen.getByText('White Blood Cell Count')).toBeInTheDocument();
    });

    it('should render aliases', () => {
      const biomarker = createMockBiomarker();
      renderDetailOf(biomarker);

      expect(screen.getByText(/Also known as.*WBC.*Leukocytes/)).toBeInTheDocument();
    });

    it('should render category badge', () => {
      const biomarker = createMockBiomarker();
      renderDetailOf(biomarker);

      expect(screen.getByText('Complete Blood Count')).toBeInTheDocument();
    });

    it('should render description', () => {
      const biomarker = createMockBiomarker();
      renderDetailOf(biomarker);

      expect(
        screen.getByText(/Measures the total number of white blood cells/)
      ).toBeInTheDocument();
    });

    it('should render reference range', () => {
      const biomarker = createMockBiomarker();
      renderDetailOf(biomarker);

      expect(screen.getByText(/4\.5 - 11/)).toBeInTheDocument();
    });

    it('should render canonical unit', () => {
      const biomarker = createMockBiomarker();
      renderDetailOf(biomarker);

      expect(screen.getByText('10^9/L')).toBeInTheDocument();
    });

    it('should render alternative units', () => {
      const biomarker = createMockBiomarker();
      renderDetailOf(biomarker);

      expect(screen.getByText('K/uL')).toBeInTheDocument();
      expect(screen.getByText('cells/µL')).toBeInTheDocument();
    });

    it('should render high indication', () => {
      const biomarker = createMockBiomarker();
      renderDetailOf(biomarker);

      expect(screen.getByText('High Values')).toBeInTheDocument();
      expect(
        screen.getByText(/May indicate infection, inflammation/)
      ).toBeInTheDocument();
    });

    it('should render low indication', () => {
      const biomarker = createMockBiomarker();
      renderDetailOf(biomarker);

      expect(screen.getByText('Low Values')).toBeInTheDocument();
      expect(screen.getByText(/May indicate bone marrow problems/)).toBeInTheDocument();
    });

    it('should render educational disclaimer', () => {
      const biomarker = createMockBiomarker();
      renderDetailOf(biomarker);

      expect(
        screen.getByText(/for educational purposes only/)
      ).toBeInTheDocument();
    });
  });

  describe('optional fields', () => {
    it('should not render reference range when not provided', () => {
      const biomarker: BiomarkerDefinition = {
        ...createMockBiomarker(),
        defaultReferenceRange: undefined,
      };
      renderDetailOf(biomarker);

      expect(screen.queryByText('Reference Range')).not.toBeInTheDocument();
    });

    it('should not render high indication when not provided', () => {
      const biomarker: BiomarkerDefinition = {
        ...createMockBiomarker(),
        highIndication: undefined,
      };
      renderDetailOf(biomarker);

      expect(screen.queryByText('High Values')).not.toBeInTheDocument();
    });

    it('should not render low indication when not provided', () => {
      const biomarker: BiomarkerDefinition = {
        ...createMockBiomarker(),
        lowIndication: undefined,
      };
      renderDetailOf(biomarker);

      expect(screen.queryByText('Low Values')).not.toBeInTheDocument();
    });

    it('should not render aliases section when empty', () => {
      const biomarker: BiomarkerDefinition = {
        ...createMockBiomarker(),
        aliases: [],
      };
      renderDetailOf(biomarker);

      expect(screen.queryByText(/Also known as/)).not.toBeInTheDocument();
    });
  });

  describe('specimen type display', () => {
    it('should display specimen type when available', () => {
      const biomarker = createMockBiomarker();
      renderDetailOf(biomarker);

      expect(screen.getByText(/Specimen: Whole Blood/)).toBeInTheDocument();
    });

    it('should not display specimen type when not available', () => {
      const biomarker: BiomarkerDefinition = {
        ...createMockBiomarker(),
        specimenType: undefined,
      };
      renderDetailOf(biomarker);

      expect(screen.queryByText(/Specimen:/)).not.toBeInTheDocument();
    });
  });

  describe('LOINC code display', () => {
    it('should display LOINC code when available', () => {
      const biomarker = createMockBiomarker();
      renderDetailOf(biomarker);

      expect(screen.getByText('6690-2')).toBeInTheDocument();
    });

    it('should link LOINC code to correct URL', () => {
      const biomarker = createMockBiomarker();
      renderDetailOf(biomarker);

      const link = screen.getByRole('link', { name: /6690-2/i });
      expect(link).toHaveAttribute('href', 'https://loinc.org/6690-2');
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('should not display LOINC code when not available', () => {
      const biomarker: BiomarkerDefinition = {
        ...createMockBiomarker(),
        loincCode: undefined,
      };
      renderDetailOf(biomarker);

      expect(screen.queryByText('LOINC:')).not.toBeInTheDocument();
    });

    it('should handle missing LOINC and specimen gracefully', () => {
      const biomarker: BiomarkerDefinition = {
        ...createMockBiomarker(),
        loincCode: undefined,
        specimenType: undefined,
      };
      renderDetailOf(biomarker);

      // Should still render the component without errors
      expect(screen.getByText('White Blood Cell Count')).toBeInTheDocument();
    });
  });

  describe('sections', () => {
    // The real Glucose entry, so its related biomarkers resolve
    const GLUCOSE = getBiomarkerByKey('glucose')!;
    const renderDetail = (overrides: Partial<BiomarkerDetailProps> = {}) =>
      renderDetailOf(GLUCOSE, overrides);
    const summary = {
      count: 2,
      latest: {
        value: 120,
        unit: 'mg/dL',
        date: new Date('2024-02-20T12:00:00Z'),
        status: 'high' as const,
        labName: 'Lab',
      },
    };

    it('goes back to the list', async () => {
      const { props } = renderDetail();
      await userEvent.click(screen.getByRole('button', { name: 'Back to biomarker list' }));
      expect(props.onBack).toHaveBeenCalled();
    });

    it('moves focus to the biomarker name when opened', () => {
      renderDetail();
      expect(screen.getByRole('heading', { level: 3, name: 'Glucose' })).toHaveFocus();
    });

    it('summarises your results with a link to the trend', async () => {
      const { props } = renderDetail({ summary });
      const yours = screen.getByRole('region', { name: 'Your results' });
      expect(within(yours).getByText('120 mg/dL')).toBeInTheDocument();
      expect(within(yours).getByText('Feb 20, 2024')).toBeInTheDocument();
      expect(within(yours).getByText('High')).toBeInTheDocument();
      expect(within(yours).getByText('2 results')).toBeInTheDocument();

      await userEvent.click(within(yours).getByRole('button', { name: 'View trend' }));
      expect(props.onViewTrend).toHaveBeenCalledWith('glucose');
    });

    it('says one result in the singular', () => {
      renderDetail({ summary: { ...summary, count: 1 } });
      expect(screen.getByText('1 result')).toBeInTheDocument();
    });

    it('shows a value that is not a number in words', () => {
      renderDetail({
        summary: { ...summary, latest: { ...summary.latest, value: true, unit: '' } },
      });
      expect(screen.getByText('Positive')).toBeInTheDocument();
    });

    it('says when there are no recorded values', () => {
      renderDetail({ summary: null });
      const yours = screen.getByRole('region', { name: 'Your results' });
      expect(
        within(yours).getByText('You have no recorded values for Glucose')
      ).toBeInTheDocument();
      expect(within(yours).queryByRole('button', { name: 'View trend' })).not.toBeInTheDocument();
    });

    it('shows a personal target, highlighted, next to the standard range', () => {
      renderDetail({ personalTarget: { low: 70, high: 90 } });
      const target = screen.getByRole('region', { name: 'Personal target' });
      expect(within(target).getByText('Your target')).toBeInTheDocument();
      expect(within(target).getByText('70 - 90 mg/dL')).toBeInTheDocument();
      expect(screen.getByText('70 - 100 mg/dL')).toBeInTheDocument();
    });

    it('says the standard range is used without a target, and offers Edit', async () => {
      const { props } = renderDetail();
      const target = screen.getByRole('region', { name: 'Personal target' });
      expect(within(target).getByText('Using standard range')).toBeInTheDocument();
      await userEvent.click(within(target).getByRole('button', { name: 'Edit personal target' }));
      expect(props.onEditTarget).toHaveBeenCalled();
    });

    it('links related biomarkers to their details', async () => {
      const { props } = renderDetail();
      const related = screen.getByRole('region', { name: 'Related biomarkers' });
      await userEvent.click(
        within(related).getByRole('button', { name: 'Hemoglobin A1c (HbA1c)' })
      );
      expect(props.onSelectRelated).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'hemoglobin-a1c' })
      );
    });

    it('has no related section for a biomarker outside the groups', () => {
      renderDetailOf(createMockBiomarker());
      expect(screen.queryByRole('region', { name: 'Related biomarkers' })).not.toBeInTheDocument();
    });
  });
});
