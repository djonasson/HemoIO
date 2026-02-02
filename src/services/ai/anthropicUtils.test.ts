/**
 * Anthropic Utility Functions Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAnthropicModels,
  getDefaultAnthropicModels,
  testAnthropicApiKey,
  clearAnthropicModelsCache,
} from './anthropicUtils';

describe('anthropicUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    clearAnthropicModelsCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('getAnthropicModels', () => {
    it('should return empty array if no API key provided', async () => {
      const result = await getAnthropicModels('');
      expect(result).toEqual([]);
    });

    it('should fetch models from Anthropic API', async () => {
      const mockModels = {
        data: [
          { id: 'claude-sonnet-4-20250514', type: 'model', display_name: 'Claude Sonnet 4', created_at: '2025-05-14' },
          { id: 'claude-3-5-sonnet-20241022', type: 'model', display_name: 'Claude 3.5 Sonnet', created_at: '2024-10-22' },
        ],
        has_more: false,
        first_id: null,
        last_id: null,
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockModels),
      } as Response);

      const result = await getAnthropicModels('test-api-key');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
          },
        })
      );

      expect(result).toHaveLength(2);
      // Models are sorted alphabetically
      expect(result[0].value).toBe('claude-3-5-sonnet-20241022');
      expect(result[1].value).toBe('claude-sonnet-4-20250514');
    });

    it('should return empty array when API call fails', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
      } as Response);

      const result = await getAnthropicModels('invalid-key');

      expect(result).toEqual([]);
    });

    it('should return empty array on network error', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      const result = await getAnthropicModels('test-api-key');

      expect(result).toEqual([]);
    });

    it('should filter out non-claude models', async () => {
      const mockModels = {
        data: [
          { id: 'claude-sonnet-4-20250514', type: 'model', display_name: 'Claude Sonnet 4', created_at: '2025-05-14' },
          { id: 'some-other-model', type: 'model', display_name: 'Other Model', created_at: '2024-01-01' },
        ],
        has_more: false,
        first_id: null,
        last_id: null,
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockModels),
      } as Response);

      const result = await getAnthropicModels('test-api-key');

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('claude-sonnet-4-20250514');
    });

    it('should return models sorted alphabetically', async () => {
      const mockModels = {
        data: [
          { id: 'claude-3-opus-20240229', type: 'model', display_name: 'Claude 3 Opus', created_at: '2024-02-29' },
          { id: 'claude-sonnet-4-20250514', type: 'model', display_name: 'Claude Sonnet 4', created_at: '2025-05-14' },
          { id: 'claude-3-5-haiku-20241022', type: 'model', display_name: 'Claude 3.5 Haiku', created_at: '2024-10-22' },
        ],
        has_more: false,
        first_id: null,
        last_id: null,
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockModels),
      } as Response);

      const result = await getAnthropicModels('test-api-key');

      // Models sorted alphabetically
      expect(result[0].value).toBe('claude-3-5-haiku-20241022');
      expect(result[1].value).toBe('claude-3-opus-20240229');
      expect(result[2].value).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('getDefaultAnthropicModels', () => {
    it('should return empty array (deprecated function)', () => {
      const models = getDefaultAnthropicModels();
      expect(models).toEqual([]);
    });
  });

  describe('testAnthropicApiKey', () => {
    it('should return false if no API key provided', async () => {
      const result = await testAnthropicApiKey('');
      expect(result).toBe(false);
    });

    it('should return true if API call succeeds', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
      } as Response);

      const result = await testAnthropicApiKey('valid-api-key');

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'valid-api-key',
          }),
        })
      );
    });

    it('should return false if API call fails', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
      } as Response);

      const result = await testAnthropicApiKey('invalid-api-key');

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      const result = await testAnthropicApiKey('test-api-key');

      expect(result).toBe(false);
    });
  });
});
