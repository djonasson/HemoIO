import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { UploadStep } from './UploadStep';

// Mock the OCR service
vi.mock('../../services/ocr', () => ({
  isSupportedDocument: vi.fn().mockReturnValue(true),
  getAcceptString: vi.fn().mockReturnValue('application/pdf,image/jpeg,image/png'),
  SUPPORTED_MIME_TYPES: {
    pdf: 'application/pdf',
    jpeg: 'image/jpeg',
    png: 'image/png',
  },
}));

// Wrapper with Mantine provider
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe('UploadStep', () => {
  const defaultProps = {
    onComplete: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dropzone with instructions', () => {
    render(
      <TestWrapper>
        <UploadStep {...defaultProps} />
      </TestWrapper>
    );

    expect(
      screen.getByText(/Drag files here or click to select/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Supported formats: PDF, JPEG, PNG, WebP, GIF/i)
    ).toBeInTheDocument();
  });

  it('shows cancel button when onCancel is provided', () => {
    render(
      <TestWrapper>
        <UploadStep {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('analyze button is disabled when no files selected', () => {
    render(
      <TestWrapper>
        <UploadStep {...defaultProps} />
      </TestWrapper>
    );

    const analyzeButton = screen.getByRole('button', { name: /Analyze/i });
    expect(analyzeButton).toBeDisabled();
  });

  it('calls onCancel when cancel button clicked', () => {
    render(
      <TestWrapper>
        <UploadStep {...defaultProps} />
      </TestWrapper>
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('does not show cancel button when onCancel not provided', () => {
    render(
      <TestWrapper>
        <UploadStep onComplete={defaultProps.onComplete} />
      </TestWrapper>
    );

    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });

  it('shows maximum file size information', () => {
    render(
      <TestWrapper>
        <UploadStep {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByText(/Maximum file size: 50MB/i)).toBeInTheDocument();
  });
});
