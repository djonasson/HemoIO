/**
 * Tests for BiomarkerDictionary component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { BiomarkerDictionary } from './BiomarkerDictionary';

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
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

    it('should render category accordion', () => {
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      // Should show category names
      expect(screen.getByText('Complete Blood Count')).toBeInTheDocument();
      expect(screen.getByText('Metabolic Panel')).toBeInTheDocument();
      expect(screen.getByText('Lipid Panel')).toBeInTheDocument();
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
      await user.click(screen.getByText('Complete Blood Count'));

      // Should show biomarkers in the category
      await waitFor(() => {
        expect(screen.getByText('White Blood Cell Count')).toBeInTheDocument();
      });
    });

    it('should show biomarker abbreviations', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      await user.click(screen.getByText('Complete Blood Count'));

      await waitFor(() => {
        // WBC is an alias for White Blood Cell Count, shown in parentheses
        expect(screen.getByText('(WBC)')).toBeInTheDocument();
      });
    });

    it('should show biomarker descriptions', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      await user.click(screen.getByText('Complete Blood Count'));

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

    it('should return to category view when search is cleared', async () => {
      const user = userEvent.setup();
      renderWithProviders(<BiomarkerDictionary {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/search biomarkers/i), 'glucose');

      // Clear search
      await user.clear(screen.getByPlaceholderText(/search biomarkers/i));

      await waitFor(() => {
        // Should show categories again
        expect(screen.getByText('Complete Blood Count')).toBeInTheDocument();
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
      await user.click(screen.getByText('Complete Blood Count'));

      await waitFor(async () => {
        const wbcItem = screen.getByLabelText(/view details for white blood cell count/i);
        await user.click(wbcItem);
      });

      expect(onSelectBiomarker).toHaveBeenCalled();
      expect(onSelectBiomarker.mock.calls[0][0].name).toBe('White Blood Cell Count');
    });

    it('should highlight selected biomarker', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <BiomarkerDictionary
          {...defaultProps}
          selectedBiomarker="White Blood Cell Count"
        />
      );

      await user.click(screen.getByText('Complete Blood Count'));

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

      await user.click(screen.getByText('Complete Blood Count'));

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
      await user.click(screen.getByText('Complete Blood Count'));

      await waitFor(async () => {
        const wbcItem = screen.getByLabelText(/view details for white blood cell count/i);
        wbcItem.focus();
        await user.keyboard('{Enter}');
      });

      expect(onSelectBiomarker).toHaveBeenCalled();
    });
  });
});
