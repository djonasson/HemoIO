import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAIProvider,
  clearProviderCache,
  getAvailableProviders,
  validateApiKeyFormat,
  testProviderConnection,
  providerRequiresApiKey,
} from './AIProviderFactory';
import { OpenAIProvider } from './OpenAIProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { OllamaProvider } from './OllamaProvider';

describe('AIProviderFactory', () => {
  beforeEach(() => {
    clearProviderCache();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getAIProvider', () => {
    it('creates OpenAI provider', () => {
      const provider = getAIProvider('openai', { apiKey: 'sk-test-key' });

      expect(provider).toBeInstanceOf(OpenAIProvider);
      expect(provider.type).toBe('openai');
      expect(provider.name).toBe('OpenAI');
    });

    it('creates Anthropic provider', () => {
      const provider = getAIProvider('anthropic', { apiKey: 'sk-ant-test-key' });

      expect(provider).toBeInstanceOf(AnthropicProvider);
      expect(provider.type).toBe('anthropic');
      expect(provider.name).toBe('Anthropic Claude');
    });

    it('creates Ollama provider', () => {
      const provider = getAIProvider('ollama', {});

      expect(provider).toBeInstanceOf(OllamaProvider);
      expect(provider.type).toBe('ollama');
      expect(provider.name).toBe('Ollama (Local)');
    });

    it('caches provider instances', () => {
      const provider1 = getAIProvider('openai', { apiKey: 'sk-test-key' });
      const provider2 = getAIProvider('openai', { apiKey: 'sk-test-key' });

      expect(provider1).toBe(provider2);
    });

    it('creates separate instances for different API keys', () => {
      const provider1 = getAIProvider('openai', { apiKey: 'sk-test-key-1' });
      const provider2 = getAIProvider('openai', { apiKey: 'sk-test-key-2' });

      expect(provider1).not.toBe(provider2);
    });

    it('creates separate instances for different models', () => {
      const provider1 = getAIProvider('openai', {
        apiKey: 'sk-test-key',
        model: 'gpt-4',
      });
      const provider2 = getAIProvider('openai', {
        apiKey: 'sk-test-key',
        model: 'gpt-3.5-turbo',
      });

      expect(provider1).not.toBe(provider2);
    });

    it('throws error for unknown provider type', () => {
      expect(() =>
        getAIProvider('unknown' as 'openai', { apiKey: 'test' })
      ).toThrow('Unknown AI provider type');
    });
  });

  describe('clearProviderCache', () => {
    it('clears cached providers', () => {
      const provider1 = getAIProvider('openai', { apiKey: 'sk-test-key' });
      clearProviderCache();
      const provider2 = getAIProvider('openai', { apiKey: 'sk-test-key' });

      expect(provider1).not.toBe(provider2);
    });
  });

  describe('getAvailableProviders', () => {
    it('returns provider information', () => {
      const providers = getAvailableProviders();

      expect(providers).toHaveLength(3);
      expect(providers.map((p) => p.type)).toContain('openai');
      expect(providers.map((p) => p.type)).toContain('anthropic');
      expect(providers.map((p) => p.type)).toContain('ollama');
    });

    it('includes models for each provider', () => {
      const providers = getAvailableProviders();

      providers.forEach((provider) => {
        expect(provider.models.length).toBeGreaterThan(0);
        expect(provider.defaultModel).toBeTruthy();
      });
    });

    it('includes descriptions', () => {
      const providers = getAvailableProviders();

      providers.forEach((provider) => {
        expect(provider.description).toBeTruthy();
      });
    });

    it('indicates which providers require API keys', () => {
      const providers = getAvailableProviders();

      const openai = providers.find((p) => p.type === 'openai');
      const anthropic = providers.find((p) => p.type === 'anthropic');
      const ollama = providers.find((p) => p.type === 'ollama');

      expect(openai?.requiresApiKey).toBe(true);
      expect(anthropic?.requiresApiKey).toBe(true);
      expect(ollama?.requiresApiKey).toBe(false);
    });

    it('indicates which providers are local', () => {
      const providers = getAvailableProviders();

      const openai = providers.find((p) => p.type === 'openai');
      const anthropic = providers.find((p) => p.type === 'anthropic');
      const ollama = providers.find((p) => p.type === 'ollama');

      expect(openai?.isLocal).toBe(false);
      expect(anthropic?.isLocal).toBe(false);
      expect(ollama?.isLocal).toBe(true);
    });
  });

  describe('validateApiKeyFormat', () => {
    describe('OpenAI keys', () => {
      it('accepts valid OpenAI key format', () => {
        expect(validateApiKeyFormat('openai', 'sk-1234567890abcdefghij')).toBe(
          true
        );
      });

      it('rejects keys not starting with sk-', () => {
        expect(validateApiKeyFormat('openai', 'key-1234567890abcdef')).toBe(
          false
        );
      });

      it('rejects short keys', () => {
        expect(validateApiKeyFormat('openai', 'sk-short')).toBe(false);
      });
    });

    describe('Anthropic keys', () => {
      it('accepts valid Anthropic key format', () => {
        expect(
          validateApiKeyFormat('anthropic', 'sk-ant-1234567890abcdefghij')
        ).toBe(true);
      });

      it('rejects keys not starting with sk-ant-', () => {
        expect(
          validateApiKeyFormat('anthropic', 'sk-1234567890abcdefghij')
        ).toBe(false);
      });

      it('rejects short keys', () => {
        expect(validateApiKeyFormat('anthropic', 'sk-ant-short')).toBe(false);
      });
    });

    it('rejects empty keys', () => {
      expect(validateApiKeyFormat('openai', '')).toBe(false);
      expect(validateApiKeyFormat('anthropic', '')).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(validateApiKeyFormat('openai', null as unknown as string)).toBe(
        false
      );
      expect(validateApiKeyFormat('openai', undefined as unknown as string)).toBe(
        false
      );
    });

    describe('Ollama (no API key required)', () => {
      it('always returns true for Ollama', () => {
        expect(validateApiKeyFormat('ollama', '')).toBe(true);
        expect(validateApiKeyFormat('ollama', 'anything')).toBe(true);
      });
    });
  });

  describe('providerRequiresApiKey', () => {
    it('returns true for OpenAI', () => {
      expect(providerRequiresApiKey('openai')).toBe(true);
    });

    it('returns true for Anthropic', () => {
      expect(providerRequiresApiKey('anthropic')).toBe(true);
    });

    it('returns false for Ollama', () => {
      expect(providerRequiresApiKey('ollama')).toBe(false);
    });
  });

  describe('testProviderConnection', () => {
    it('returns true on successful connection', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'OK' } }],
          }),
      } as Response);

      const result = await testProviderConnection('openai', {
        apiKey: 'sk-test-key',
      });

      expect(result).toBe(true);
    });

    it('returns false on connection failure', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const result = await testProviderConnection('openai', {
        apiKey: 'sk-test-key',
      });

      expect(result).toBe(false);
    });

    it('returns false on API error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: { message: 'Invalid API key' },
          }),
      } as Response);

      const result = await testProviderConnection('openai', {
        apiKey: 'sk-invalid-key',
      });

      expect(result).toBe(false);
    });
  });
});
