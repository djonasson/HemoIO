import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  fireEvent.click(screen.getByRole('button', { name: '24-Hour Urine Creatinine' }));
  expect(onChoose).toHaveBeenCalledWith(getBiomarkerByKey('24-hour-urine-creatinine'));
});

it('chooses "Not in dictionary"', () => {
  const onChoose = renderCell();
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  fireEvent.click(screen.getByRole('button', { name: 'Not in dictionary' }));
  expect(onChoose).toHaveBeenCalledWith(null);
});

it('marks the current test, not by color alone', () => {
  renderCell();
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  expect(screen.getByRole('button', { name: 'Urine Creatinine' })).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('button', { name: 'Not in dictionary' })).not.toHaveAttribute('aria-current');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('chooses the first match with Enter in the search box', () => {
  const onChoose = renderCell();
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  const search = screen.getByRole('textbox', { name: 'Search tests' });
  fireEvent.change(search, { target: { value: '24-Hour Urine Creatinine' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(onChoose).toHaveBeenCalledWith(getBiomarkerByKey('24-hour-urine-creatinine'));
});

it('chooses the test a name is exactly with Enter, not the first one containing it', () => {
  const onChoose = renderCell();
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  const search = screen.getByRole('textbox', { name: 'Search tests' });
  fireEvent.change(search, { target: { value: 'Urea' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(onChoose).toHaveBeenCalledWith(getBiomarkerByKey('urea'));
});

it('ignores the Enter that ends a composition (an input method)', () => {
  const onChoose = renderCell();
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  const search = screen.getByRole('textbox', { name: 'Search tests' });
  fireEvent.change(search, { target: { value: 'Urine' } });
  fireEvent.keyDown(search, { key: 'Enter', isComposing: true });
  expect(onChoose).not.toHaveBeenCalled();
});

it("ignores Safari's Enter that commits a composition (key code 229)", () => {
  const onChoose = renderCell();
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  const search = screen.getByRole('textbox', { name: 'Search tests' });
  fireEvent.change(search, { target: { value: 'creat' } });
  fireEvent.keyDown(search, { key: 'Enter', keyCode: 229 });
  expect(onChoose).not.toHaveBeenCalled();
});

it("does not close on Safari's Escape that cancels a composition (key code 229)", () => {
  renderCell();
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  const search = screen.getByRole('textbox', { name: 'Search tests' });
  fireEvent.keyDown(search, { key: 'Escape', keyCode: 229 });
  expect(screen.getByRole('textbox', { name: 'Search tests' })).toBeInTheDocument();
});

it('chooses once: a second click while the list fades out is ignored', async () => {
  // Transitions on, as in the app: the dialog stays a moment after a choice
  const onChoose = vi.fn();
  render(
    <MantineProvider>
      <SavedAsCell biomarker={value} onChoose={onChoose} />
    </MantineProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  const option = await screen.findByRole('button', { name: 'Urine Urea' });
  fireEvent.click(option);
  fireEvent.click(option);
  expect(onChoose).toHaveBeenCalledTimes(1);
});

it('closes on Escape also while focus is outside the dialog', async () => {
  renderCell();
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  fireEvent.keyDown(document.body, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Search tests' })).not.toBeInTheDocument());
});

it('opens with an empty search after the list was closed', async () => {
  renderCell();
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search tests' }), { target: { value: 'Urea' } });
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search tests' }), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Search tests' })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  expect(screen.getByRole('textbox', { name: 'Search tests' })).toHaveValue('');
});

it('names the group of tests for screen readers', () => {
  renderCell();
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  expect(screen.getByRole('group', { name: 'Tests' })).toBeInTheDocument();
});

it('does not mark "Not in dictionary" as chosen for a test the AI proposed', () => {
  render(
    <MantineProvider env="test">
      <SavedAsCell
        biomarker={{ ...value, dictionaryMatch: undefined, suggestedMatch: getBiomarkerByKey('glucose'),
          identificationFlags: ['unit-mismatch'] }}
        onChoose={vi.fn()}
      />
    </MantineProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  expect(screen.getByRole('button', { name: 'Not in dictionary' })).not.toHaveAttribute('aria-current');
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
