/**
 * Tests for BiomarkerDetail component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { BiomarkerDetail } from './BiomarkerDetail';
import type { BiomarkerDefinition } from '@data/biomarkers';

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

function createMockBiomarker(): BiomarkerDefinition {
  return {
    name: 'White Blood Cell Count',
    aliases: ['WBC', 'Leukocytes'],
    category: 'cbc',
    canonicalUnit: '10^9/L',
    alternativeUnits: ['K/uL', 'cells/µL'],
    defaultReferenceRange: { low: 4.5, high: 11.0, unit: '10^9/L' },
    description: 'Measures the total number of white blood cells, which fight infection.',
    highIndication: 'May indicate infection, inflammation, or immune disorders',
    lowIndication: 'May indicate bone marrow problems or autoimmune conditions',
    specimenType: 'whole-blood',
    loincCode: '6690-2',
  };
}

describe('BiomarkerDetail', () => {
  describe('rendering', () => {
    it('should render the biomarker name', () => {
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.getByText('White Blood Cell Count')).toBeInTheDocument();
    });

    it('should render aliases', () => {
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.getByText(/Also known as.*WBC.*Leukocytes/)).toBeInTheDocument();
    });

    it('should render category badge', () => {
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.getByText('Complete Blood Count')).toBeInTheDocument();
    });

    it('should render description', () => {
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(
        screen.getByText(/Measures the total number of white blood cells/)
      ).toBeInTheDocument();
    });

    it('should render reference range', () => {
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.getByText(/4\.5 - 11/)).toBeInTheDocument();
    });

    it('should render canonical unit', () => {
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.getByText('10^9/L')).toBeInTheDocument();
    });

    it('should render alternative units', () => {
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.getByText('K/uL')).toBeInTheDocument();
      expect(screen.getByText('cells/µL')).toBeInTheDocument();
    });

    it('should render high indication', () => {
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.getByText('High Values')).toBeInTheDocument();
      expect(
        screen.getByText(/May indicate infection, inflammation/)
      ).toBeInTheDocument();
    });

    it('should render low indication', () => {
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.getByText('Low Values')).toBeInTheDocument();
      expect(screen.getByText(/May indicate bone marrow problems/)).toBeInTheDocument();
    });

    it('should render educational disclaimer', () => {
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(
        screen.getByText(/for educational purposes only/)
      ).toBeInTheDocument();
    });
  });

  describe('optional fields', () => {
    it('should not render reference range when not provided', () => {
      const biomarker: BiomarkerDefinition = {
        ...createMockBiomarker(),
        defaultReferenceRange: undefined,
      };
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.queryByText('Reference Range')).not.toBeInTheDocument();
    });

    it('should not render high indication when not provided', () => {
      const biomarker: BiomarkerDefinition = {
        ...createMockBiomarker(),
        highIndication: undefined,
      };
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.queryByText('High Values')).not.toBeInTheDocument();
    });

    it('should not render low indication when not provided', () => {
      const biomarker: BiomarkerDefinition = {
        ...createMockBiomarker(),
        lowIndication: undefined,
      };
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.queryByText('Low Values')).not.toBeInTheDocument();
    });

    it('should not render aliases section when empty', () => {
      const biomarker: BiomarkerDefinition = {
        ...createMockBiomarker(),
        aliases: [],
      };
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.queryByText(/Also known as/)).not.toBeInTheDocument();
    });
  });

  describe('close button', () => {
    it('should render close button when onClose is provided', () => {
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} onClose={() => {}} />);

      expect(screen.getByLabelText('Close biomarker detail')).toBeInTheDocument();
    });

    it('should not render close button when onClose is not provided', () => {
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.queryByLabelText('Close biomarker detail')).not.toBeInTheDocument();
    });

    it('should call onClose when close button is clicked', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} onClose={onClose} />);

      await user.click(screen.getByLabelText('Close biomarker detail'));

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should have accessible close button', () => {
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} onClose={() => {}} />);

      expect(screen.getByLabelText('Close biomarker detail')).toBeInTheDocument();
    });
  });

  describe('specimen type display', () => {
    it('should display specimen type when available', () => {
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.getByText(/Specimen: Whole Blood/)).toBeInTheDocument();
    });

    it('should not display specimen type when not available', () => {
      const biomarker: BiomarkerDefinition = {
        ...createMockBiomarker(),
        specimenType: undefined,
      };
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.queryByText(/Specimen:/)).not.toBeInTheDocument();
    });
  });

  describe('LOINC code display', () => {
    it('should display LOINC code when available', () => {
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.getByText('6690-2')).toBeInTheDocument();
    });

    it('should link LOINC code to correct URL', () => {
      const biomarker = createMockBiomarker();
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      const link = screen.getByRole('link', { name: /6690-2/i });
      expect(link).toHaveAttribute('href', 'https://loinc.org/6690-2');
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('should not display LOINC code when not available', () => {
      const biomarker: BiomarkerDefinition = {
        ...createMockBiomarker(),
        loincCode: undefined,
      };
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      expect(screen.queryByText('LOINC:')).not.toBeInTheDocument();
    });

    it('should handle missing LOINC and specimen gracefully', () => {
      const biomarker: BiomarkerDefinition = {
        ...createMockBiomarker(),
        loincCode: undefined,
        specimenType: undefined,
      };
      renderWithProviders(<BiomarkerDetail biomarker={biomarker} />);

      // Should still render the component without errors
      expect(screen.getByText('White Blood Cell Count')).toBeInTheDocument();
    });
  });
});
