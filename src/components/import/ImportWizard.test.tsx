import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  extractTextFromPDF: vi.fn(),
  recognizeImage: vi.fn(),
}));

vi.mock('../../services/analysis', () => ({
  analyzeLabReport: vi.fn(),
}));

import { ImportWizard } from './ImportWizard';

// Wrapper with Mantine provider
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe('ImportWizard', () => {
  const defaultProps = {
    onComplete: vi.fn(),
    onCancel: vi.fn(),
    aiProvider: 'openai' as const,
    aiApiKey: 'sk-test-key',
  };

  it('renders the wizard title', () => {
    render(
      <TestWrapper>
        <ImportWizard {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByText('Import Lab Results')).toBeInTheDocument();
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
});
