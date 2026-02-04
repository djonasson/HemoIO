/**
 * Tests for useAISettings hook
 *
 * Tests settings persistence in IndexedDB and migration from localStorage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAISettings } from './useAISettings';

// Mock db functions
const mockGetSettings = vi.fn();
const mockSaveSettings = vi.fn();

// Mock useEncryptedDb hook
vi.mock('./useEncryptedDb', () => ({
  useEncryptedDb: () => ({
    db: {
      getSettings: mockGetSettings,
      saveSettings: mockSaveSettings,
    },
    isReady: true,
  }),
}));

describe('useAISettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetSettings.mockResolvedValue(null);
    mockSaveSettings.mockResolvedValue(1);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initial loading', () => {
    it('should return default values when no settings exist', async () => {
      mockGetSettings.mockResolvedValue(null);

      const { result } = renderHook(() => useAISettings());

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

      const { result } = renderHook(() => useAISettings());

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
    it('should call saveSettings with migrated values when localStorage has settings', async () => {
      localStorage.setItem('hemoio_ai_provider', 'ollama');
      localStorage.setItem('hemoio_ollama_model', 'llama3');
      mockGetSettings.mockResolvedValue(null);

      renderHook(() => useAISettings());

      // Should eventually call saveSettings with the migrated values
      await waitFor(
        () => {
          expect(mockSaveSettings).toHaveBeenCalledWith(
            expect.objectContaining({
              aiProvider: 'ollama',
              ollamaModel: 'llama3',
            })
          );
        },
        { timeout: 2000 }
      );
    });

    it('should prefer IndexedDB values over localStorage during migration', async () => {
      localStorage.setItem('hemoio_ai_provider', 'ollama');
      localStorage.setItem('hemoio_openai_model', 'gpt-3.5');
      mockGetSettings.mockResolvedValue({
        aiProvider: 'anthropic',
        openaiModel: 'gpt-4',
        storageProvider: 'local',
        language: 'en',
      });

      const { result } = renderHook(() => useAISettings());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should use IndexedDB values (not localStorage)
      expect(result.current.aiProvider).toBe('anthropic');
      expect(result.current.openaiModel).toBe('gpt-4');
    });

    it('should not call saveSettings if no localStorage values exist', async () => {
      mockGetSettings.mockResolvedValue({
        aiProvider: 'openai',
        storageProvider: 'local',
        language: 'en',
      });

      const { result } = renderHook(() => useAISettings());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should NOT have called saveSettings since no migration needed
      expect(mockSaveSettings).not.toHaveBeenCalled();
    });
  });

  describe('saving settings', () => {
    it('should update local state when setting AI provider', async () => {
      mockGetSettings.mockResolvedValue({
        storageProvider: 'local',
        aiProvider: 'openai',
        language: 'en',
      });

      const { result } = renderHook(() => useAISettings());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setAiProvider('anthropic');
      });

      expect(result.current.aiProvider).toBe('anthropic');
    });

    it('should preserve existing settings when saving one setting', async () => {
      mockGetSettings.mockResolvedValue({
        storageProvider: 'filesystem',
        aiProvider: 'openai',
        ollamaModel: 'llama2',
        openaiModel: 'gpt-4',
        anthropicModel: 'claude-3',
        language: 'es',
      });

      const { result } = renderHook(() => useAISettings());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockSaveSettings.mockClear();

      await act(async () => {
        await result.current.setAiProvider('anthropic');
      });

      // Should preserve all existing settings
      await waitFor(() => {
        expect(mockSaveSettings).toHaveBeenCalledWith({
          storageProvider: 'filesystem',
          aiProvider: 'anthropic',
          ollamaModel: 'llama2',
          openaiModel: 'gpt-4',
          anthropicModel: 'claude-3',
          language: 'es',
        });
      });
    });
  });

  describe('error handling', () => {
    it('should handle getSettings errors gracefully', async () => {
      mockGetSettings.mockRejectedValue(new Error('Database error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useAISettings());

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

      const { result } = renderHook(() => useAISettings());

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
});
