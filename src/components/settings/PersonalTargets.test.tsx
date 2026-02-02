/**
 * Tests for PersonalTargets component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { PersonalTargets, type PersonalTarget } from './PersonalTargets';

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

function createMockTargets(): PersonalTarget[] {
  return [
    {
      biomarkerId: 1,
      biomarkerName: 'Glucose',
      unit: 'mg/dL',
      standardLow: 70,
      standardHigh: 100,
    },
    {
      biomarkerId: 2,
      biomarkerName: 'Hemoglobin',
      unit: 'g/dL',
      standardLow: 12.0,
      standardHigh: 17.5,
      personalLow: 13.0,
      personalHigh: 16.0,
    },
    {
      biomarkerId: 3,
      biomarkerName: 'Cholesterol',
      unit: 'mg/dL',
      standardHigh: 200,
    },
  ];
}

describe('PersonalTargets', () => {
  const defaultProps = {
    targets: createMockTargets(),
    onSetTarget: vi.fn(),
    onClearTarget: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the personal targets title', () => {
      renderWithProviders(<PersonalTargets {...defaultProps} />);

      expect(screen.getByText('Personal Target Ranges')).toBeInTheDocument();
    });

    it('should render search input', () => {
      renderWithProviders(<PersonalTargets {...defaultProps} />);

      expect(screen.getByPlaceholderText(/search biomarkers/i)).toBeInTheDocument();
    });

    it('should render biomarker table', () => {
      renderWithProviders(<PersonalTargets {...defaultProps} />);

      expect(screen.getByText('Glucose')).toBeInTheDocument();
      expect(screen.getByText('Hemoglobin')).toBeInTheDocument();
      expect(screen.getByText('Cholesterol')).toBeInTheDocument();
    });

    it('should show standard ranges', () => {
      renderWithProviders(<PersonalTargets {...defaultProps} />);

      expect(screen.getByText('70 - 100')).toBeInTheDocument();
    });

    it('should show personal target count badge', () => {
      renderWithProviders(<PersonalTargets {...defaultProps} />);

      expect(screen.getByText('1 custom')).toBeInTheDocument();
    });
  });

  describe('personal targets display', () => {
    it('should show personal target when set', () => {
      renderWithProviders(<PersonalTargets {...defaultProps} />);

      // Hemoglobin has personal target 13.0 - 16.0
      expect(screen.getByText('13 - 16')).toBeInTheDocument();
    });

    it('should show "Using standard" when no personal target', () => {
      renderWithProviders(<PersonalTargets {...defaultProps} />);

      // Should show for biomarkers without personal targets
      const usingStandardTexts = screen.getAllByText('Using standard');
      expect(usingStandardTexts.length).toBeGreaterThan(0);
    });
  });

  describe('search functionality', () => {
    it('should filter biomarkers by search term', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PersonalTargets {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/search biomarkers/i), 'glucose');

      expect(screen.getByText('Glucose')).toBeInTheDocument();
      expect(screen.queryByText('Hemoglobin')).not.toBeInTheDocument();
      expect(screen.queryByText('Cholesterol')).not.toBeInTheDocument();
    });

    it('should show message when no results', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PersonalTargets {...defaultProps} />);

      await user.type(screen.getByPlaceholderText(/search biomarkers/i), 'xyz123');

      expect(screen.getByText(/no biomarkers found/i)).toBeInTheDocument();
    });
  });

  describe('setting personal target', () => {
    it('should open modal when set button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PersonalTargets {...defaultProps} />);

      const setButtons = screen.getAllByLabelText(/set personal target for/i);
      await user.click(setButtons[0]);

      expect(screen.getByText(/set personal target for glucose/i)).toBeInTheDocument();
    });

    it('should show standard range in modal', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PersonalTargets {...defaultProps} />);

      const setButtons = screen.getAllByLabelText(/set personal target for/i);
      await user.click(setButtons[0]);

      expect(screen.getByText(/standard reference range.*70 - 100/i)).toBeInTheDocument();
    });

    it('should have low and high value inputs', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PersonalTargets {...defaultProps} />);

      const setButtons = screen.getAllByLabelText(/set personal target for/i);
      await user.click(setButtons[0]);

      expect(screen.getByLabelText(/personal target low value/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/personal target high value/i)).toBeInTheDocument();
    });

    it('should call onSetTarget when saving', async () => {
      const onSetTarget = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<PersonalTargets {...defaultProps} onSetTarget={onSetTarget} />);

      const setButtons = screen.getAllByLabelText(/set personal target for/i);
      await user.click(setButtons[0]);

      await user.type(screen.getByLabelText(/personal target low value/i), '75');
      await user.type(screen.getByLabelText(/personal target high value/i), '95');
      await user.click(screen.getByRole('button', { name: /save target/i }));

      expect(onSetTarget).toHaveBeenCalledWith(1, 75, 95);
    });

    it('should close modal after saving', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PersonalTargets {...defaultProps} />);

      const setButtons = screen.getAllByLabelText(/set personal target for/i);
      await user.click(setButtons[0]);

      await user.type(screen.getByLabelText(/personal target low value/i), '75');
      await user.click(screen.getByRole('button', { name: /save target/i }));

      await waitFor(() => {
        expect(screen.queryByText(/set personal target for glucose/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('clearing personal target', () => {
    it('should show clear button for biomarkers with personal targets', () => {
      renderWithProviders(<PersonalTargets {...defaultProps} />);

      // Hemoglobin has personal target, should have clear button
      expect(screen.getByLabelText(/clear personal target for hemoglobin/i)).toBeInTheDocument();
    });

    it('should call onClearTarget when clear is clicked', async () => {
      const onClearTarget = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<PersonalTargets {...defaultProps} onClearTarget={onClearTarget} />);

      await user.click(screen.getByLabelText(/clear personal target for hemoglobin/i));

      expect(onClearTarget).toHaveBeenCalledWith(2);
    });
  });

  describe('saving state', () => {
    it('should disable buttons when saving', () => {
      renderWithProviders(<PersonalTargets {...defaultProps} isSaving={true} />);

      const setButtons = screen.getAllByLabelText(/set personal target for/i);
      setButtons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('accessibility', () => {
    it('should have accessible search input', () => {
      renderWithProviders(<PersonalTargets {...defaultProps} />);

      expect(screen.getByLabelText(/search biomarkers/i)).toBeInTheDocument();
    });

    it('should have accessible action buttons', () => {
      renderWithProviders(<PersonalTargets {...defaultProps} />);

      // Each biomarker should have accessible buttons
      expect(screen.getAllByLabelText(/set personal target for/i).length).toBeGreaterThan(0);
    });
  });
});
