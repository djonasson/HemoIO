import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { AnalysisStep, type AnalysisResult, type AnalysisStepProps } from './AnalysisStep';
import type { FileAnalysisState } from '@hooks/useFileAnalysis';

function state(name: string, status: FileAnalysisState['status'], extra: Partial<FileAnalysisState> = {}): FileAnalysisState {
  const finished = status === 'success' || status === 'error';
  return { id: name, name, status, progress: finished ? 100 : 0, ...extra };
}

function succeeded(name: string, values = 1): AnalysisResult {
  return {
    fileId: name,
    fileName: name,
    success: true,
    biomarkers: Array.from({ length: values }, () => ({ name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.9 })) as AnalysisResult['biomarkers'],
    labDate: '2024-01-15',
    confidence: 0.9,
    warnings: [],
  };
}

function failed(name: string, error = 'AI analysis failed: down'): AnalysisResult {
  return { fileId: name, fileName: name, success: false, error, biomarkers: [], confidence: 0, warnings: [] };
}

function renderAnalysisStep(props: Partial<AnalysisStepProps> = {}) {
  const all: AnalysisStepProps = {
    fileStates: [state('test-report.pdf', 'success')],
    results: [succeeded('test-report.pdf')],
    isProcessing: false,
    overallProgress: 100,
    onRetry: vi.fn(),
    onComplete: vi.fn(),
    onBack: vi.fn(),
    ...props,
  };
  render(
    <MantineProvider env="test">
      <AnalysisStep {...all} />
    </MantineProvider>
  );
  return all;
}

describe('AnalysisStep', () => {
  describe('While files are analysed', () => {
    it('shows the overall progress and how many files are still being analysed', () => {
      renderAnalysisStep({
        fileStates: [state('a.pdf', 'success'), state('b.pdf', 'processing'), state('c.pdf', 'pending')],
        results: [succeeded('a.pdf')],
        isProcessing: true,
        overallProgress: 40,
      });

      expect(screen.getByText('Overall Progress')).toBeInTheDocument();
      expect(screen.getByText('Processing 2 file(s)...')).toBeInTheDocument();
      expect(screen.getAllByRole('progressbar')[0]).toHaveAttribute('aria-valuenow', '40');
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });

    it('announces the stage of a file being processed', () => {
      renderAnalysisStep({
        fileStates: [state('a.pdf', 'processing', { stage: 'Waiting for the AI provider (rate limited)', progress: 60 })],
        results: [],
        isProcessing: true,
      });

      const stage = screen.getByText('Waiting for the AI provider (rate limited)');
      expect(stage).toHaveAttribute('aria-live', 'polite');
    });

    it('cannot go back, continue or retry yet', () => {
      renderAnalysisStep({
        fileStates: [state('a.pdf', 'error', { error: 'down' }), state('b.pdf', 'processing')],
        results: [failed('a.pdf')],
        isProcessing: true,
      });

      expect(screen.getByRole('button', { name: /Back/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Review Results/ })).toBeDisabled();
      expect(screen.queryByRole('button', { name: /^Retry/ })).not.toBeInTheDocument();
    });
  });

  describe('Once analysed', () => {
    it('summarises the values found', () => {
      renderAnalysisStep({ results: [succeeded('test-report.pdf', 2)] });

      expect(screen.getByText('Processing complete')).toBeInTheDocument();
      expect(screen.getByRole('alert', { name: 'Analysis Complete' })).toHaveTextContent(
        'Successfully extracted 2 biomarker values from 1 file(s).'
      );
    });

    it('continues with the files that succeeded', async () => {
      const props = renderAnalysisStep({
        fileStates: [state('good.pdf', 'success'), state('bad.pdf', 'error', { error: 'down' })],
        results: [succeeded('good.pdf'), failed('bad.pdf')],
      });

      await userEvent.click(screen.getByRole('button', { name: /Review Results/ }));

      expect(props.onComplete).toHaveBeenCalledWith([props.results[0]]);
    });

    it('goes back', async () => {
      const props = renderAnalysisStep();
      await userEvent.click(screen.getByRole('button', { name: /Back/ }));
      expect(props.onBack).toHaveBeenCalled();
    });
  });

  describe('A failed file', () => {
    it("shows the file's error and offers to retry that file alone", async () => {
      const props = renderAnalysisStep({
        fileStates: [state('good.pdf', 'success'), state('bad.pdf', 'error', { error: 'AI analysis failed: down' })],
        results: [succeeded('good.pdf'), failed('bad.pdf')],
      });

      expect(screen.getByText('AI analysis failed: down')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Retry good.pdf' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Retry bad.pdf' }));

      expect(props.onRetry).toHaveBeenCalledWith('bad.pdf');
    });

    it('tells the user they can retry it or continue without it', () => {
      renderAnalysisStep({
        fileStates: [state('good.pdf', 'success'), state('bad.pdf', 'error')],
        results: [succeeded('good.pdf'), failed('bad.pdf')],
      });

      const alert = screen.getByRole('alert', { name: 'Some Files Failed' });
      expect(alert).toHaveTextContent(
        '1 file(s) could not be processed. You can retry a failed file, or continue with the successful files.'
      );
      expect(alert).not.toHaveTextContent('go back');
    });

    it('cannot be reviewed when every file failed', () => {
      renderAnalysisStep({
        fileStates: [state('bad.pdf', 'error')],
        results: [failed('bad.pdf')],
      });

      expect(screen.getByRole('alert', { name: 'Analysis Failed' })).toHaveTextContent(
        'No files could be processed. Retry them, choose other files, or type the values in yourself.'
      );
      expect(screen.getByRole('button', { name: /Review Results/ })).toBeDisabled();
    });
  });

  describe('Manual entry', () => {
    it('offers manual entry for a file that could not be analyzed', async () => {
      const props = renderAnalysisStep({
        fileStates: [state('blank.pdf', 'error')],
        results: [failed('blank.pdf', 'No readable text found in document')],
      });

      await userEvent.click(screen.getByRole('button', { name: 'Enter values manually' }));

      expect(props.onComplete).toHaveBeenCalledWith([
        expect.objectContaining({
          fileName: 'blank.pdf',
          success: true,
          manualEntry: true,
          biomarkers: [],
        }),
      ]);
    });

    it('keeps the files that succeeded when entering another one manually', async () => {
      const props = renderAnalysisStep({
        fileStates: [state('good.pdf', 'success'), state('bad.pdf', 'error')],
        results: [succeeded('good.pdf'), failed('bad.pdf')],
      });

      await userEvent.click(screen.getByRole('button', { name: 'Enter values manually' }));

      const passed = vi.mocked(props.onComplete).mock.calls[0][0];
      expect(passed.map((r) => [r.fileName, r.manualEntry ?? false])).toEqual([
        ['good.pdf', false],
        ['bad.pdf', true],
      ]);
      // The file that succeeded is passed on as it was analysed
      expect(passed[0]).toBe(props.results[0]);
    });

    it('offers manual entry when the analysis found no values', () => {
      renderAnalysisStep({ results: [succeeded('empty.pdf', 0)] });
      expect(screen.getByRole('button', { name: 'Enter values manually' })).toBeInTheDocument();
      expect(screen.getByText('empty.pdf has no values yet')).toBeInTheDocument();
    });

    it('enters every file without values manually, in one step', async () => {
      const props = renderAnalysisStep({
        fileStates: [state('a.pdf', 'error'), state('b.pdf', 'error')],
        results: [failed('a.pdf'), failed('b.pdf', 'No readable text found in document')],
      });

      const buttons = screen.getAllByRole('button', { name: 'Enter values manually' });
      expect(buttons).toHaveLength(1);
      expect(screen.getByText('2 files have no values yet')).toBeInTheDocument();
      await userEvent.click(buttons[0]);

      const passed = vi.mocked(props.onComplete).mock.calls[0][0];
      expect(passed.map((r) => [r.fileName, r.manualEntry])).toEqual([
        ['a.pdf', true],
        ['b.pdf', true],
      ]);
    });
  });
});
