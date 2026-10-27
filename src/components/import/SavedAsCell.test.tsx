import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { it, expect, vi } from 'vitest';
import { SavedAsCell } from './SavedAsCell';
import { getBiomarkerByKey } from '@data/biomarkers/dictionary';

const value = {
  name: 'Creatinina',
  value: 1,
  unit: 'g/24h',
  confidence: 1,
  isExactMatch: false,
  normalizedUnit: 'g/24h',
  identificationFlags: [],
  dictionaryMatch: getBiomarkerByKey('urine-creatinine'),
};

function renderCell(onChoose = vi.fn()) {
  render(
    <MantineProvider env="test">
      <SavedAsCell biomarker={value} onChoose={onChoose} />
    </MantineProvider>
  );
  return onChoose;
}

it('shows the test, and "Not in dictionary" without one', () => {
  renderCell();
  expect(screen.getByTestId('saved-as')).toHaveTextContent('Urine Creatinine');
});

it('chooses another test from a searchable list', () => {
  const onChoose = renderCell();
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search tests' }), {
    target: { value: '24-Hour Urine Creatinine' },
  });
  fireEvent.click(screen.getByRole('option', { name: '24-Hour Urine Creatinine' }));
  expect(onChoose).toHaveBeenCalledWith(getBiomarkerByKey('24-hour-urine-creatinine'));
});

it('chooses "Not in dictionary"', () => {
  const onChoose = renderCell();
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  fireEvent.click(screen.getByRole('option', { name: 'Not in dictionary' }));
  expect(onChoose).toHaveBeenCalledWith(null);
});

it("shows the test the AI proposed when the unit does not fit it", () => {
  render(
    <MantineProvider env="test">
      <SavedAsCell
        biomarker={{
          ...value,
          dictionaryMatch: undefined,
          suggestedMatch: getBiomarkerByKey('glucose'),
          identificationFlags: ['unit-mismatch'],
        }}
        onChoose={vi.fn()}
      />
    </MantineProvider>
  );
  expect(screen.getByTestId('saved-as')).toHaveTextContent('Proposed: Glucose');
});
