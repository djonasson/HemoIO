import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { CatalogProvider } from './CatalogContext';
import { useCatalog } from './useCatalog';
import type { Catalog } from '@data/loinc/catalog';

const mockLoadCatalog = vi.fn<() => Promise<Catalog>>();
vi.mock('@data/loinc/catalog', () => ({
  loadCatalog: () => mockLoadCatalog(),
}));

const catalog = { version: '2.83' } as Catalog;

function ShowVersion() {
  return <p>LOINC {useCatalog().version}</p>;
}

function renderProvider() {
  return render(
    <MantineProvider>
      <CatalogProvider>
        <ShowVersion />
      </CatalogProvider>
    </MantineProvider>
  );
}

describe('CatalogProvider', () => {
  beforeEach(() => {
    mockLoadCatalog.mockReset();
  });

  it('shows that it is loading, then its children with the catalog', async () => {
    mockLoadCatalog.mockResolvedValue(catalog);
    renderProvider();

    expect(screen.getByRole('status')).toHaveTextContent('Loading the test catalog');
    expect(await screen.findByText('LOINC 2.83')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows an error with retry when the catalog cannot load', async () => {
    mockLoadCatalog.mockRejectedValueOnce(new Error('chunk failed')).mockResolvedValueOnce(catalog);
    renderProvider();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Test catalog could not be loaded');
    expect(screen.queryByText('LOINC 2.83')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('LOINC 2.83')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockLoadCatalog).toHaveBeenCalledTimes(2);
  });
});

describe('useCatalog', () => {
  it('throws outside a CatalogProvider', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => renderHook(() => useCatalog())).toThrow(
        'useCatalog must be used within a CatalogProvider'
      );
    } finally {
      error.mockRestore();
    }
  });
});
