import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { IdentificationLabels } from './IdentificationLabels';
import { getBiomarkerByKey } from '@data/biomarkers/dictionary';

it('shows each flag as text', () => {
  render(
    <MantineProvider env="test">
      <IdentificationLabels
        biomarker={{
          name: 'x',
          value: 1,
          unit: 'u',
          confidence: 1,
          isExactMatch: false,
          normalizedUnit: 'u',
          identificationFlags: ['unit-mismatch', 'name-disagrees'],
          nameSuggests: getBiomarkerByKey('urea'),
        }}
      />
    </MantineProvider>
  );
  expect(screen.getByText("Unit doesn't fit")).toBeInTheDocument();
  expect(screen.getByText('Name suggests Urea')).toBeInTheDocument();
});

it('says a value the report gives no unit is saved under its name', () => {
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
          identificationFlags: ['no-unit'],
        }}
      />
    </MantineProvider>
  );
  expect(screen.getByText('No unit in report')).toBeInTheDocument();
});
