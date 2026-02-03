import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { TrendChartControls, type BiomarkerOption } from './TrendChartControls';

const mockBiomarkerOptions: BiomarkerOption[] = [
  { value: '1', label: 'Glucose', category: 'metabolic', dataPointCount: 10 },
  { value: '2', label: 'Hemoglobin', category: 'cbc', dataPointCount: 5 },
  { value: '3', label: 'Cholesterol', category: 'lipid', dataPointCount: 3 },
  { value: '4', label: 'Creatinine', category: 'metabolic', dataPointCount: 0 },
];

interface TrendChartControlsTestProps {
  biomarkerOptions?: BiomarkerOption[];
  selectedBiomarkerId?: string | null;
  onBiomarkerChange?: (biomarkerId: string | null) => void;
  startDate?: Date | null;
  endDate?: Date | null;
  onStartDateChange?: (date: Date | null) => void;
  onEndDateChange?: (date: Date | null) => void;
  onReset?: () => void;
  onCompare?: () => void;
  showCompareButton?: boolean;
  disabled?: boolean;
}

function renderTrendChartControls(props: TrendChartControlsTestProps = {}) {
  const defaultProps = {
    biomarkerOptions: mockBiomarkerOptions,
    selectedBiomarkerId: null,
    onBiomarkerChange: vi.fn(),
    startDate: null,
    endDate: null,
    onStartDateChange: vi.fn(),
    onEndDateChange: vi.fn(),
    onReset: vi.fn(),
    onCompare: vi.fn(),
    showCompareButton: true,
    disabled: false,
    ...props,
  };

  return render(
    <MantineProvider>
      <TrendChartControls {...defaultProps} />
    </MantineProvider>
  );
}

describe('TrendChartControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders biomarker select', () => {
      renderTrendChartControls();

      expect(screen.getByText('Select Biomarker')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Choose a biomarker to visualize')).toBeInTheDocument();
    });

    it('renders date pickers', () => {
      renderTrendChartControls();

      expect(screen.getByText('From Date')).toBeInTheDocument();
      expect(screen.getByText('To Date')).toBeInTheDocument();
    });

    it('renders reset button', () => {
      renderTrendChartControls();

      expect(screen.getByRole('button', { name: /Reset/i })).toBeInTheDocument();
    });

    it('renders compare button when showCompareButton is true', () => {
      renderTrendChartControls({ showCompareButton: true, onCompare: vi.fn() });

      expect(screen.getByRole('button', { name: /Compare Markers/i })).toBeInTheDocument();
    });

    it('does not render compare button when showCompareButton is false', () => {
      renderTrendChartControls({ showCompareButton: false });

      expect(screen.queryByRole('button', { name: /Compare Markers/i })).not.toBeInTheDocument();
    });
  });

  describe('Biomarker selection', () => {
    it('calls onBiomarkerChange when biomarker is selected', () => {
      const onBiomarkerChange = vi.fn();
      renderTrendChartControls({ onBiomarkerChange });

      const select = screen.getByPlaceholderText('Choose a biomarker to visualize');
      fireEvent.click(select);
      fireEvent.click(screen.getByText(/Glucose/));

      // Mantine Select passes value and option object
      expect(onBiomarkerChange).toHaveBeenCalled();
      expect(onBiomarkerChange.mock.calls[0][0]).toBe('1');
    });

    it('shows data point count in biomarker label', () => {
      renderTrendChartControls();

      const select = screen.getByPlaceholderText('Choose a biomarker to visualize');
      fireEvent.click(select);

      expect(screen.getByText(/10 values/)).toBeInTheDocument();
      expect(screen.getByText(/5 values/)).toBeInTheDocument();
    });

    it('shows singular form for 1 value', () => {
      const singleValueOption: BiomarkerOption[] = [
        { value: '1', label: 'Test', category: 'metabolic', dataPointCount: 1 },
      ];
      renderTrendChartControls({ biomarkerOptions: singleValueOption });

      const select = screen.getByPlaceholderText('Choose a biomarker to visualize');
      fireEvent.click(select);

      expect(screen.getByText(/1 value\)/)).toBeInTheDocument();
    });

    it('disables biomarkers with 0 data points', () => {
      renderTrendChartControls();

      const select = screen.getByPlaceholderText('Choose a biomarker to visualize');
      fireEvent.click(select);

      // Options with 0 data points should show disabled styling via Mantine's Select
      // Mantine uses data-combobox-selected="false" and disabled attribute on option
      const creatinineOption = screen.getByText(/Creatinine/);
      // The option should be present but disabled (Mantine marks disabled with data-combobox-disabled)
      const option = creatinineOption.closest('[role="option"]');
      expect(option).toHaveAttribute('data-combobox-disabled', 'true');
    });
  });

  describe('Data point count display', () => {
    it('shows data point count when biomarker is selected', () => {
      renderTrendChartControls({ selectedBiomarkerId: '1' });

      expect(screen.getByText(/Showing 10 data points/)).toBeInTheDocument();
    });

    it('shows singular form for 1 data point', () => {
      const options: BiomarkerOption[] = [
        { value: '1', label: 'Test', category: 'metabolic', dataPointCount: 1 },
      ];
      renderTrendChartControls({ biomarkerOptions: options, selectedBiomarkerId: '1' });

      expect(screen.getByText(/Showing 1 data point$/)).toBeInTheDocument();
    });

    it('does not show data point count when no biomarker selected', () => {
      renderTrendChartControls({ selectedBiomarkerId: null });

      expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
    });
  });

  describe('Reset button', () => {
    it('calls onReset when clicked', () => {
      const onReset = vi.fn();
      renderTrendChartControls({ onReset });

      fireEvent.click(screen.getByRole('button', { name: /Reset/i }));

      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('Compare button', () => {
    it('calls onCompare when clicked', () => {
      const onCompare = vi.fn();
      renderTrendChartControls({ onCompare, selectedBiomarkerId: '1' });

      fireEvent.click(screen.getByRole('button', { name: /Compare Markers/i }));

      expect(onCompare).toHaveBeenCalledTimes(1);
    });

    it('is disabled when no biomarker is selected', () => {
      renderTrendChartControls({ selectedBiomarkerId: null });

      expect(screen.getByRole('button', { name: /Compare Markers/i })).toBeDisabled();
    });

    it('is enabled when biomarker is selected', () => {
      renderTrendChartControls({ selectedBiomarkerId: '1' });

      expect(screen.getByRole('button', { name: /Compare Markers/i })).not.toBeDisabled();
    });
  });

  describe('Disabled state', () => {
    it('disables biomarker select when disabled is true', () => {
      renderTrendChartControls({ disabled: true });

      const select = screen.getByPlaceholderText('Choose a biomarker to visualize');
      expect(select).toBeDisabled();
    });

    it('disables reset button when disabled is true', () => {
      renderTrendChartControls({ disabled: true });

      expect(screen.getByRole('button', { name: /Reset/i })).toBeDisabled();
    });

    it('disables compare button when disabled is true', () => {
      renderTrendChartControls({ disabled: true, selectedBiomarkerId: '1' });

      expect(screen.getByRole('button', { name: /Compare Markers/i })).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('biomarker select has accessible label', () => {
      renderTrendChartControls();

      expect(screen.getByLabelText(/Select biomarker to view trend/i)).toBeInTheDocument();
    });

    it('date pickers have accessible labels', () => {
      renderTrendChartControls();

      expect(screen.getByLabelText(/Filter from date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Filter to date/i)).toBeInTheDocument();
    });
  });
});
