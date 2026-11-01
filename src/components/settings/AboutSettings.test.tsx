import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AboutSettings } from './AboutSettings';
import { LOINC_NOTICE } from '@data/biomarkers/loinc';

function renderAbout() {
  render(
    <MantineProvider>
      <AboutSettings />
    </MantineProvider>
  );
}

describe('AboutSettings', () => {
  it("states the app's license", () => {
    renderAbout();

    expect(screen.getByText('HemoIO is open source under the MIT license.')).toBeInTheDocument();
  });

  it('shows the LOINC notice with the LOINC version', () => {
    renderAbout();

    expect(screen.getByText(LOINC_NOTICE)).toBeInTheDocument();
    expect(screen.getByText('LOINC (version 2.83)')).toBeInTheDocument();
  });

  it('links to the LOINC license', () => {
    renderAbout();

    expect(screen.getByRole('link', { name: 'Read the LOINC license' })).toHaveAttribute(
      'href',
      'https://loinc.org/license'
    );
  });
});
