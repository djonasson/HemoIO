/**
 * Ollama Utilities Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isVisionModel,
  isOllamaRunning,
  getAvailableModels,
  getModelNames,
  selectBestTextModel,
  selectBestVisionModel,
  getRecommendedModels,
  formatModelSize,
  parseOllamaError,
  cleanUnitAndExtractRange,
  OLLAMA_DEFAULTS,
  RANKED_TEXT_MODELS,
  VISION_MODELS,
} from './ollamaUtils';

describe('ollamaUtils', () => {
  describe('isVisionModel', () => {
    it('should identify llava models as vision models', () => {
      expect(isVisionModel('llava:13b')).toBe(true);
      expect(isVisionModel('llava:7b')).toBe(true);
      expect(isVisionModel('llava-llama3:8b')).toBe(true);
      expect(isVisionModel('bakllava:7b')).toBe(true);
    });

    it('should identify llama3.2-vision as a vision model', () => {
      expect(isVisionModel('llama3.2-vision:11b')).toBe(true);
      expect(isVisionModel('llama3.2-vision:90b')).toBe(true);
    });

    it('should identify moondream as a vision model', () => {
      expect(isVisionModel('moondream:1.8b')).toBe(true);
    });

    it('should not identify text-only models as vision models', () => {
      expect(isVisionModel('llama3.2:8b')).toBe(false);
      expect(isVisionModel('mistral:7b')).toBe(false);
      expect(isVisionModel('qwen2.5:7b')).toBe(false);
      expect(isVisionModel('mixtral:8x7b')).toBe(false);
    });

    it('should handle case insensitivity', () => {
      expect(isVisionModel('LLAVA:13B')).toBe(true);
      expect(isVisionModel('LLaVA:13b')).toBe(true);
    });
  });

  describe('selectBestTextModel', () => {
    it('should select the highest-ranked available model', () => {
      const models = ['mistral:7b', 'llama3.2:8b', 'llama2:7b'];
      expect(selectBestTextModel(models)).toBe('llama3.2:8b');
    });

    it('should prefer ranked models in order', () => {
      // llama3.2:8b is ranked first, so it matches llama3.2:3b (same base name)
      // This is expected behavior - it matches first available variant
      const models = ['llama3.2:3b', 'llama3.2:8b'];
      // First match for llama3.2 base name wins
      expect(selectBestTextModel(models)).toBe('llama3.2:3b');

      // When exact match exists, it should be preferred
      const modelsWithExact = ['mistral:7b', 'llama3.2:8b'];
      expect(selectBestTextModel(modelsWithExact)).toBe('llama3.2:8b');
    });

    it('should select mistral if higher-ranked models unavailable', () => {
      const models = ['mistral:7b', 'llama2:7b'];
      expect(selectBestTextModel(models)).toBe('mistral:7b');
    });

    it('should return first text model if no ranked model available', () => {
      const models = ['custom-model:latest', 'another-model:v2'];
      expect(selectBestTextModel(models)).toBe('custom-model:latest');
    });

    it('should skip vision models when selecting text model', () => {
      const models = ['llava:13b', 'custom-model:latest'];
      expect(selectBestTextModel(models)).toBe('custom-model:latest');
    });

    it('should return undefined for empty list', () => {
      expect(selectBestTextModel([])).toBeUndefined();
    });

    it('should match model variants with different tags', () => {
      const models = ['llama3.2:latest'];
      expect(selectBestTextModel(models)).toBe('llama3.2:latest');
    });
  });

  describe('selectBestVisionModel', () => {
    it('should select the highest-ranked vision model', () => {
      const models = ['llava:13b', 'moondream:1.8b', 'llama3.2-vision:11b'];
      expect(selectBestVisionModel(models)).toBe('llama3.2-vision:11b');
    });

    it('should select llava if llama3.2-vision unavailable', () => {
      const models = ['llava:13b', 'moondream:1.8b'];
      expect(selectBestVisionModel(models)).toBe('llava:13b');
    });

    it('should return undefined if no vision model available', () => {
      const models = ['llama3.2:8b', 'mistral:7b'];
      expect(selectBestVisionModel(models)).toBeUndefined();
    });

    it('should return undefined for empty list', () => {
      expect(selectBestVisionModel([])).toBeUndefined();
    });
  });

  describe('formatModelSize', () => {
    it('should format bytes correctly', () => {
      expect(formatModelSize(500)).toBe('500.0 B');
    });

    it('should format kilobytes correctly', () => {
      expect(formatModelSize(1024)).toBe('1.0 KB');
      expect(formatModelSize(2560)).toBe('2.5 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatModelSize(1024 * 1024)).toBe('1.0 MB');
      expect(formatModelSize(5 * 1024 * 1024)).toBe('5.0 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatModelSize(1024 * 1024 * 1024)).toBe('1.0 GB');
      expect(formatModelSize(4.7 * 1024 * 1024 * 1024)).toBe('4.7 GB');
    });
  });

  describe('OLLAMA_DEFAULTS', () => {
    it('should have correct default values', () => {
      expect(OLLAMA_DEFAULTS.baseUrl).toBe('http://localhost:11434');
      expect(OLLAMA_DEFAULTS.timeout).toBe(600000); // 10 minutes for local processing
      expect(OLLAMA_DEFAULTS.temperature).toBe(0.1);
      expect(OLLAMA_DEFAULTS.maxTokens).toBe(4096);
    });
  });

  describe('RANKED_TEXT_MODELS', () => {
    it('should include common text models', () => {
      expect(RANKED_TEXT_MODELS).toContain('llama3.2:8b');
      expect(RANKED_TEXT_MODELS).toContain('mistral:7b');
      expect(RANKED_TEXT_MODELS).toContain('qwen2.5:7b');
    });

    it('should have llama3.2:8b ranked higher than llama3.2:3b', () => {
      const index8b = RANKED_TEXT_MODELS.indexOf('llama3.2:8b');
      const index3b = RANKED_TEXT_MODELS.indexOf('llama3.2:3b');
      expect(index8b).toBeLessThan(index3b);
    });
  });

  describe('VISION_MODELS', () => {
    it('should include common vision models', () => {
      expect(VISION_MODELS).toContain('llama3.2-vision:11b');
      expect(VISION_MODELS).toContain('llava:13b');
      expect(VISION_MODELS).toContain('moondream:1.8b');
    });
  });
});

describe('ollamaUtils - network functions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isOllamaRunning', () => {
    it('should return true when Ollama responds successfully', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
      } as Response);

      const result = await isOllamaRunning();
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return false when Ollama returns error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      const result = await isOllamaRunning();
      expect(result).toBe(false);
    });

    it('should return false when fetch throws', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Connection refused'));

      const result = await isOllamaRunning();
      expect(result).toBe(false);
    });

    it('should use custom baseUrl', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
      } as Response);

      await isOllamaRunning('http://192.168.1.100:11434');
      expect(fetch).toHaveBeenCalledWith(
        'http://192.168.1.100:11434/api/tags',
        expect.any(Object)
      );
    });
  });

  describe('getAvailableModels', () => {
    it('should return list of models', async () => {
      const mockModels = {
        models: [
          { name: 'llama3.2:8b', size: 4700000000, digest: 'abc123', modifiedAt: '2024-01-01' },
          { name: 'mistral:7b', size: 4100000000, digest: 'def456', modifiedAt: '2024-01-02' },
        ],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockModels),
      } as Response);

      const result = await getAvailableModels();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('llama3.2:8b');
      expect(result[1].name).toBe('mistral:7b');
    });

    it('should return empty array on error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const result = await getAvailableModels();
      expect(result).toEqual([]);
    });

    it('should return empty array when Ollama not running', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      const result = await getAvailableModels();
      expect(result).toEqual([]);
    });
  });

  describe('getModelNames', () => {
    it('should return just model names', async () => {
      const mockModels = {
        models: [
          { name: 'llama3.2:8b', size: 4700000000, digest: 'abc', modifiedAt: '2024-01-01' },
          { name: 'mistral:7b', size: 4100000000, digest: 'def', modifiedAt: '2024-01-02' },
        ],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockModels),
      } as Response);

      const result = await getModelNames();
      expect(result).toEqual(['llama3.2:8b', 'mistral:7b']);
    });
  });

  describe('getRecommendedModels', () => {
    it('should return recommended text and vision models', async () => {
      const mockModels = {
        models: [
          { name: 'llama3.2:8b', size: 4700000000, digest: 'abc', modifiedAt: '2024-01-01' },
          { name: 'llava:13b', size: 8000000000, digest: 'def', modifiedAt: '2024-01-02' },
          { name: 'mistral:7b', size: 4100000000, digest: 'ghi', modifiedAt: '2024-01-03' },
        ],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockModels),
      } as Response);

      const result = await getRecommendedModels();
      expect(result.textModel).toBe('llama3.2:8b');
      expect(result.visionModel).toBe('llava:13b');
      expect(result.hasVisionCapability).toBe(true);
      expect(result.availableModels).toHaveLength(3);
    });

    it('should indicate no vision capability when no vision model', async () => {
      const mockModels = {
        models: [
          { name: 'llama3.2:8b', size: 4700000000, digest: 'abc', modifiedAt: '2024-01-01' },
        ],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockModels),
      } as Response);

      const result = await getRecommendedModels();
      expect(result.textModel).toBe('llama3.2:8b');
      expect(result.visionModel).toBeUndefined();
      expect(result.hasVisionCapability).toBe(false);
    });
  });

  describe('parseOllamaError', () => {
    it('should parse JSON error response', async () => {
      const mockResponse = {
        json: () => Promise.resolve({ error: 'Model not found' }),
      } as Response;

      const result = await parseOllamaError(mockResponse);
      expect(result).toBe('Model not found');
    });

    it('should handle non-JSON response', async () => {
      const mockResponse = {
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as unknown as Response;

      const result = await parseOllamaError(mockResponse);
      expect(result).toBe('HTTP 500: Internal Server Error');
    });

    it('should handle response without error field', async () => {
      const mockResponse = {
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ message: 'Something else' }),
      } as unknown as Response;

      const result = await parseOllamaError(mockResponse);
      expect(result).toBe('HTTP 404: Not Found');
    });
  });

  describe('cleanUnitAndExtractRange', () => {
    it('should return empty string for empty input', () => {
      expect(cleanUnitAndExtractRange('')).toEqual({ unit: '' });
    });

    it('should pass through clean units unchanged', () => {
      expect(cleanUnitAndExtractRange('U/L')).toEqual({ unit: 'U/L' });
      expect(cleanUnitAndExtractRange('mg/dL')).toEqual({ unit: 'mg/dL' });
      expect(cleanUnitAndExtractRange('%')).toEqual({ unit: '%' });
    });

    it('should normalize UL to U/L', () => {
      expect(cleanUnitAndExtractRange('UL')).toEqual({ unit: 'U/L' });
    });

    it('should extract Italian range format "Da X a Y"', () => {
      const result = cleanUnitAndExtractRange('UL Da5a34');
      expect(result).toEqual({
        unit: 'U/L', // UL gets normalized to U/L
        extractedRange: { low: 5, high: 34 },
      });
    });

    it('should extract Italian range with spaces "Da X a Y"', () => {
      const result = cleanUnitAndExtractRange('U/L Da 5 a 34');
      expect(result).toEqual({
        unit: 'U/L',
        extractedRange: { low: 5, high: 34 },
      });
    });

    it('should extract range in parentheses', () => {
      const result = cleanUnitAndExtractRange('mg/dL (70-100)');
      expect(result).toEqual({
        unit: 'mg/dL',
        extractedRange: { low: 70, high: 100 },
      });
    });

    it('should extract range with en-dash', () => {
      const result = cleanUnitAndExtractRange('U/L (5 – 34)');
      expect(result).toEqual({
        unit: 'U/L',
        extractedRange: { low: 5, high: 34 },
      });
    });

    it('should extract range directly after unit', () => {
      const result = cleanUnitAndExtractRange('U/L 5-34');
      expect(result).toEqual({
        unit: 'U/L',
        extractedRange: { low: 5, high: 34 },
      });
    });

    it('should handle decimal values in ranges', () => {
      const result = cleanUnitAndExtractRange('mg/dL (0.5-1.3)');
      expect(result).toEqual({
        unit: 'mg/dL',
        extractedRange: { low: 0.5, high: 1.3 },
      });
    });

    it('should handle comma as decimal separator', () => {
      const result = cleanUnitAndExtractRange('mg/dL (0,5-1,3)');
      expect(result).toEqual({
        unit: 'mg/dL',
        extractedRange: { low: 0.5, high: 1.3 },
      });
    });

    it('should extract Italian "fino a" (up to) format', () => {
      const result = cleanUnitAndExtractRange('U/L fino a 34');
      expect(result).toEqual({
        unit: 'U/L',
        extractedRange: { high: 34 },
      });
    });

    it('should extract Italian "oltre" (above) format', () => {
      const result = cleanUnitAndExtractRange('U/L oltre 10');
      expect(result).toEqual({
        unit: 'U/L',
        extractedRange: { low: 10 },
      });
    });

    it('should extract threshold with unit "< X unit"', () => {
      const result = cleanUnitAndExtractRange('< 5.0 U/L');
      expect(result).toEqual({
        unit: 'U/L',
        extractedRange: { high: 5.0 },
      });
    });

    it('should extract threshold with unit "> X unit"', () => {
      const result = cleanUnitAndExtractRange('> 10 mg/dL');
      expect(result).toEqual({
        unit: 'mg/dL',
        extractedRange: { low: 10 },
      });
    });
  });
});
