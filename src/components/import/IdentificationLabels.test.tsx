import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { IdentificationLabels } from './IdentificationLabels';
import type { IdentificationFlag } from '@services/analysis/LabReportAnalyzer';

function renderLabels(identificationFlags: IdentificationFlag[]) {
  render(
    <MantineProvider env="test">
      <IdentificationLabels
        biomarker={{
          name: 'Proteine (urine)',
          value: 15,
          unit: '',
          confidence: 1,
          isExactMatch: false,
          normalizedUnit: '',
          candidates: [],
          identificationFlags,
        }}
      />
    </MantineProvider>
  );
}

it('shows each flag as text', () => {
  renderLabels(['ambiguous']);
  expect(screen.getByText('Choose a test')).toBeInTheDocument();
});

it('says a value the report gives no unit is saved under its name', () => {
  renderLabels(['no-unit']);
  expect(screen.getByText('No unit in report')).toBeInTheDocument();
});

it('shows nothing when there is nothing to check', () => {
  renderLabels([]);
  expect(screen.queryByTestId('check-labels')).not.toBeInTheDocument();
});
