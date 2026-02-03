import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AIConfigStep } from './AIConfigStep';
import type { AIProviderType } from '@/types';

// Mock the AI services
vi.mock('@/services/ai', () => ({
  isOllamaRunning: vi.fn(),
  getOllamaModelNames: vi.fn(),
}));

import { isOllamaRunning, getOllamaModelNames } from '@/services/ai';

const mockedIsOllamaRunning = vi.mocked(isOllamaRunning);
const mockedGetOllamaModelNames = vi.mocked(getOllamaModelNames);

interface AIConfigStepTestProps {
  aiProvider?: AIProviderType | null;
  apiKey?: string;
  ollamaModel?: string;
  onProviderChange?: (provider: AIProviderType | null) => void;
  onApiKeyChange?: (apiKey: string) => void;
  onOllamaModelChange?: (model: string) => void;
}

function renderAIConfigStep(props: AIConfigStepTestProps = {}) {
  const defaultProps = {
    aiProvider: null,
    apiKey: '',
    ollamaModel: undefined,
    onProviderChange: vi.fn(),
    onApiKeyChange: vi.fn(),
    onOllamaModelChange: vi.fn(),
    ...props,
  };

  return render(
    <MantineProvider>
      <AIConfigStep {...defaultProps} />
    </MantineProvider>
  );
}

describe('AIConfigStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsOllamaRunning.mockResolvedValue(false);
    mockedGetOllamaModelNames.mockResolvedValue([]);
  });

  describe('Rendering', () => {
    it('renders introduction text', () => {
      renderAIConfigStep();

      expect(screen.getByText(/HemoIO uses AI to automatically extract values/)).toBeInTheDocument();
    });

    it('renders API key security alert', () => {
      renderAIConfigStep();

      expect(screen.getByText('API Key Security')).toBeInTheDocument();
      expect(screen.getByText(/Your API key will be encrypted/)).toBeInTheDocument();
    });

    it('renders AI provider select', () => {
      renderAIConfigStep();

      expect(screen.getByText('AI Provider')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Select an AI provider')).toBeInTheDocument();
    });

    it('renders skip message', () => {
      renderAIConfigStep();

      expect(screen.getByText(/Without an AI provider configured/)).toBeInTheDocument();
    });
  });

  describe('Provider selection', () => {
    it('shows API key input when OpenAI is selected', () => {
      renderAIConfigStep({ aiProvider: 'openai' });

      expect(screen.getByText('API Key')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument();
    });

    it('shows OpenAI docs link when OpenAI is selected', () => {
      renderAIConfigStep({ aiProvider: 'openai' });

      expect(screen.getByText('OpenAI Console')).toBeInTheDocument();
      expect(screen.getByText('OpenAI Console')).toHaveAttribute('href', 'https://platform.openai.com/api-keys');
    });

    it('shows API key input when Anthropic is selected', () => {
      renderAIConfigStep({ aiProvider: 'anthropic' });

      expect(screen.getByText('API Key')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
    });

    it('shows Anthropic docs link when Anthropic is selected', () => {
      renderAIConfigStep({ aiProvider: 'anthropic' });

      expect(screen.getByText('Anthropic Console')).toBeInTheDocument();
      expect(screen.getByText('Anthropic Console')).toHaveAttribute('href', 'https://console.anthropic.com/settings/keys');
    });

    it('does not show API key input when no provider is selected', () => {
      renderAIConfigStep({ aiProvider: null });

      expect(screen.queryByText('API Key')).not.toBeInTheDocument();
    });

    it('calls onProviderChange when provider is selected', () => {
      const onProviderChange = vi.fn();
      renderAIConfigStep({ onProviderChange });

      const select = screen.getByPlaceholderText('Select an AI provider');
      fireEvent.click(select);
      fireEvent.click(screen.getByText('OpenAI (GPT-5)'));

      expect(onProviderChange).toHaveBeenCalledWith('openai');
    });

    it('calls onApiKeyChange when API key is entered', () => {
      const onApiKeyChange = vi.fn();
      renderAIConfigStep({ aiProvider: 'openai', onApiKeyChange });

      const apiKeyInput = screen.getByPlaceholderText('sk-...');
      fireEvent.change(apiKeyInput, { target: { value: 'sk-test-key' } });

      expect(onApiKeyChange).toHaveBeenCalledWith('sk-test-key');
    });
  });

  describe('Ollama provider', () => {
    it('shows no API key required message when Ollama is selected', () => {
      renderAIConfigStep({ aiProvider: 'ollama' });

      expect(screen.getByText(/No API key required/)).toBeInTheDocument();
    });

    it('shows checking status initially', () => {
      mockedIsOllamaRunning.mockImplementation(() => new Promise(() => {})); // Never resolves
      renderAIConfigStep({ aiProvider: 'ollama' });

      expect(screen.getByText(/Checking Ollama connection/)).toBeInTheDocument();
    });

    it('shows connected status when Ollama is running', async () => {
      mockedIsOllamaRunning.mockResolvedValue(true);
      mockedGetOllamaModelNames.mockResolvedValue(['llama3.3', 'mistral']);
      renderAIConfigStep({ aiProvider: 'ollama' });

      await waitFor(() => {
        expect(screen.getByText('Ollama connected')).toBeInTheDocument();
      });
      expect(screen.getByText('2 models available')).toBeInTheDocument();
    });

    it('shows disconnected warning when Ollama is not running', async () => {
      mockedIsOllamaRunning.mockResolvedValue(false);
      renderAIConfigStep({ aiProvider: 'ollama' });

      await waitFor(() => {
        expect(screen.getByText('Ollama not detected')).toBeInTheDocument();
      });
      expect(screen.getByText(/Make sure Ollama is running/)).toBeInTheDocument();
    });

    it('shows model selection when Ollama is connected with models', async () => {
      mockedIsOllamaRunning.mockResolvedValue(true);
      mockedGetOllamaModelNames.mockResolvedValue(['llama3.3', 'mistral']);
      renderAIConfigStep({ aiProvider: 'ollama' });

      await waitFor(() => {
        expect(screen.getByText('Model')).toBeInTheDocument();
      });
    });

    it('auto-selects first model if none selected', async () => {
      const onOllamaModelChange = vi.fn();
      mockedIsOllamaRunning.mockResolvedValue(true);
      mockedGetOllamaModelNames.mockResolvedValue(['llama3.3', 'mistral']);
      renderAIConfigStep({ aiProvider: 'ollama', onOllamaModelChange });

      await waitFor(() => {
        expect(onOllamaModelChange).toHaveBeenCalledWith('llama3.3');
      });
    });

    it('does not check Ollama status when other provider selected', () => {
      renderAIConfigStep({ aiProvider: 'openai' });

      expect(mockedIsOllamaRunning).not.toHaveBeenCalled();
    });
  });

  describe('API key visibility', () => {
    it('password input has toggle visibility', () => {
      renderAIConfigStep({ aiProvider: 'openai' });

      const apiKeyInput = screen.getByPlaceholderText('sk-...');
      expect(apiKeyInput).toHaveAttribute('type', 'password');
    });
  });
});
