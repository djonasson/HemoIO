/**
 * Tests for TestValuesList component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { TestValuesList } from './TestValuesList';
import type { EnrichedTestValue } from '@hooks/useLabResults';

// Mock the biomarker dictionary
vi.mock('@data/biomarkers/dictionary', () => ({
  findBiomarker: vi.fn((name: string) => {
    if (name === 'Hemoglobin' || name === 'Hgb') {
      return {
        name: 'Hemoglobin',
        category: 'cbc',
        specimenType: 'whole-blood',
        loincCode: '718-7',
        description: 'Protein in red blood cells that carries oxygen.',
      };
    }
    if (name === 'Glucose') {
      return {
        name: 'Glucose',
        category: 'metabolic',
        specimenType: 'serum',
        loincCode: '2345-7',
        description: 'Blood glucose level.',
      };
    }
    return undefined;
  }),
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

function createTestValue(
  id: number,
  options: Partial<EnrichedTestValue>
): EnrichedTestValue {
  return {
    id,
    labResultId: 1,
    biomarkerId: 1,
    value: 14.5,
    unit: 'g/dL',
    status: 'normal',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...options,
  };
}

describe('TestValuesList', () => {
  it('should render empty message when no test values', () => {
    renderWithProviders(<TestValuesList testValues={[]} />);

    expect(screen.getByText(/no test values recorded/i)).toBeInTheDocument();
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
});
