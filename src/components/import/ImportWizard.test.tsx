import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';

// Mock the services to avoid loading pdf.js
vi.mock('../../services/ocr', () => ({
  isSupportedDocument: vi.fn().mockReturnValue(true),
  getAcceptString: vi.fn().mockReturnValue('application/pdf,image/jpeg,image/png'),
  SUPPORTED_MIME_TYPES: {
    pdf: 'application/pdf',
    jpeg: 'image/jpeg',
    png: 'image/png',
  },
  detectDocumentType: vi.fn(),
  readPdf: vi.fn(),
  recognizeImage: vi.fn(),
}));

vi.mock('../../services/analysis', () => ({
  analyzeLabReport: vi.fn(),
}));

import { CatalogContext } from '@contexts/useCatalog';
import { fixtureCatalog } from '@/test/loincFixture';
import { ImportWizard } from './ImportWizard';
import { analyzeLabReport } from '../../services/analysis';
import type { AnalysisResult as ServiceAnalysisResult } from '../../services/analysis';

const catalog = fixtureCatalog();

// Wrapper with Mantine and the LOINC catalog
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider env="test">
    <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>
  </MantineProvider>
);

describe('ImportWizard', () => {
  const mockGetApiKey = vi.fn().mockResolvedValue('sk-test-key');

  const defaultProps = {
    onComplete: vi.fn(),
    onCancel: vi.fn(),
    aiProvider: 'openai' as const,
    getApiKey: mockGetApiKey,
  };

  it('renders the wizard title', () => {
    render(
      <TestWrapper>
        <ImportWizard {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByText('Import Lab Results')).toBeInTheDocument();
  });

  it('is not held to a fixed width, so it uses all the room beside the menu', () => {
    const { container } = render(
      <TestWrapper>
        <ImportWizard {...defaultProps} />
      </TestWrapper>
    );

    expect(container.querySelector('.mantine-Container-root')).toBeNull();
  });

  it('renders all step labels', () => {
    render(
      <TestWrapper>
        <ImportWizard {...defaultProps} />
      </TestWrapper>
    );

    // Use getAllByText since some labels may appear in multiple places
    expect(screen.getAllByText('Upload').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Analyze').length).toBeGreaterThan(0);
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('starts on the upload step', () => {
    render(
      <TestWrapper>
        <ImportWizard {...defaultProps} />
      </TestWrapper>
    );

    // Should show upload instructions
    expect(
      screen.getByText(/Drag files here or click to select/i)
    ).toBeInTheDocument();
  });

  it('renders the description text', () => {
    render(
      <TestWrapper>
        <ImportWizard {...defaultProps} />
      </TestWrapper>
    );

    expect(
      screen.getByText(/Upload your lab report documents/i)
    ).toBeInTheDocument();
  });

  describe('Going back', () => {
    const analysed = {
      matchedBiomarkers: [{ name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.9 }],
      labDate: '2024-01-15',
      labName: 'Analysed Lab',
      overallConfidence: 0.9,
      warnings: [],
      duplicateConflicts: [],
    } as unknown as ServiceAnalysisResult;

    beforeEach(() => {
      vi.mocked(analyzeLabReport).mockReset();
    });

    async function analyse(names: string[]): Promise<void> {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await userEvent.upload(input, names.map((name) => new File(['x'], name, { type: 'application/pdf' })));
      await userEvent.click(screen.getByRole('button', { name: /^Analyze \(\d+\)$/ }));
      await screen.findByText('Processing complete');
    }

    async function back(): Promise<void> {
      await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    }

    it('keeps the analysis and the review edits, analysing nothing again', async () => {
      vi.mocked(analyzeLabReport).mockResolvedValue(analysed);
      render(
        <TestWrapper>
          <ImportWizard {...defaultProps} />
        </TestWrapper>
      );
      await analyse(['report.pdf']);
      await userEvent.click(screen.getByRole('button', { name: /^Review Results/ }));
      const labName = await screen.findByLabelText('Lab Name');
      await userEvent.type(labName, ', Ward 2');
      expect(labName).toHaveValue('Analysed Lab, Ward 2');

      await back();
      expect(screen.getByText('Processing complete')).toBeInTheDocument();
      expect(screen.getByRole('alert', { name: 'Analysis Complete' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /^Review Results/ }));

      expect(await screen.findByLabelText('Lab Name')).toHaveValue('Analysed Lab, Ward 2');
      expect(analyzeLabReport).toHaveBeenCalledTimes(1);
    });

    it('keeps the files chosen, analysing only an added one', async () => {
      vi.mocked(analyzeLabReport).mockResolvedValue(analysed);
      render(
        <TestWrapper>
          <ImportWizard {...defaultProps} />
        </TestWrapper>
      );
      await analyse(['first.pdf']);

      await back();
      expect(screen.getByText('first.pdf')).toBeInTheDocument();
      await analyse(['second.pdf']);

      expect(vi.mocked(analyzeLabReport).mock.calls.map(([file]) => file.name)).toEqual(['first.pdf', 'second.pdf']);
      expect(screen.getByRole('alert', { name: 'Analysis Complete' })).toHaveTextContent('from 2 file(s)');
    });
  });
});
