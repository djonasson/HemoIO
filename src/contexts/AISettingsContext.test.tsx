/**
 * Tests for AISettingsProvider and useAISettings
 *
 * Tests settings persistence in IndexedDB and migration from localStorage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAISettings } from '@hooks/useAISettings';
import { SaveError } from '@data/db/saveError';
import { AISettingsProvider } from './AISettingsContext';

// Mock db functions
const mockGetSettings = vi.fn();
const mockUpdateSettings = vi.fn();

// Mock useEncryptedDb hook. The db object must be stable across renders, as
// the real hook memoizes it; otherwise the load effect re-runs on every render.
const mockDb = {
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
  updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
};
vi.mock('@hooks/useEncryptedDb', () => ({
  useEncryptedDb: () => ({
    db: mockDb,
    isReady: true,
  }),
}));

describe('useAISettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetSettings.mockResolvedValue(null);
    mockUpdateSettings.mockResolvedValue(undefined);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initial loading', () => {
    it('should return default values when no settings exist', async () => {
      mockGetSettings.mockResolvedValue(null);

      const { result } = renderHook(() => useAISettings(), { wrapper: AISettingsProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.aiProvider).toBe('openai');
      expect(result.current.ollamaModel).toBeUndefined();
      expect(result.current.openaiModel).toBeUndefined();
      expect(result.current.anthropicModel).toBeUndefined();
    });

    it('should load settings from IndexedDB', async () => {
      mockGetSettings.mockResolvedValue({
        aiProvider: 'anthropic',
        ollamaModel: 'llama2',
        openaiModel: 'gpt-4',
        anthropicModel: 'claude-3-opus',
        storageProvider: 'local',
        language: 'en',
      });

      const { result } = renderHook(() => useAISettings(), { wrapper: AISettingsProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.aiProvider).toBe('anthropic');
      expect(result.current.ollamaModel).toBe('llama2');
      expect(result.current.openaiModel).toBe('gpt-4');
      expect(result.current.anthropicModel).toBe('claude-3-opus');
    });
  });

  describe('localStorage migration', () => {
    it('should save migrated values when localStorage has settings', async () => {
      localStorage.setItem('hemoio_ai_provider', 'ollama');
      localStorage.setItem('hemoio_ollama_model', 'llama3');
      mockGetSettings.mockResolvedValue(null);

      renderHook(() => useAISettings(), { wrapper: AISettingsProvider });

      await waitFor(
        () => {
          expect(mockUpdateSettings).toHaveBeenCalledWith(
            expect.objectContaining({
              aiProvider: 'ollama',
              ollamaModel: 'llama3',
            })
          );
        },
        { timeout: 2000 }
      );
    });

    it("the setup wizard's choices win over a settings row an earlier setup left", async () => {
      localStorage.setItem('hemoio_ai_provider', 'ollama');
      localStorage.setItem('hemoio_openai_model', 'gpt-3.5');
      mockGetSettings.mockResolvedValue({
        aiProvider: 'anthropic',
        openaiModel: 'gpt-4',
        storageProvider: 'local',
        language: 'en',
      });

      const { result } = renderHook(() => useAISettings(), { wrapper: AISettingsProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Only the wizard writes these keys: what it chose is used, and stored
      expect(result.current.aiProvider).toBe('ollama');
      expect(result.current.openaiModel).toBe('gpt-3.5');
      expect(mockUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ aiProvider: 'ollama', openaiModel: 'gpt-3.5' })
      );
      expect(localStorage.getItem('hemoio_ai_provider')).toBeNull();
    });

    it('should not save anything if no localStorage values exist', async () => {
      mockGetSettings.mockResolvedValue({
        aiProvider: 'openai',
        storageProvider: 'local',
        language: 'en',
      });

      const { result } = renderHook(() => useAISettings(), { wrapper: AISettingsProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });
  });

  describe('saving settings', () => {
    it('should update local state when setting AI provider', async () => {
      mockGetSettings.mockResolvedValue({
        storageProvider: 'local',
        aiProvider: 'openai',
        language: 'en',
      });

      const { result } = renderHook(() => useAISettings(), { wrapper: AISettingsProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setAiProvider('anthropic');
      });

      expect(result.current.aiProvider).toBe('anthropic');
    });

    it('should save only the setting that changed', async () => {
      mockGetSettings.mockResolvedValue({
        storageProvider: 'filesystem',
        aiProvider: 'openai',
        ollamaModel: 'llama2',
        openaiModel: 'gpt-4',
        anthropicModel: 'claude-3',
        language: 'es',
      });

      const { result } = renderHook(() => useAISettings(), { wrapper: AISettingsProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockUpdateSettings.mockClear();

      await act(async () => {
        await result.current.setAiProvider('anthropic');
      });

      // The database keeps every other field
      expect(mockUpdateSettings).toHaveBeenCalledTimes(1);
      expect(mockUpdateSettings).toHaveBeenCalledWith({ aiProvider: 'anthropic' });
    });
  });

  describe('error handling', () => {
    it('puts a setting back when it is not saved, and passes the failure on', async () => {
      mockGetSettings.mockResolvedValue({
        storageProvider: 'local',
        aiProvider: 'openai',
        openaiModel: 'gpt-4',
        language: 'en',
      });
      const failure = new SaveError('quota');
      mockUpdateSettings.mockRejectedValue(failure);
      const { result } = renderHook(() => useAISettings(), { wrapper: AISettingsProvider });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await expect(result.current.setAiProvider('anthropic')).rejects.toBe(failure);
        await expect(result.current.setOpenaiModel('gpt-5')).rejects.toBe(failure);
      });

      expect(result.current.aiProvider).toBe('openai');
      expect(result.current.openaiModel).toBe('gpt-4');
    });

    it('keeps a newer change when an older one fails', async () => {
      let failOlder: (err: unknown) => void = () => {};
      mockUpdateSettings
        .mockImplementationOnce(() => new Promise((_, reject) => (failOlder = reject)))
        .mockResolvedValueOnce(undefined);
      const { result } = renderHook(() => useAISettings(), { wrapper: AISettingsProvider });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let older: Promise<void> = Promise.resolve();
      await act(async () => {
        older = result.current.setOllamaModel('llama2');
        await result.current.setOllamaModel('llava');
      });
      await act(async () => {
        failOlder(new SaveError('failed'));
        await older.catch(() => {});
      });

      expect(result.current.ollamaModel).toBe('llava');
    });

    it('goes back to the stored setting when overlapping changes all fail', async () => {
      const fails: Array<(err: unknown) => void> = [];
      mockUpdateSettings.mockImplementation(() => new Promise((_, reject) => fails.push(reject)));
      const { result } = renderHook(() => useAISettings(), { wrapper: AISettingsProvider });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.aiProvider).toBe('openai');

      const saves: Promise<void>[] = [];
      act(() => {
        saves.push(result.current.setAiProvider('anthropic'));
        saves.push(result.current.setAiProvider('ollama'));
      });
      await act(async () => {
        for (const fail of fails) fail(new SaveError('timeout'));
        await Promise.allSettled(saves);
      });

      expect(result.current.aiProvider).toBe('openai');
    });

    it('should handle getSettings errors gracefully', async () => {
      mockGetSettings.mockRejectedValue(new Error('Database error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useAISettings(), { wrapper: AISettingsProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should fall back to defaults
      expect(result.current.aiProvider).toBe('openai');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('settings stored in IndexedDB for backup', () => {
    it('should not use localStorage for storing settings', async () => {
      mockGetSettings.mockResolvedValue({
        storageProvider: 'local',
        aiProvider: 'openai',
        language: 'en',
      });

      const { result } = renderHook(() => useAISettings(), { wrapper: AISettingsProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setAiProvider('anthropic');
        result.current.setOllamaModel('llama3');
        result.current.setOpenaiModel('gpt-4');
        result.current.setAnthropicModel('claude-3');
      });

      // Verify nothing went to localStorage (settings should be in IndexedDB)
      expect(localStorage.getItem('hemoio_ai_provider')).toBeNull();
      expect(localStorage.getItem('hemoio_ollama_model')).toBeNull();
      expect(localStorage.getItem('hemoio_openai_model')).toBeNull();
      expect(localStorage.getItem('hemoio_anthropic_model')).toBeNull();
    });
  });

  describe('shared state', () => {
    it('should expose a model change made by one consumer to every other consumer', async () => {
      // The import view stays mounted while the user changes the model in
      // Settings, so both must read the same state without a reload.
      const { result } = renderHook(
        () => ({ settings: useAISettings(), importView: useAISettings() }),
        { wrapper: AISettingsProvider }
      );

      await waitFor(() => {
        expect(result.current.importView.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.settings.setAiProvider('anthropic');
        await result.current.settings.setAnthropicModel('claude-sonnet-5-5');
      });

      expect(result.current.importView.aiProvider).toBe('anthropic');
      expect(result.current.importView.anthropicModel).toBe('claude-sonnet-5-5');
    });

    it('should throw a helpful error when used outside the provider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => renderHook(() => useAISettings())).toThrow(
        'useAISettings must be used within an AISettingsProvider'
      );
      consoleError.mockRestore();
    });
  });
});
