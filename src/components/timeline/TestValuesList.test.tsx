/**
 * Tests for TestValuesList component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { TestValuesList } from './TestValuesList';
import type { EnrichedTestValue } from '@hooks/useLabResults';

let mockUnitPreferences: Record<string, string> = {};
vi.mock('@hooks/usePreferences', () => ({
  usePreferences: () => ({
    unitPreferences: mockUnitPreferences,
    personalTargets: {},
    isLoaded: true,
    setPreferredUnit: vi.fn(),
    setPersonalTarget: vi.fn(),
    reload: vi.fn(),
  }),
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider env="test">{ui}</MantineProvider>);
}

function createTestValue(
  id: number,
  options: Partial<EnrichedTestValue>
): EnrichedTestValue {
  return {
    id,
    labResultId: 1,
    // Not a dictionary key, so the name comes from rawText
    biomarkerKey: 'unknown:test',
    value: 14.5,
    unit: 'g/dL',
    status: 'normal',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...options,
  };
}

describe('TestValuesList', () => {
  beforeEach(() => {
    mockUnitPreferences = {};
  });

  describe('Preferred unit', () => {
    const glucose = (options: Partial<EnrichedTestValue>) =>
      createTestValue(1, { biomarkerKey: 'glucose', rawText: 'Glucose', ...options });

    it('shows a value in the preferred unit, with its range', () => {
      mockUnitPreferences = { glucose: 'mmol/L' };
      renderWithProviders(
        <TestValuesList
          testValues={[
            glucose({ value: 100, unit: 'mg/dL', referenceRangeLow: 70, referenceRangeHigh: 100 }),
          ]}
        />
      );

      const row = screen.getByRole('row', { name: /^Glucose: 5\.55 mmol\/L,/ });
      expect(within(row).getByText('mmol/L')).toBeInTheDocument();
      expect(within(row).getByText(/ - 5\.55 mmol\/L$/)).toBeInTheDocument();
    });

    it('shows a value as recorded without a preference', () => {
      renderWithProviders(<TestValuesList testValues={[glucose({ value: 100, unit: 'mg/dL' })]} />);
      expect(screen.getByRole('row', { name: /^Glucose: 100 mg\/dL,/ })).toBeInTheDocument();
    });
  });

  it('should render empty message when no test values', () => {
    renderWithProviders(<TestValuesList testValues={[]} />);

    expect(screen.getByText(/no test values recorded/i)).toBeInTheDocument();
  });

  it('should name a value by its stored biomarker ID, not its extracted text', () => {
    // "Hemo-globin" was matched to Hemoglobin when the result was imported
    const testValues = [createTestValue(1, { biomarkerKey: 'hemoglobin', rawText: 'Hemo-globin' })];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    expect(screen.getByText('Hemoglobin')).toBeInTheDocument();
    expect(screen.queryByText('Hemo-globin')).not.toBeInTheDocument();
  });

  it('should render table with headers', () => {
    const testValues = [createTestValue(1, { rawText: 'Hemoglobin' })];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /biomarker/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /specimen/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /value/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /unit/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /reference range/i })).toBeInTheDocument();
  });

  it('should display biomarker name from raw text', () => {
    const testValues = [
      createTestValue(1, { rawText: 'Hemoglobin', value: 14.5 }),
    ];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    expect(screen.getByText('Hemoglobin')).toBeInTheDocument();
  });

  it('should display value and unit', () => {
    const testValues = [
      createTestValue(1, { rawText: 'Hemoglobin', value: 14.5, unit: 'g/dL' }),
    ];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    expect(screen.getByText('14.50')).toBeInTheDocument();
    expect(screen.getByText('g/dL')).toBeInTheDocument();
  });

  it('should display reference range', () => {
    const testValues = [
      createTestValue(1, {
        rawText: 'Hemoglobin',
        referenceRangeLow: 12.0,
        referenceRangeHigh: 17.5,
        unit: 'g/dL',
      }),
    ];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    expect(screen.getByText('12 - 17.5 g/dL')).toBeInTheDocument();
  });

  it('should show dash when no reference range', () => {
    const testValues = [createTestValue(1, { rawText: 'Unknown' })];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    // Two dashes: one for specimen type (unknown biomarker), one for reference range
    expect(screen.getAllByText('—').length).toBe(2);
  });

  it('should display normal status indicator', () => {
    const testValues = [createTestValue(1, { rawText: 'Hemoglobin', status: 'normal' })];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    const row = screen.getByRole('row', { name: /hemoglobin/i });
    const indicator = within(row).getByLabelText('Within reference range');
    expect(indicator).toBeInTheDocument();
  });

  it('should display high status indicator', () => {
    const testValues = [
      createTestValue(1, { rawText: 'Glucose', value: 150, status: 'high' }),
    ];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    const row = screen.getByRole('row', { name: /glucose/i });
    const indicator = within(row).getByLabelText('Above reference range');
    expect(indicator).toBeInTheDocument();
  });

  it('should display low status indicator', () => {
    const testValues = [
      createTestValue(1, { rawText: 'Hemoglobin', value: 11.0, status: 'low' }),
    ];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    const row = screen.getByRole('row', { name: /hemoglobin/i });
    const indicator = within(row).getByLabelText('Below reference range');
    expect(indicator).toBeInTheDocument();
  });

  it('should display unknown status indicator when no reference range', () => {
    const testValues = [createTestValue(1, { rawText: 'Custom', status: 'unknown' })];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    const row = screen.getByRole('row', { name: /custom/i });
    const indicator = within(row).getByLabelText('No reference range available');
    expect(indicator).toBeInTheDocument();
  });

  it('should handle boolean values', () => {
    const testValues = [
      createTestValue(1, { rawText: 'Test', value: true, unit: '' }),
    ];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    expect(screen.getByText('Positive')).toBeInTheDocument();
  });

  it('should handle string values', () => {
    const testValues = [
      createTestValue(1, { rawText: 'Test', value: 'Negative', unit: '' }),
    ];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    expect(screen.getByText('Negative')).toBeInTheDocument();
  });

  it('should render multiple test values', () => {
    const testValues = [
      createTestValue(1, { rawText: 'Hemoglobin', value: 14.5 }),
      createTestValue(2, { rawText: 'Glucose', value: 95 }),
    ];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    expect(screen.getByText('Hemoglobin')).toBeInTheDocument();
    expect(screen.getByText('Glucose')).toBeInTheDocument();
  });

  it('should have accessible table', () => {
    const testValues = [createTestValue(1, { rawText: 'Hemoglobin' })];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    expect(screen.getByRole('table', { name: /test values/i })).toBeInTheDocument();
  });

  it('should have accessible row labels', () => {
    const testValues = [
      createTestValue(1, {
        rawText: 'Hemoglobin',
        value: 14.5,
        unit: 'g/dL',
        status: 'normal',
      }),
    ];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    const row = screen.getByRole('row', {
      name: /hemoglobin.*14\.50.*g\/dL.*within reference range/i,
    });
    expect(row).toBeInTheDocument();
  });

  it('should round decimal values to 2 places', () => {
    const testValues = [
      createTestValue(1, { rawText: 'Test', value: 14.567 }),
    ];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    expect(screen.getByText('14.57')).toBeInTheDocument();
  });

  it('should not add decimals to integer values', () => {
    const testValues = [
      createTestValue(1, { rawText: 'Test', value: 95 }),
    ];
    renderWithProviders(<TestValuesList testValues={testValues} />);

    expect(screen.getByText('95')).toBeInTheDocument();
  });

  describe('Specimen type display', () => {
    it('should display specimen type for known biomarkers', () => {
      const testValues = [createTestValue(1, { rawText: 'Hemoglobin' })];
      renderWithProviders(<TestValuesList testValues={testValues} />);

      expect(screen.getByText('Whole Blood')).toBeInTheDocument();
    });

    it('should display serum for glucose', () => {
      const testValues = [createTestValue(1, { rawText: 'Glucose' })];
      renderWithProviders(<TestValuesList testValues={testValues} />);

      expect(screen.getByText('Serum')).toBeInTheDocument();
    });

    it('should display dash for unknown biomarkers', () => {
      const testValues = [createTestValue(1, { rawText: 'Unknown' })];
      renderWithProviders(<TestValuesList testValues={testValues} />);

      // There should be dashes for both reference range and specimen type
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('LOINC tooltip display', () => {
    it('should show biomarker name with tooltip styling when LOINC code exists', () => {
      const testValues = [createTestValue(1, { rawText: 'Hemoglobin' })];
      renderWithProviders(<TestValuesList testValues={testValues} />);

      const hemoglobinText = screen.getByText('Hemoglobin');
      expect(hemoglobinText).toHaveStyle({ cursor: 'help' });
    });

    it('should not show tooltip styling for unknown biomarkers', () => {
      const testValues = [createTestValue(1, { rawText: 'Unknown' })];
      renderWithProviders(<TestValuesList testValues={testValues} />);

      const unknownText = screen.getByText('Unknown');
      expect(unknownText).not.toHaveStyle({ cursor: 'help' });
    });
  });
  describe('Opening a trend', () => {
    const glucose = (options: Partial<EnrichedTestValue> = {}) =>
      createTestValue(1, { biomarkerKey: 'glucose', rawText: 'Glucose', value: 125, unit: 'mg/dL', ...options });

    it("announces the test's description with its link", () => {
      renderWithProviders(<TestValuesList testValues={[glucose()]} onOpenTrend={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Glucose, open trend' })).toHaveAccessibleDescription(
        /Blood sugar level/
      );
    });

    it("opens the test's trend when its name is clicked", async () => {
      const onOpenTrend = vi.fn();
      renderWithProviders(<TestValuesList testValues={[glucose()]} onOpenTrend={onOpenTrend} />);

      await userEvent.click(screen.getByRole('button', { name: 'Glucose, open trend' }));

      expect(onOpenTrend).toHaveBeenCalledWith('glucose');
    });

    it('opens the trend with the keyboard', async () => {
      const onOpenTrend = vi.fn();
      renderWithProviders(<TestValuesList testValues={[glucose()]} onOpenTrend={onOpenTrend} />);

      await userEvent.tab();
      expect(screen.getByRole('button', { name: 'Glucose, open trend' })).toHaveFocus();
      await userEvent.keyboard('{Enter}');

      expect(onOpenTrend).toHaveBeenCalledWith('glucose');
    });

    it('keeps the description, on hover and on keyboard focus', async () => {
      renderWithProviders(<TestValuesList testValues={[glucose()]} onOpenTrend={vi.fn()} />);

      act(() => screen.getByRole('button', { name: 'Glucose, open trend' }).focus());

      expect(await screen.findByRole('tooltip')).toHaveTextContent('Blood sugar level');
    });

    it('offers no link for a value Trends cannot chart', () => {
      renderWithProviders(
        <TestValuesList testValues={[glucose({ value: 'Negative', unit: '' })]} onOpenTrend={vi.fn()} />
      );

      expect(screen.getByText('Glucose')).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
    });

    it("lets keyboard users read a qualitative value's description", async () => {
      renderWithProviders(
        <TestValuesList testValues={[glucose({ value: 'Negative', unit: '' })]} onOpenTrend={vi.fn()} />
      );

      const name = screen.getByText('Glucose');
      expect(name).toHaveAttribute('tabindex', '0');
      expect(name).toHaveAccessibleDescription(/Blood sugar level/);
      act(() => name.focus());

      expect(await screen.findByRole('tooltip')).toHaveTextContent('Blood sugar level');
    });

    it('offers no link without somewhere to open it', () => {
      renderWithProviders(<TestValuesList testValues={[glucose()]} />);

      expect(screen.queryByRole('button')).toBeNull();
    });
  });
});
