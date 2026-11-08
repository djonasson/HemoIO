/**
 * Tests for BiomarkerDetail component
 */

import { beforeAll, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { BiomarkerDetail, type BiomarkerDetailProps } from './BiomarkerDetail';
import { loadCatalog, type Catalog } from '@data/loinc/catalog';
import { CatalogContext } from '@contexts/useCatalog';

// Names, ranges and the other codes come from the catalog, loaded as in the unlocked app
let catalog: Catalog;
// Reading the 13 MB catalog and building its search index take seconds on a busy machine
beforeAll(async () => {
  catalog = await loadCatalog();
  catalog.scoredSearch('glucose');
}, 60_000);

const WBC = '6690-2';
const GLUCOSE = '2345-7';
/** Glucose in blood: a test HemoIO has no description of */
const UNDESCRIBED = '2339-0';
/** Lymphocytes per 100 leukocytes: a test whose trend group holds no other code */
const SINGLE_CODE = '736-9';

/** Renders the detail of `code` with no results, no target and spy callbacks */
function renderDetailOf(
  code: string,
  overrides: Partial<BiomarkerDetailProps> = {}
): { props: BiomarkerDetailProps } {
  const props: BiomarkerDetailProps = {
    code,
    summary: null,
    onBack: vi.fn(),
    onViewTrend: vi.fn(),
    onEditTarget: vi.fn(),
    ...overrides,
  };
  render(
    <MantineProvider env="test">
      <CatalogContext.Provider value={catalog}>
        <BiomarkerDetail {...props} />
      </CatalogContext.Provider>
    </MantineProvider>
  );
  return { props };
}

describe('BiomarkerDetail', () => {
  describe('rendering', () => {
    it("names the test by HemoIO's short name", () => {
      renderDetailOf(WBC);
      expect(screen.getByRole('heading', { level: 3, name: 'White Blood Cell Count' })).toBeInTheDocument();
    });

    it('shows its LOINC class', () => {
      renderDetailOf(WBC);
      expect(screen.getByText('Hematology')).toBeInTheDocument();
    });

    it('shows its sample, from its LOINC test', () => {
      renderDetailOf(WBC);
      expect(screen.getByText('Sample: Whole Blood')).toBeInTheDocument();
    });

    it('shows the description, standard range and units', () => {
      renderDetailOf(WBC);
      expect(screen.getByText(/Measures the total number of white blood cells/)).toBeInTheDocument();
      expect(screen.getByText('4.5 - 11 10^9/L')).toBeInTheDocument();
      expect(screen.getByText('10^9/L')).toBeInTheDocument();
    });

    it('shows what high and low values may indicate', () => {
      renderDetailOf(WBC);
      expect(screen.getByText('High Values')).toBeInTheDocument();
      expect(screen.getByText('Low Values')).toBeInTheDocument();
    });

    it('should render educational disclaimer', () => {
      renderDetailOf(WBC);
      expect(screen.getByText(/for educational purposes only/)).toBeInTheDocument();
    });
  });

  describe('LOINC code display', () => {
    it("shows the code with LOINC's own name for it", () => {
      renderDetailOf(WBC);
      expect(screen.getByText('6690-2')).toBeInTheDocument();
      expect(screen.getByText(catalog.test(WBC)!.name)).toBeInTheDocument();
    });

    it('links the code to the LOINC website', () => {
      renderDetailOf(WBC);
      const link = screen.getByRole('link', { name: /6690-2/i });
      expect(link).toHaveAttribute('href', 'https://loinc.org/6690-2');
      expect(link).toHaveAttribute('target', '_blank');
    });
  });

  describe('a test HemoIO has no description of', () => {
    it("shows LOINC's names, says there is no description yet and shows no standard range", () => {
      const test = catalog.test(UNDESCRIBED)!;
      renderDetailOf(UNDESCRIBED);

      // LOINC's short name less its mass property: the test has a molar code too
      expect(screen.getByRole('heading', { level: 3, name: 'Glucose Bld' })).toBeInTheDocument();
      expect(screen.getByText(test.name)).toBeInTheDocument();
      expect(screen.getByText('No description yet')).toBeInTheDocument();
      expect(screen.queryByText('Reference Range')).not.toBeInTheDocument();
      expect(screen.queryByText('High Values')).not.toBeInTheDocument();
    });

    it('gives its personal target in a unit LOINC gives the test', () => {
      renderDetailOf(UNDESCRIBED, { personalTarget: { low: 70, high: 90 } });
      const target = screen.getByRole('region', { name: 'Personal target' });
      expect(within(target).getByText(`70 - 90 ${catalog.test(UNDESCRIBED)!.units[0]}`)).toBeInTheDocument();
    });
  });

  describe('sections', () => {
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
      expect(props.onViewTrend).toHaveBeenCalledWith(GLUCOSE);
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

    it('shows a qualitative result as printed', () => {
      renderDetail({
        summary: { ...summary, latest: { ...summary.latest, value: 'Assenti', unit: '' } },
      });
      expect(screen.getByText('Assenti')).toBeInTheDocument();
    });

    it('shows an interval as its ends', () => {
      renderDetail({
        summary: {
          ...summary,
          latest: { ...summary.latest, value: 7.5, numericValueType: 'interval', intervalLow: 5, intervalHigh: 10 },
        },
      });
      expect(screen.getByText(`5-10 ${summary.latest.unit}`)).toBeInTheDocument();
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

    it('lists the other LOINC codes of the test, each with its LOINC name', () => {
      renderDetail();
      const codes = screen.getByRole('region', { name: 'Other LOINC codes' });
      // Glucose in mmol/L trends with glucose in mg/dL
      expect(
        within(codes).getByText(`${catalog.test('14749-6')!.name} · 14749-6`)
      ).toBeInTheDocument();
      expect(within(codes).queryByText(new RegExp(`· ${GLUCOSE}$`))).not.toBeInTheDocument();
      // An unstyled list keeps its list role for screen readers
      expect(within(codes).getByRole('list')).toBeInTheDocument();
    });

    it('has no Other LOINC codes section for a test with no other codes', () => {
      expect(catalog.groupCodes(catalog.trendGroup(SINGLE_CODE))).toEqual([SINGLE_CODE]);
      renderDetailOf(SINGLE_CODE);
      expect(screen.queryByRole('region', { name: 'Other LOINC codes' })).not.toBeInTheDocument();
    });
  });
});
