import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { CatalogContext } from '@contexts/useCatalog';
import { LOINC_NOTICE } from '@data/loinc/notice';
import type { Catalog } from '@data/loinc/catalog';
import { AboutSettings } from './AboutSettings';

function renderAbout() {
  render(
    <MantineProvider>
      <CatalogContext.Provider value={{ version: '2.83' } as Catalog}>
        <AboutSettings />
      </CatalogContext.Provider>
    </MantineProvider>
  );
}

describe('AboutSettings', () => {
  it("states the app's license", () => {
    renderAbout();

    expect(screen.getByText('HemoIO is open source under the MIT license.')).toBeInTheDocument();
  });

  it('shows the LOINC notice with the version of the loaded catalog', () => {
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
