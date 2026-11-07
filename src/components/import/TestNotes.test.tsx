import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect } from 'vitest';
import { TestNotes } from './TestNotes';
import type { TestOptionDetails } from '@services/analysis/testOptions';

const option: TestOptionDetails = {
  code: '2339-0',
  name: 'Glucose [Mass/volume] in Blood',
  component: 'Glucose',
  kind: 'Mass/volume',
  sample: 'Whole Blood',
  method: '',
  units: ['mg/dL'],
  unitFit: 'fits',
  common: false,
};

function renderNotes(details: Partial<TestOptionDetails>) {
  render(
    <MantineProvider>
      <TestNotes option={{ ...option, ...details }} />
    </MantineProvider>
  );
}

describe('TestNotes', () => {
  it("always shows LOINC's own name for the code", () => {
    renderNotes({});
    expect(screen.getByText('LOINC: Glucose [Mass/volume] in Blood')).toBeInTheDocument();
    expect(screen.queryByText('Common')).toBeNull();
  });

  it('marks a common test, says why it is offered and gives the description', () => {
    renderNotes({ common: true, reason: 'Name matches', description: 'Blood sugar level.' });
    expect(screen.getByText('Common')).toBeInTheDocument();
    expect(screen.getByText('Name matches')).toBeInTheDocument();
    expect(screen.getByText('Blood sugar level.')).toBeInTheDocument();
  });
});
