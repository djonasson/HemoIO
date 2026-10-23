import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { AnalysisStep } from './AnalysisStep';
import { analyzeLabReport } from '../../services/analysis';
import type { AnalysisResult as ServiceAnalysisResult } from '../../services/analysis';
import type { UploadedFile } from './UploadStep';

// Mock the analysis service
vi.mock('../../services/analysis', () => ({
  analyzeLabReport: vi.fn(),
  AnalysisError: class AnalysisError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AnalysisError';
    }
  },
}));

// Mock concurrency utility
vi.mock('../../utils/concurrency', () => ({
  processWithConcurrency: vi.fn(async (items, processor) => {
    for (let index = 0; index < items.length; index++) {
      await processor(items[index], index);
    }
  }),
}));

const mockFile = new File(['test content'], 'test-report.pdf', { type: 'application/pdf' });

const mockUploadedFile: UploadedFile = {
  file: mockFile,
  id: 'file1',
  formattedSize: '1.5 KB',
};

const defaultProps = {
  files: [mockUploadedFile],
  aiProvider: 'openai' as const,
  getApiKey: vi.fn().mockResolvedValue('sk-test-key'),
  aiModel: 'gpt-4',
  onComplete: vi.fn(),
  onBack: vi.fn(),
};

function renderAnalysisStep(props: Partial<typeof defaultProps> = {}) {
  return render(
    <MantineProvider env="test">
      <AnalysisStep {...defaultProps} {...props} />
    </MantineProvider>
  );
}

/**
 * Analysis starts on mount; wait until it finishes (the Back button only
 * appears then) so its state updates don't land after the test has ended.
 */
async function waitForAnalysisToFinish(): Promise<void> {
  await screen.findByRole('button', { name: /Back/i });
}

describe('AnalysisStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial rendering', () => {
    it('renders overall progress section', async () => {
      renderAnalysisStep();

      expect(screen.getByText('Overall Progress')).toBeInTheDocument();

      await waitForAnalysisToFinish();
    });

    it('displays processing message initially', async () => {
      renderAnalysisStep();

      expect(screen.getByText(/Processing.*file/)).toBeInTheDocument();

      await waitForAnalysisToFinish();
    });

    it('displays file names in list', async () => {
      renderAnalysisStep();

      expect(screen.getByText('test-report.pdf')).toBeInTheDocument();

      await waitForAnalysisToFinish();
    });

    it('displays multiple files', async () => {
      const secondFile: UploadedFile = {
        file: new File(['content'], 'second-report.pdf', { type: 'application/pdf' }),
        id: 'file2',
        formattedSize: '2.0 KB',
      };

      renderAnalysisStep({ files: [mockUploadedFile, secondFile] });

      expect(screen.getByText('test-report.pdf')).toBeInTheDocument();
      expect(screen.getByText('second-report.pdf')).toBeInTheDocument();

      await waitForAnalysisToFinish();
    });
  });

  describe('Progress display', () => {
    it('shows progress bar', async () => {
      renderAnalysisStep();

      // Progress bar should be present
      const progressBar = document.querySelector('.mantine-Progress-root');
      expect(progressBar).toBeInTheDocument();

      await waitForAnalysisToFinish();
    });
  });

  describe('Back button', () => {
    it('displays back button', async () => {
      renderAnalysisStep();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('API key handling', () => {
    it('calls getApiKey for non-ollama providers', async () => {
      const getApiKey = vi.fn().mockResolvedValue('sk-test-key');
      renderAnalysisStep({ getApiKey, aiProvider: 'openai' });

      await waitFor(() => {
        expect(getApiKey).toHaveBeenCalled();
      });
    });
  });

  describe('File list rendering', () => {
    it('shows file status icons', async () => {
      renderAnalysisStep();

      // Initial state should show pending icons
      const listItems = document.querySelectorAll('.mantine-List-item');
      expect(listItems.length).toBe(1);

      await waitForAnalysisToFinish();
    });

    it('displays correct file count in progress message', async () => {
      const files = [
        mockUploadedFile,
        { ...mockUploadedFile, id: 'file2', file: new File([''], 'file2.pdf') },
        { ...mockUploadedFile, id: 'file3', file: new File([''], 'file3.pdf') },
      ];

      renderAnalysisStep({ files });

      expect(screen.getByText(/Processing 3 file/)).toBeInTheDocument();

      await waitForAnalysisToFinish();
    });
  });

  describe('Manual entry', () => {
    function uploaded(name: string): UploadedFile {
      return {
        file: new File(['x'], name, { type: 'application/pdf' }),
        id: name,
        formattedSize: '1 KB',
      };
    }

    function successfulAnalysis(): ServiceAnalysisResult {
      return {
        matchedBiomarkers: [
          { name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.9, isExactMatch: true, normalizedUnit: 'mg/dL' },
        ],
        labDate: '2024-01-15',
        labName: 'Lab',
        overallConfidence: 0.9,
        warnings: [],
        duplicateConflicts: [],
      } as unknown as ServiceAnalysisResult;
    }

    it('offers manual entry for a file that could not be analyzed', async () => {
      vi.mocked(analyzeLabReport).mockRejectedValueOnce(
        new Error('No readable text found in document')
      );
      const onComplete = vi.fn();
      renderAnalysisStep({ files: [uploaded('blank.pdf')], onComplete });

      await userEvent.click(await screen.findByRole('button', { name: 'Enter values manually' }));

      expect(onComplete).toHaveBeenCalledWith([
        expect.objectContaining({
          fileName: 'blank.pdf',
          success: true,
          manualEntry: true,
          biomarkers: [],
        }),
      ]);
    });

    it('keeps the files that succeeded when entering another one manually', async () => {
      vi.mocked(analyzeLabReport)
        .mockResolvedValueOnce(successfulAnalysis())
        .mockRejectedValueOnce(new Error('AI analysis failed: down'));
      const onComplete = vi.fn();
      renderAnalysisStep({ files: [uploaded('good.pdf'), uploaded('bad.pdf')], onComplete });

      await userEvent.click(await screen.findByRole('button', { name: 'Enter values manually' }));

      const passed = onComplete.mock.calls[0][0] as Array<{ fileName: string; manualEntry?: boolean }>;
      expect(passed.map((r) => [r.fileName, r.manualEntry ?? false])).toEqual([
        ['good.pdf', false],
        ['bad.pdf', true],
      ]);
    });

    it('offers manual entry when the analysis found no values', async () => {
      vi.mocked(analyzeLabReport).mockResolvedValueOnce({
        ...successfulAnalysis(),
        matchedBiomarkers: [],
      });
      renderAnalysisStep({ files: [uploaded('empty.pdf')] });
      expect(await screen.findByRole('button', { name: 'Enter values manually' })).toBeInTheDocument();
    });
  });

  it('announces the stage of a file being processed', async () => {
    vi.mocked(analyzeLabReport).mockImplementationOnce(async (_file, options) => {
      options.onProgress?.('Waiting for the AI provider (rate limited)', 0.6);
      return new Promise(() => {});
    });
    renderAnalysisStep({ files: [mockUploadedFile] });

    const stage = await screen.findByText('Waiting for the AI provider (rate limited)');
    expect(stage).toHaveAttribute('aria-live', 'polite');
  });
});
