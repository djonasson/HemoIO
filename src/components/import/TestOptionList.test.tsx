import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { CatalogContext } from '@contexts/useCatalog';
import { fixtureCatalog } from '@/test/loincFixture';
import { TestOptionList } from './TestOptionList';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

const catalog = fixtureCatalog();
const glucosio: MatchedBiomarker = {
  name: 'Glucosio',
  value: 95,
  unit: 'mg/dL',
  confidence: 1,
  candidates: [{ code: '2339-0', name: 'Glucose [Mass/volume] in Blood', score: 1 }],
};

function renderList(query: string, isPhone: boolean) {
  render(
    <MantineProvider>
      <CatalogContext.Provider value={catalog}>
        <TestOptionList biomarker={glucosio} query={query} isPhone={isPhone} onChoose={vi.fn()} />
      </CatalogContext.Provider>
    </MantineProvider>
  );
}

describe('TestOptionList', () => {
  it('sets the tests side by side, or as cards on a phone', () => {
    renderList('', false);
    expect(screen.getByRole('table', { name: 'Tests' })).toBeInTheDocument();
  });

  it('shows cards on a phone', () => {
    renderList('', true);
    expect(screen.getByRole('group', { name: 'Tests' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('says when a search finds nothing', () => {
    renderList('zzzz', false);
    expect(screen.getByRole('status')).toHaveTextContent('No test found');
  });
});
