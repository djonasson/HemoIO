import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AnalysisStep } from './AnalysisStep';
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
  processWithConcurrency: vi.fn(async (items, processor, _options, onComplete) => {
    for (const item of items) {
      await processor(item);
      onComplete?.();
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
});
