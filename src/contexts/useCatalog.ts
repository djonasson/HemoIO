import { createContext, useContext } from 'react';
import type { Catalog } from '@data/loinc/catalog';

/** The loaded LOINC catalog, provided by CatalogProvider */
export const CatalogContext = createContext<Catalog | null>(null);

/** The loaded LOINC catalog; only within a CatalogProvider */
export function useCatalog(): Catalog {
  const catalog = useContext(CatalogContext);
  if (!catalog) {
    throw new Error('useCatalog must be used within a CatalogProvider');
  }
  return catalog;
}
