import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect } from 'vitest';
import { UnitsText } from './UnitsText';
import type { TestOptionDetails } from '@services/analysis/testOptions';

const option: TestOptionDetails = {
  code: '2345-7',
  name: 'Glucose [Mass/volume] in Serum or Plasma',
  component: 'Glucose',
  kind: 'Mass/volume',
  sample: 'Serum/Plasma',
  method: '',
  units: ['mg/dL', 'mmol/L', 'g/L', 'mg/L'],
  unitFit: 'fits',
  common: true,
};

function renderUnits(details: Partial<TestOptionDetails>, unit = 'mg/dL') {
  render(
    <MantineProvider>
      <UnitsText option={{ ...option, ...details }} unit={unit} />
    </MantineProvider>
  );
}

describe('UnitsText', () => {
  it("lists the test's first units and says the value's unit fits", () => {
    renderUnits({});
    expect(screen.getByText('mg/dL, mmol/L, g/L')).toBeInTheDocument();
    expect(screen.getByText('fits mg/dL')).toBeInTheDocument();
  });

  it("says in words when the value's unit doesn't fit", () => {
    renderUnits({ unitFit: 'misfits' }, 'U/L');
    expect(screen.getByText("U/L doesn't fit")).toBeInTheDocument();
  });

  it('says nothing of a unit it cannot judge, and a dash for a test with no units', () => {
    renderUnits({ unitFit: 'unknown', units: [] });
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/fit/)).toBeNull();
  });
});
