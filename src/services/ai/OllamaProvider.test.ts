/**
 * Ollama Provider Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from './OllamaProvider';
import { AIAnalysisError } from './types';

// Mock the ollamaUtils module
vi.mock('./ollamaUtils', async () => {
  const actual = await vi.importActual('./ollamaUtils');
  return {
    ...actual,
    isOllamaRunning: vi.fn(),
    getModelNames: vi.fn(),
  };
});

import { isOllamaRunning, getModelNames } from './ollamaUtils';

describe('OllamaProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(isOllamaRunning).mockResolvedValue(true);
    vi.mocked(getModelNames).mockResolvedValue(['llama3.2:8b', 'mistral:7b']);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with default config', () => {
      const provider = new OllamaProvider();

      expect(provider.type).toBe('ollama');
      expect(provider.name).toBe('Ollama (Local)');
      expect(provider.getModel()).toBe('llama3.2:8b');
    });

    it('should accept custom config', () => {
      const provider = new OllamaProvider({
        baseUrl: 'http://192.168.1.100:11434',
        model: 'mistral:7b',
        timeout: 60000,
      });

      expect(provider.getModel()).toBe('mistral:7b');
    });

    it('should set vision model when provided', () => {
      const provider = new OllamaProvider({
        visionModel: 'llava:13b',
      });

      expect(provider.getVisionModel()).toBe('llava:13b');
    });
  });

  describe('analyzeLabReport', () => {
    const mockSuccessResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              biomarkers: [
                {
                  name: 'Glucose',
                  value: 95,
                  unit: 'mg/dL',
                  confidence: 0.95,
                  referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
                },
                {
                  name: 'Hemoglobin',
                  value: 14.5,
                  unit: 'g/dL',
                  confidence: 0.9,
                },
              ],
              labDate: '2024-01-15',
              labName: 'Test Laboratory',
              warnings: [],
            }),
          },
          finish_reason: 'stop',
        },
      ],
      model: 'llama3.2:8b',
    };

    it('should analyze lab report text successfully', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      } as Response);

      const provider = new OllamaProvider();
      const result = await provider.analyzeLabReport('Glucose: 95 mg/dL\nHemoglobin: 14.5 g/dL');

      expect(result.biomarkers).toHaveLength(2);
      expect(result.biomarkers[0].name).toBe('Glucose');
      expect(result.biomarkers[0].value).toBe(95);
      expect(result.biomarkers[1].name).toBe('Hemoglobin');
      expect(result.labDate).toBe('2024-01-15');
      expect(result.labName).toBe('Test Laboratory');
      expect(result.modelUsed).toBe('llama3.2:8b');
    });

    it('should throw error for empty text', async () => {
      const provider = new OllamaProvider();

      await expect(provider.analyzeLabReport('')).rejects.toThrow(AIAnalysisError);
      await expect(provider.analyzeLabReport('   ')).rejects.toThrow(AIAnalysisError);
    });

    it('should throw error when Ollama returns error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'Model not found' }),
      } as unknown as Response);

      const provider = new OllamaProvider();

      await expect(provider.analyzeLabReport('Test text')).rejects.toThrow(
        /Ollama API error: Model not found/
      );
    });

    it('should throw error on timeout', async () => {
      vi.mocked(fetch).mockImplementationOnce(() => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const provider = new OllamaProvider({ timeout: 1000 });

      await expect(provider.analyzeLabReport('Test text')).rejects.toThrow(/timed out/);
    });

    it('should throw error when response has no content', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: '' } }] }),
      } as Response);

      const provider = new OllamaProvider();

      await expect(provider.analyzeLabReport('Test text')).rejects.toThrow(
        /Empty response from Ollama/
      );
    });

    it('should throw error when response has invalid JSON', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'This is not valid JSON' } }],
        }),
      } as Response);

      const provider = new OllamaProvider();

      await expect(provider.analyzeLabReport('Test text')).rejects.toThrow(
        /Failed to parse Ollama response/
      );
    });

    it('should pass analysis options', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      } as Response);

      const provider = new OllamaProvider();
      await provider.analyzeLabReport('Test text', {
        language: 'Spanish',
        extractPatientInfo: true,
        additionalInstructions: 'Focus on lipid panel',
      });

      const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(callBody.messages[1].content).toContain('Spanish');
      expect(callBody.messages[1].content).toContain('Yes');
      expect(callBody.messages[1].content).toContain('Focus on lipid panel');
    });
  });

  describe('analyzeImage', () => {
    const mockVisionResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              biomarkers: [
                { name: 'Cholesterol', value: 200, unit: 'mg/dL', confidence: 0.85 },
              ],
              labDate: '2024-02-01',
              warnings: ['Some text was difficult to read'],
            }),
          },
          finish_reason: 'stop',
        },
      ],
      model: 'llava:13b',
    };

    it('should analyze image with vision model', async () => {
      vi.mocked(getModelNames).mockResolvedValue(['llama3.2:8b', 'llava:13b']);
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVisionResponse),
      } as Response);

      const provider = new OllamaProvider({ visionModel: 'llava:13b' });
      const result = await provider.analyzeImage('base64imagedata', 'image/png');

      expect(result.biomarkers).toHaveLength(1);
      expect(result.biomarkers[0].name).toBe('Cholesterol');
      expect(result.modelUsed).toBe('llava:13b');
      expect(result.analyzedText).toBe('[Image analysis - no text extracted]');
    });

    it('should throw error when no vision model available', async () => {
      vi.mocked(getModelNames).mockResolvedValue(['llama3.2:8b', 'mistral:7b']);

      const provider = new OllamaProvider();

      await expect(provider.analyzeImage('base64data', 'image/png')).rejects.toThrow(
        /No vision model available/
      );
    });

    it('should throw error for empty image data', async () => {
      const provider = new OllamaProvider({ visionModel: 'llava:13b' });

      await expect(provider.analyzeImage('', 'image/png')).rejects.toThrow(
        /Image data is empty/
      );
    });

    it('should include image in request', async () => {
      vi.mocked(getModelNames).mockResolvedValue(['llava:13b']);
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVisionResponse),
      } as Response);

      const provider = new OllamaProvider({ visionModel: 'llava:13b' });
      await provider.analyzeImage('dGVzdGltYWdl', 'image/jpeg');

      const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      const userMessage = callBody.messages[1];
      expect(Array.isArray(userMessage.content)).toBe(true);
      expect(userMessage.content[1].type).toBe('image_url');
      expect(userMessage.content[1].image_url.url).toContain('data:image/jpeg;base64,');
    });
  });

  describe('supportsVision', () => {
    it('should return true when vision model is configured', () => {
      const provider = new OllamaProvider({ visionModel: 'llava:13b' });
      expect(provider.supportsVision()).toBe(true);
    });

    it('should return false when no vision model', () => {
      const provider = new OllamaProvider();
      expect(provider.supportsVision()).toBe(false);
    });

    it('should return false when vision is disabled', () => {
      const provider = new OllamaProvider({ visionModel: 'llava:13b', enableVision: false });
      expect(provider.supportsVision()).toBe(false);
    });
  });

  describe('validateConfiguration', () => {
    it('should return true when Ollama is running with models', async () => {
      vi.mocked(isOllamaRunning).mockResolvedValue(true);
      vi.mocked(getModelNames).mockResolvedValue(['llama3.2:8b']);

      const provider = new OllamaProvider();
      const result = await provider.validateConfiguration();

      expect(result).toBe(true);
    });

    it('should return false when Ollama is not running', async () => {
      vi.mocked(isOllamaRunning).mockResolvedValue(false);

      const provider = new OllamaProvider();
      const result = await provider.validateConfiguration();

      expect(result).toBe(false);
    });

    it('should return false when no models available', async () => {
      vi.mocked(isOllamaRunning).mockResolvedValue(true);
      vi.mocked(getModelNames).mockResolvedValue([]);

      const provider = new OllamaProvider();
      const result = await provider.validateConfiguration();

      expect(result).toBe(false);
    });
  });

  describe('testConnection', () => {
    it('should return true when Ollama is running', async () => {
      vi.mocked(isOllamaRunning).mockResolvedValue(true);

      const provider = new OllamaProvider();
      const result = await provider.testConnection();

      expect(result).toBe(true);
    });

    it('should return false when Ollama is not running', async () => {
      vi.mocked(isOllamaRunning).mockResolvedValue(false);

      const provider = new OllamaProvider();
      const result = await provider.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('getAvailableModels', () => {
    it('should return list of available models', async () => {
      vi.mocked(getModelNames).mockResolvedValue(['llama3.2:8b', 'mistral:7b']);

      const provider = new OllamaProvider();
      const models = await provider.getAvailableModels();

      expect(models).toEqual(['llama3.2:8b', 'mistral:7b']);
    });
  });

  describe('isVisionModelAvailable', () => {
    it('should return true when vision model exists', async () => {
      vi.mocked(getModelNames).mockResolvedValue(['llama3.2:8b', 'llava:13b']);

      const provider = new OllamaProvider();
      const result = await provider.isVisionModelAvailable();

      expect(result).toBe(true);
    });

    it('should return false when no vision model', async () => {
      vi.mocked(getModelNames).mockResolvedValue(['llama3.2:8b', 'mistral:7b']);

      const provider = new OllamaProvider();
      const result = await provider.isVisionModelAvailable();

      expect(result).toBe(false);
    });
  });

  describe('model management', () => {
    it('should get and set model', () => {
      const provider = new OllamaProvider();

      expect(provider.getModel()).toBe('llama3.2:8b');

      provider.setModel('mistral:7b');
      expect(provider.getModel()).toBe('mistral:7b');
    });

    it('should get and set vision model', () => {
      const provider = new OllamaProvider();

      expect(provider.getVisionModel()).toBeUndefined();

      provider.setVisionModel('llava:13b');
      expect(provider.getVisionModel()).toBe('llava:13b');

      provider.setVisionModel(undefined);
      expect(provider.getVisionModel()).toBeUndefined();
    });
  });

  describe('autoConfigureModels', () => {
    it('should auto-configure best available models', async () => {
      vi.mocked(getModelNames).mockResolvedValue(['llama3.2:8b', 'mistral:7b', 'llava:13b']);

      const provider = new OllamaProvider();
      const result = await provider.autoConfigureModels();

      expect(result.textModel).toBe('llama3.2:8b');
      expect(result.visionModel).toBe('llava:13b');
      expect(provider.getModel()).toBe('llama3.2:8b');
      expect(provider.getVisionModel()).toBe('llava:13b');
    });

    it('should not set vision model when vision disabled', async () => {
      vi.mocked(getModelNames).mockResolvedValue(['llama3.2:8b', 'llava:13b']);

      const provider = new OllamaProvider({ enableVision: false });
      const result = await provider.autoConfigureModels();

      expect(result.textModel).toBe('llama3.2:8b');
      expect(result.visionModel).toBeUndefined();
    });
  });

  describe('response parsing', () => {
    it('should normalize biomarker confidence values', async () => {
      const responseWithInvalidConfidence = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                biomarkers: [
                  { name: 'Test1', value: 100, unit: 'mg/dL', confidence: 1.5 },
                  { name: 'Test2', value: 200, unit: 'mg/dL', confidence: -0.5 },
                  { name: 'Test3', value: 300, unit: 'mg/dL' },
                ],
                warnings: [],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        model: 'llama3.2:8b',
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithInvalidConfidence),
      } as Response);

      const provider = new OllamaProvider();
      const result = await provider.analyzeLabReport('Test text');

      expect(result.biomarkers[0].confidence).toBe(1);
      expect(result.biomarkers[1].confidence).toBe(0);
      expect(result.biomarkers[2].confidence).toBe(0.5);
    });

    it('should calculate overall confidence as average', async () => {
      const responseWithMultipleBiomarkers = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                biomarkers: [
                  { name: 'Test1', value: 100, unit: 'mg/dL', confidence: 0.8 },
                  { name: 'Test2', value: 200, unit: 'mg/dL', confidence: 0.9 },
                  { name: 'Test3', value: 300, unit: 'mg/dL', confidence: 1.0 },
                ],
                warnings: [],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        model: 'llama3.2:8b',
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithMultipleBiomarkers),
      } as Response);

      const provider = new OllamaProvider();
      const result = await provider.analyzeLabReport('Test text');

      expect(result.overallConfidence).toBeCloseTo(0.9, 2);
    });

    it('should return 0 overall confidence for empty biomarkers', async () => {
      const responseWithNoBiomarkers = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                biomarkers: [],
                warnings: ['No biomarkers found'],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        model: 'llama3.2:8b',
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithNoBiomarkers),
      } as Response);

      const provider = new OllamaProvider();
      const result = await provider.analyzeLabReport('Test text');

      expect(result.overallConfidence).toBe(0);
      expect(result.warnings).toContain('No biomarkers found');
    });
  });
});
