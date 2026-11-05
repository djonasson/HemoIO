import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { CatalogContext } from '@contexts/useCatalog';
import { fixtureCatalog } from '@/test/loincFixture';
import { IdentificationLabels } from './IdentificationLabels';
import type { IdentificationFlag } from '@services/analysis/LabReportAnalyzer';

const catalog = fixtureCatalog();

function renderLabels(identificationFlags: IdentificationFlag[], test: { loincCode?: string; unit?: string } = {}) {
  render(
    <MantineProvider env="test">
      <CatalogContext.Provider value={catalog}>
        <IdentificationLabels
          biomarker={{
            name: 'Proteine (urine)',
            value: 15,
            unit: '',
            confidence: 1,
            candidates: [],
            identificationFlags,
            ...test,
          }}
        />
      </CatalogContext.Provider>
    </MantineProvider>
  );
}

it('shows each flag as text', () => {
  renderLabels(['ambiguous']);
  expect(screen.getByText('Choose a test')).toBeInTheDocument();
});

it('says the report gives a value no unit', () => {
  renderLabels(['no-unit']);
  expect(screen.getByText('No unit in report')).toBeInTheDocument();
});

it('shows nothing when there is nothing to check', () => {
  renderLabels([]);
  expect(screen.queryByTestId('check-labels')).not.toBeInTheDocument();
});

it('says when the unit does not fit the chosen test, without stopping anything', () => {
  renderLabels([], { loincCode: '2345-7', unit: 'U/L' });
  expect(screen.getByText("Unit doesn't fit the test")).toBeInTheDocument();
});

it('says nothing of a unit that fits the test', () => {
  renderLabels([], { loincCode: '2345-7', unit: 'mg/dL' });
  expect(screen.queryByTestId('check-labels')).not.toBeInTheDocument();
});
