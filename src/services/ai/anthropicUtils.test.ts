/**
 * Anthropic Utility Functions Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAnthropicModels,
  getDefaultAnthropicModels,
  testAnthropicApiKey,
} from './anthropicUtils';

describe('anthropicUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockModels),
      });
      global.fetch = fetchMock;

      const result = await getAnthropicModels('test-api-key');

      expect(fetchMock).toHaveBeenCalledWith(
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
      expect(result[0].value).toBe('claude-sonnet-4-20250514');
    });

    it('should return defaults when API call fails', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });
      global.fetch = fetchMock;

      const result = await getAnthropicModels('invalid-key');

      expect(result).toEqual(getDefaultAnthropicModels());
    });

    it('should return defaults on network error', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = fetchMock;

      const result = await getAnthropicModels('test-api-key');

      expect(result).toEqual(getDefaultAnthropicModels());
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

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockModels),
      });
      global.fetch = fetchMock;

      const result = await getAnthropicModels('test-api-key');

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('claude-sonnet-4-20250514');
    });

    it('should sort models by priority', async () => {
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

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockModels),
      });
      global.fetch = fetchMock;

      const result = await getAnthropicModels('test-api-key');

      // Should be sorted: sonnet-4, haiku, opus (by priority in MODEL_DISPLAY_INFO)
      expect(result[0].value).toBe('claude-sonnet-4-20250514');
      expect(result[1].value).toBe('claude-3-5-haiku-20241022');
      expect(result[2].value).toBe('claude-3-opus-20240229');
    });
  });

  describe('getDefaultAnthropicModels', () => {
    it('should return a list of default models', () => {
      const models = getDefaultAnthropicModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('value');
      expect(models[0]).toHaveProperty('label');
    });

    it('should include Claude Sonnet 4 as first option', () => {
      const models = getDefaultAnthropicModels();

      expect(models[0].value).toBe('claude-sonnet-4-20250514');
    });

    it('should include a mix of model tiers', () => {
      const models = getDefaultAnthropicModels();
      const modelIds = models.map(m => m.value);

      expect(modelIds.some(id => id.includes('sonnet'))).toBe(true);
      expect(modelIds.some(id => id.includes('opus'))).toBe(true);
      expect(modelIds.some(id => id.includes('haiku'))).toBe(true);
    });
  });

  describe('testAnthropicApiKey', () => {
    it('should return false if no API key provided', async () => {
      const result = await testAnthropicApiKey('');
      expect(result).toBe(false);
    });

    it('should return true if API call succeeds', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
      });
      global.fetch = fetchMock;

      const result = await testAnthropicApiKey('valid-api-key');

      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'valid-api-key',
          }),
        })
      );
    });

    it('should return false if API call fails', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });
      global.fetch = fetchMock;

      const result = await testAnthropicApiKey('invalid-api-key');

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = fetchMock;

      const result = await testAnthropicApiKey('test-api-key');

      expect(result).toBe(false);
    });
  });
});
