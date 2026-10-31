/**
 * Tests for AISettings component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { getOllamaModelNames, getOpenAIModels, isOllamaRunning } from '@/services/ai';
import { AISettings } from './AISettings';

vi.mock('@/services/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/ai')>()),
  isOllamaRunning: vi.fn().mockResolvedValue(false),
  getOllamaModelNames: vi.fn().mockResolvedValue([]),
  getOpenAIModels: vi.fn().mockResolvedValue([]),
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider env="test">{ui}</MantineProvider>);
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

    it('confirms the key only once it is saved', async () => {
      let saved!: () => void;
      const onApiKeyChange = vi.fn(() => new Promise<void>((resolve) => (saved = resolve)));
      const user = userEvent.setup();
      renderWithProviders(
        <AISettings {...defaultProps} hasApiKey={false} onApiKeyChange={onApiKeyChange} />
      );

      await user.type(screen.getByPlaceholderText(/enter your.*api key/i), 'sk-test-key');
      await user.click(screen.getByRole('button', { name: /save api key/i }));
      expect(screen.queryByText('Settings saved')).not.toBeInTheDocument();

      saved();
      expect(await screen.findByText('Settings saved')).toBeInTheDocument();
    });

    it('keeps the typed key, unconfirmed, when it is not saved', async () => {
      const onApiKeyChange = vi.fn().mockRejectedValue(new Error('refused'));
      const user = userEvent.setup();
      renderWithProviders(
        <AISettings {...defaultProps} hasApiKey={false} onApiKeyChange={onApiKeyChange} />
      );

      await user.type(screen.getByPlaceholderText(/enter your.*api key/i), 'sk-test-key');
      await user.click(screen.getByRole('button', { name: /save api key/i }));

      await waitFor(() => expect(onApiKeyChange).toHaveBeenCalled());
      expect(screen.getByPlaceholderText(/enter your.*api key/i)).toHaveValue('sk-test-key');
      expect(screen.queryByText('Settings saved')).not.toBeInTheDocument();
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

  describe('a change that is not saved', () => {
    it('goes back to the previous provider and does not say it was saved', async () => {
      const user = userEvent.setup();
      const onProviderChange = vi.fn().mockRejectedValue(new Error('not saved'));
      renderWithProviders(<AISettings {...defaultProps} onProviderChange={onProviderChange} />);

      await user.click(screen.getByRole('textbox', { name: /select ai provider/i }));
      await user.click(await screen.findByRole('option', { name: /Anthropic/ }));

      expect(onProviderChange).toHaveBeenCalledWith('anthropic');
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: /select ai provider/i })).toHaveValue(
          'OpenAI (GPT-5)'
        )
      );
      expect(screen.queryByText('Settings saved')).not.toBeInTheDocument();
    });

    it('shows no Ollama model when the one picked for the user is not saved', async () => {
      vi.mocked(isOllamaRunning).mockResolvedValue(true);
      vi.mocked(getOllamaModelNames).mockResolvedValue(['llama3']);
      const onOllamaModelChange = vi.fn().mockRejectedValue(new Error('not saved'));
      renderWithProviders(
        <AISettings {...defaultProps} provider="ollama" onOllamaModelChange={onOllamaModelChange} />
      );

      await waitFor(() => expect(onOllamaModelChange).toHaveBeenCalledWith('llama3'));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Select Ollama model' })).toHaveValue('')
      );
    });

    it('shows no OpenAI model when the first one picked is not saved', async () => {
      vi.mocked(getOpenAIModels).mockResolvedValue([{ value: 'gpt-5', label: 'GPT-5' }]);
      const onOpenaiModelChange = vi.fn().mockRejectedValue(new Error('not saved'));
      const user = userEvent.setup();
      renderWithProviders(
        <AISettings
          {...defaultProps}
          hasApiKey
          getApiKey={vi.fn().mockResolvedValue('sk-test')}
          onOpenaiModelChange={onOpenaiModelChange}
        />
      );
      const select = await screen.findByRole('textbox', { name: 'Select OpenAI model' });

      await user.click(select);
      await user.click(await screen.findByRole('option', { name: 'GPT-5' }));

      await waitFor(() => expect(onOpenaiModelChange).toHaveBeenCalledWith('gpt-5'));
      await waitFor(() => expect(select).toHaveValue(''));
    });

    it('shows what it is given after a failed save, not what it showed before', async () => {
      const user = userEvent.setup();
      let fail!: (err: unknown) => void;
      const onProviderChange = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)));
      const { rerender } = renderWithProviders(
        <AISettings {...defaultProps} onProviderChange={onProviderChange} />
      );

      await user.click(screen.getByRole('textbox', { name: /select ai provider/i }));
      await user.click(await screen.findByRole('option', { name: /Anthropic/ }));
      // The owner holds a newer value by the time this save fails
      rerender(
        <MantineProvider env="test">
          <AISettings {...defaultProps} provider="ollama" onProviderChange={onProviderChange} />
        </MantineProvider>
      );
      fail(new Error('not saved'));

      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: /select ai provider/i })).toHaveValue(
          'Ollama (Local)'
        )
      );
    });

    it('says it was saved once it is', async () => {
      const user = userEvent.setup();
      const onProviderChange = vi.fn().mockResolvedValue(undefined);
      renderWithProviders(<AISettings {...defaultProps} onProviderChange={onProviderChange} />);

      await user.click(screen.getByRole('textbox', { name: /select ai provider/i }));
      await user.click(await screen.findByRole('option', { name: /Anthropic/ }));

      expect(await screen.findByText('Settings saved')).toBeInTheDocument();
    });
  });
});
