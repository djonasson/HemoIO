import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { it, expect, vi } from 'vitest';
import { CatalogContext } from '@contexts/useCatalog';
import { fixtureCatalog } from '@/test/loincFixture';
import { SavedAsCell } from './SavedAsCell';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

const catalog = fixtureCatalog();

const SERUM = 'Glucose [Mass/volume] in Serum or Plasma';
const BLOOD = 'Glucose [Mass/volume] in Blood';

/** "Glucosio" in mg/dL, which serum and blood glucose both fit: no test chosen yet */
const value: MatchedBiomarker = {
  name: 'Glucosio',
  value: 95,
  unit: 'mg/dL',
  confidence: 1,
  identificationFlags: ['ambiguous'],
  candidates: [
    { code: '2345-7', name: SERUM, score: 1 },
    { code: '2339-0', name: BLOOD, score: 1 },
  ],
};

function renderCell(biomarker: MatchedBiomarker = value, onChoose = vi.fn(), env: 'test' | undefined = 'test') {
  render(
    <MantineProvider env={env}>
      <CatalogContext.Provider value={catalog}>
        <SavedAsCell biomarker={biomarker} onChoose={onChoose} />
      </CatalogContext.Provider>
    </MantineProvider>
  );
  return onChoose;
}

/** A test's button: named as shown, then by LOINC's long name and code */
function testName(longName: string, code: string): RegExp {
  const escaped = longName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`, ${escaped} · ${code}$`);
}

function openList() {
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Glucosio' }));
}

it('shows the test with its LOINC code, "No test chosen" or "Not a LOINC test"', () => {
  renderCell({ ...value, loincCode: '2345-7', identificationFlags: [] });
  expect(screen.getByTestId('saved-as')).toHaveTextContent(SERUM);
  expect(screen.getByText('LOINC 2345-7')).toBeInTheDocument();
});

it('says when no test is chosen yet, and when it is not a LOINC test', () => {
  renderCell();
  expect(screen.getByTestId('saved-as')).toHaveTextContent('No test chosen');
  expect(screen.getByText('Choose a test')).toBeInTheDocument();
});

it('says "Not a LOINC test" for a value saved under its name', () => {
  renderCell({ ...value, savedAsUnknown: true, identificationFlags: [] });
  expect(screen.getByTestId('saved-as')).toHaveTextContent('Not a LOINC test');
});

it('lists the candidates with their LOINC names and codes, and chooses one', () => {
  const onChoose = renderCell();
  openList();
  fireEvent.click(screen.getByRole('button', { name: testName(BLOOD, '2339-0') }));
  expect(onChoose).toHaveBeenCalledWith('2339-0');
});

it('searches the whole catalog', () => {
  const onChoose = renderCell();
  openList();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search tests' }), { target: { value: 'Hemoglobin' } });
  fireEvent.click(screen.getByRole('button', { name: testName('Hemoglobin [Mass/volume] in Blood', '718-7') }));
  expect(onChoose).toHaveBeenCalledWith('718-7');
});

it('says when a search finds nothing', () => {
  renderCell();
  openList();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search tests' }), { target: { value: 'zzzz' } });
  expect(screen.getByText('No test found')).toBeInTheDocument();
});

it('chooses "Not a LOINC test"', () => {
  const onChoose = renderCell();
  openList();
  fireEvent.click(screen.getByRole('button', { name: 'Not a LOINC test' }));
  expect(onChoose).toHaveBeenCalledWith(null);
});

it('marks the current test, not by color alone', () => {
  renderCell({ ...value, loincCode: '2345-7', identificationFlags: [] });
  openList();
  expect(screen.getByRole('button', { name: testName(SERUM, '2345-7') })).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('button', { name: 'Not a LOINC test' })).not.toHaveAttribute('aria-current');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('marks "Not a LOINC test" as chosen only once it is', () => {
  renderCell();
  openList();
  expect(screen.getByRole('button', { name: 'Not a LOINC test' })).not.toHaveAttribute('aria-current');
});

it('lists the current test even when it is not a candidate', () => {
  renderCell({ ...value, loincCode: '718-7', identificationFlags: [] });
  openList();
  expect(screen.getByRole('button', { name: testName('Hemoglobin [Mass/volume] in Blood', '718-7') })).toHaveAttribute(
    'aria-current',
    'true'
  );
});

it('chooses the first test found with Enter in the search box', () => {
  const onChoose = renderCell();
  openList();
  const search = screen.getByRole('textbox', { name: 'Search tests' });
  fireEvent.change(search, { target: { value: 'Hemoglobin' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(onChoose).toHaveBeenCalledWith('718-7');
});

it('chooses a code typed in the search box with Enter', () => {
  const onChoose = renderCell();
  openList();
  const search = screen.getByRole('textbox', { name: 'Search tests' });
  fireEvent.change(search, { target: { value: '15074-8' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(onChoose).toHaveBeenCalledWith('15074-8');
});

it('ignores the Enter that ends a composition (an input method)', () => {
  const onChoose = renderCell();
  openList();
  const search = screen.getByRole('textbox', { name: 'Search tests' });
  fireEvent.change(search, { target: { value: 'Glucose' } });
  fireEvent.keyDown(search, { key: 'Enter', isComposing: true });
  expect(onChoose).not.toHaveBeenCalled();
});

it("ignores Safari's Enter that commits a composition (key code 229)", () => {
  const onChoose = renderCell();
  openList();
  const search = screen.getByRole('textbox', { name: 'Search tests' });
  fireEvent.change(search, { target: { value: 'gluc' } });
  fireEvent.keyDown(search, { key: 'Enter', keyCode: 229 });
  expect(onChoose).not.toHaveBeenCalled();
});

it("does not close on Safari's Escape that cancels a composition (key code 229)", () => {
  renderCell();
  openList();
  const search = screen.getByRole('textbox', { name: 'Search tests' });
  fireEvent.keyDown(search, { key: 'Escape', keyCode: 229 });
  expect(screen.getByRole('textbox', { name: 'Search tests' })).toBeInTheDocument();
});

it('chooses once: a second click while the list fades out is ignored', async () => {
  // Transitions on, as in the app: the dialog stays a moment after a choice
  const onChoose = renderCell(value, vi.fn(), undefined);
  openList();
  const option = await screen.findByRole('button', { name: testName(BLOOD, '2339-0') });
  fireEvent.click(option);
  fireEvent.click(option);
  expect(onChoose).toHaveBeenCalledTimes(1);
});

it('closes on Escape also while focus is outside the dialog', async () => {
  renderCell();
  openList();
  fireEvent.keyDown(document.body, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Search tests' })).not.toBeInTheDocument());
});

it('opens with an empty search after the list was closed', async () => {
  renderCell();
  openList();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search tests' }), { target: { value: 'Hemo' } });
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search tests' }), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Search tests' })).not.toBeInTheDocument());
  openList();
  expect(screen.getByRole('textbox', { name: 'Search tests' })).toHaveValue('');
});

it('names the table of tests for screen readers', () => {
  renderCell();
  openList();
  expect(screen.getByRole('table', { name: 'Tests' })).toBeInTheDocument();
});

it("sets the tests side by side, LOINC's name cut into what is measured, sample, method, units and code", () => {
  renderCell();
  openList();
  const table = screen.getByRole('table', { name: 'Tests' });
  expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
    'Test',
    'Sample',
    'Method',
    'Units',
    'Code',
  ]);
  const blood = within(table).getByRole('button', { name: testName(BLOOD, '2339-0') }).closest('tr')!;
  expect(within(blood).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
    expect.stringContaining('Glucose · Mass/volume'),
    'Whole Blood',
    '—',
    expect.stringContaining('fits mg/dL'),
    '2339-0',
  ]);
  // LOINC's own name stays shown with the code
  expect(within(blood).getByText(`LOINC: ${BLOOD}`)).toBeInTheDocument();
});

it('says how common each test is and why it is suggested', () => {
  renderCell({ ...value, aiPick: '2339-0' });
  openList();
  const row = (name: RegExp) => screen.getByRole('button', { name }).closest('tr')!;
  expect(within(row(testName(SERUM, '2345-7'))).getByText('Common')).toBeInTheDocument();
  expect(within(row(testName(SERUM, '2345-7'))).getByText('Name matches')).toBeInTheDocument();
  expect(within(row(testName(BLOOD, '2339-0'))).getByText("The AI's best guess")).toBeInTheDocument();
});

it("says when the value's unit doesn't fit a test, in words", () => {
  renderCell({ ...value, unit: 'U/L' });
  openList();
  expect(screen.getAllByText("U/L doesn't fit")).toHaveLength(2);
});

it('chooses a test by a click anywhere on its row', () => {
  const onChoose = renderCell();
  openList();
  fireEvent.click(screen.getByText('Whole Blood'));
  expect(onChoose).toHaveBeenCalledWith('2339-0');
});

it('shows the tests as cards on a phone, filling the screen', () => {
  const matchMedia = window.matchMedia;
  window.matchMedia = ((query: string) => ({ ...matchMedia(query), matches: query.includes('max-width') })) as typeof window.matchMedia;
  try {
    const onChoose = renderCell();
    openList();
    const cards = screen.getByRole('group', { name: 'Tests' });
    expect(screen.queryByRole('table')).toBeNull();
    const blood = within(cards).getByRole('button', { name: testName(BLOOD, '2339-0') });
    expect(blood).toHaveTextContent('Sample: Whole Blood');
    expect(blood).toHaveTextContent('Method: —');
    expect(blood).toHaveTextContent('Code: 2339-0');
    fireEvent.click(blood);
    expect(onChoose).toHaveBeenCalledWith('2339-0');
  } finally {
    window.matchMedia = matchMedia;
  }
});

it('shows the value as the report printed it, whatever the row was edited to', () => {
  renderCell({
    ...value,
    name: 'Glucose',
    unit: 'mmol/L',
    analyzed: { name: 'Glucosio', unit: 'mg/dL', identification: { candidates: [], identificationFlags: [] } },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Glucose' }));
  expect(screen.getByText('Printed: Glucosio · 95 mg/dL')).toBeInTheDocument();
});
