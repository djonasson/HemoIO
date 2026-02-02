/**
 * Tests for AISettings component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { AISettings } from './AISettings';

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('AISettings', () => {
  const defaultProps = {
    provider: 'openai' as const,
    hasApiKey: false,
    onProviderChange: vi.fn(),
    onApiKeyChange: vi.fn(),
    onTestConnection: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the AI configuration title', () => {
      renderWithProviders(<AISettings {...defaultProps} />);

      expect(screen.getByText('AI Configuration')).toBeInTheDocument();
    });

    it('should render provider selection', () => {
      renderWithProviders(<AISettings {...defaultProps} />);

      expect(screen.getByText('AI Provider')).toBeInTheDocument();
    });

    it('should render API key section', () => {
      renderWithProviders(<AISettings {...defaultProps} />);

      expect(screen.getByText('API Key')).toBeInTheDocument();
    });

    it('should render security notice', () => {
      renderWithProviders(<AISettings {...defaultProps} />);

      expect(screen.getByText(/stored securely on your device/)).toBeInTheDocument();
    });
  });

  describe('no API key configured', () => {
    it('should show API key input when no key is configured', () => {
      renderWithProviders(<AISettings {...defaultProps} hasApiKey={false} />);

      expect(screen.getByPlaceholderText(/enter your.*api key/i)).toBeInTheDocument();
    });

    it('should show save button', () => {
      renderWithProviders(<AISettings {...defaultProps} hasApiKey={false} />);

      expect(screen.getByRole('button', { name: /save api key/i })).toBeInTheDocument();
    });

    it('should disable save button when input is empty', () => {
      renderWithProviders(<AISettings {...defaultProps} hasApiKey={false} />);

      expect(screen.getByRole('button', { name: /save api key/i })).toBeDisabled();
    });
  });

  describe('API key configured', () => {
    it('should show configured badge when API key exists', () => {
      renderWithProviders(<AISettings {...defaultProps} hasApiKey={true} />);

      expect(screen.getByText('Configured')).toBeInTheDocument();
    });

    it('should show last 4 characters of API key', () => {
      renderWithProviders(
        <AISettings {...defaultProps} hasApiKey={true} apiKeyLastFour="abcd" />
      );

      expect(screen.getByText(/••••••••abcd/)).toBeInTheDocument();
    });

    it('should show update button', () => {
      renderWithProviders(<AISettings {...defaultProps} hasApiKey={true} />);

      expect(screen.getByRole('button', { name: /update api key/i })).toBeInTheDocument();
    });

    it('should show test connection button', () => {
      renderWithProviders(<AISettings {...defaultProps} hasApiKey={true} />);

      expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument();
    });
  });

  describe('updating API key', () => {
    it('should show input when update is clicked', async () => {
      const user = userEvent.setup();

      renderWithProviders(<AISettings {...defaultProps} hasApiKey={true} />);

      await user.click(screen.getByRole('button', { name: /update api key/i }));

      expect(screen.getByPlaceholderText(/enter your.*api key/i)).toBeInTheDocument();
    });

    it('should show cancel button when editing', async () => {
      const user = userEvent.setup();

      renderWithProviders(<AISettings {...defaultProps} hasApiKey={true} />);

      await user.click(screen.getByRole('button', { name: /update api key/i }));

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('should call onApiKeyChange when saving', async () => {
      const onApiKeyChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <AISettings {...defaultProps} hasApiKey={false} onApiKeyChange={onApiKeyChange} />
      );

      await user.type(screen.getByPlaceholderText(/enter your.*api key/i), 'sk-test-key');
      await user.click(screen.getByRole('button', { name: /save api key/i }));

      expect(onApiKeyChange).toHaveBeenCalledWith('sk-test-key');
    });
  });

  describe('test connection', () => {
    it('should call onTestConnection when test button is clicked', async () => {
      const onTestConnection = vi.fn().mockResolvedValue(true);
      const user = userEvent.setup();

      renderWithProviders(
        <AISettings {...defaultProps} hasApiKey={true} onTestConnection={onTestConnection} />
      );

      await user.click(screen.getByRole('button', { name: /test connection/i }));

      expect(onTestConnection).toHaveBeenCalled();
    });

    it('should show success message on successful test', async () => {
      const onTestConnection = vi.fn().mockResolvedValue(true);
      const user = userEvent.setup();

      renderWithProviders(
        <AISettings {...defaultProps} hasApiKey={true} onTestConnection={onTestConnection} />
      );

      await user.click(screen.getByRole('button', { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText(/connection successful/i)).toBeInTheDocument();
      });
    });

    it('should show error message on failed test', async () => {
      const onTestConnection = vi.fn().mockResolvedValue(false);
      const user = userEvent.setup();

      renderWithProviders(
        <AISettings {...defaultProps} hasApiKey={true} onTestConnection={onTestConnection} />
      );

      await user.click(screen.getByRole('button', { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText(/connection failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('saving state', () => {
    it('should disable controls when saving', () => {
      renderWithProviders(<AISettings {...defaultProps} isSaving={true} />);

      expect(screen.getByRole('button', { name: /save api key/i })).toBeDisabled();
    });
  });

  describe('accessibility', () => {
    it('should have accessible labels on controls', () => {
      renderWithProviders(<AISettings {...defaultProps} />);

      expect(screen.getByRole('textbox', { name: /select ai provider/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/api key/i)).toBeInTheDocument();
    });
  });
});
