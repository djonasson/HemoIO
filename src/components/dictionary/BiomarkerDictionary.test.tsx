/**
 * Tests for BiomarkerDictionary component
 */

import { beforeAll, describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { loadCatalog, type Catalog } from '@data/loinc/catalog';
import { CatalogContext } from '@contexts/useCatalog';
import { BiomarkerDictionary } from './BiomarkerDictionary';

// The list and its search come from the catalog, loaded as in the unlocked app
let catalog: Catalog;
// Reading the 13 MB catalog and building its search index take seconds on a busy machine
beforeAll(async () => {
  catalog = await loadCatalog();
  catalog.scoredSearch('glucose');
}, 60_000);

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MantineProvider env="test">
      <CatalogContext.Provider value={catalog}>{ui}</CatalogContext.Provider>
    </MantineProvider>
  );
}

describe('BiomarkerDictionary', () => {
  const defaultProps = {
    onSelectBiomarker: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the dictionary title', () => {
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      expect(screen.getByText('Biomarker Dictionary')).toBeInTheDocument();
    });

    it('should render search input', () => {
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      expect(screen.getByPlaceholderText(/search biomarkers/i)).toBeInTheDocument();
    });

    it('groups the tests by LOINC class', () => {
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      expect(screen.getByText('Chemistry')).toBeInTheDocument();
      expect(screen.getByText('Hematology')).toBeInTheDocument();
      expect(screen.getByText('Urinalysis')).toBeInTheDocument();
      expect(screen.getByText('Fertility')).toBeInTheDocument();
    });

    it('should show biomarker count badges', () => {
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      // Each category should have a count badge
      const badges = screen.getAllByText(/^\d+$/);
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  describe('category browsing', () => {
    it('should expand category when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      // Click on CBC category
      await user.click(screen.getByText('Hematology'));

      // Should show biomarkers in the category
      await waitFor(() => {
        expect(screen.getByText('White Blood Cell Count')).toBeInTheDocument();
      });
    });

    it('lists a test the user has values for, under its LOINC class', async () => {
      const user = userEvent.setup();
      // Glucose in blood: HemoIO has no description of it
      const test = catalog.test('2339-0')!;
      renderWithProviders(<BiomarkerDictionary {...defaultProps} valueKeys={['2339-0']} />);

      await user.click(screen.getByText(catalog.classLabel(test.classCode)));

      // LOINC's short name, less its mass property: the test has a molar code too
      const item = await screen.findByRole('button', { name: 'View details for Glucose Bld' });
      // In place of a description, LOINC's name
      expect(item).toHaveTextContent(test.name);
    });

    it('should show biomarker descriptions', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      await user.click(screen.getByText('Hematology'));

      await waitFor(() => {
        // Should show description text (multiple descriptions may contain "white blood cells")
        const descriptions = screen.getAllByText(/white blood cells/i);
        expect(descriptions.length).toBeGreaterThan(0);
      });
    });
  });

  describe('search functionality', () => {
    it('should filter biomarkers when searching', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/search biomarkers/i), 'glucose');

      await waitFor(() => {
        expect(screen.getByText('Glucose')).toBeInTheDocument();
      });
    });

    it('should show result count', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/search biomarkers/i), 'glucose');

      await waitFor(() => {
        expect(screen.getByText(/\d+ results? found/)).toBeInTheDocument();
      });
    });

    it('should show no results message', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/search biomarkers/i), 'xyz123notfound');

      await waitFor(() => {
        expect(screen.getByText(/no biomarkers found/i)).toBeInTheDocument();
      });
    });

    it('should search by alias', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/search biomarkers/i), 'WBC');

      await waitFor(() => {
        expect(screen.getByText('White Blood Cell Count')).toBeInTheDocument();
      });
    });

    it('finds a test of the whole LOINC catalog, named by LOINC', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/search biomarkers/i), 'glucose blood');

      // 2339-0, LOINC's short name less its mass property: the test has a molar code too
      expect(await screen.findByRole('button', { name: 'View details for Glucose Bld' })).toBeInTheDocument();
    });

    it('should return to category view when search is cleared', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/search biomarkers/i), 'glucose');

      // Clear search
      await user.clear(screen.getByPlaceholderText(/search biomarkers/i));

      await waitFor(() => {
        // Should show categories again
        expect(screen.getByText('Hematology')).toBeInTheDocument();
        expect(screen.queryByText(/results? found/)).not.toBeInTheDocument();
      });
    });
  });

  describe('biomarker selection', () => {
    it('should call onSelectBiomarker when biomarker is clicked', async () => {
      const onSelectBiomarker = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <BiomarkerDictionary onSelectBiomarker={onSelectBiomarker} />
      );

      // Expand category first
      await user.click(screen.getByText('Hematology'));

      await waitFor(async () => {
        const wbcItem = screen.getByLabelText(/view details for white blood cell count/i);
        await user.click(wbcItem);
      });

      expect(onSelectBiomarker).toHaveBeenCalledWith('6690-2');
    });

    it('should highlight selected biomarker', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <BiomarkerDictionary
          {...defaultProps}
          selectedBiomarker="6690-2"
        />
      );

      await user.click(screen.getByText('Hematology'));

      await waitFor(() => {
        const selectedItem = screen.getByLabelText(/view details for white blood cell count/i);
        expect(selectedItem).toHaveAttribute('aria-selected', 'true');
      });
    });
  });

  describe('accessibility', () => {
    it('should have accessible search input', () => {
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      expect(screen.getByLabelText(/search biomarkers/i)).toBeInTheDocument();
    });

    it('should have accessible biomarker items', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      await user.click(screen.getByText('Hematology'));

      await waitFor(() => {
        const items = screen.getAllByRole('button', { name: /view details for/i });
        expect(items.length).toBeGreaterThan(0);
      });
    });

    it('should be keyboard navigable', async () => {
      const onSelectBiomarker = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <BiomarkerDictionary onSelectBiomarker={onSelectBiomarker} />
      );

      // Expand category
      await user.click(screen.getByText('Hematology'));

      await waitFor(async () => {
        const wbcItem = screen.getByLabelText(/view details for white blood cell count/i);
        wbcItem.focus();
        await user.keyboard('{Enter}');
      });

      expect(onSelectBiomarker).toHaveBeenCalled();
    });
  });
});
