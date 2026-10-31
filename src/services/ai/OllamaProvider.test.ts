/**
 * Ollama Provider Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from './OllamaProvider';
import { ollamaContext, promptTokens } from './ollamaContext';
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
      done_reason: 'stop',
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

    const cutOff = () =>
      ({
        ok: true,
        json: () =>
          Promise.resolve({ message: { content: '{"biomarkers": [{"name": "Gluc' }, done_reason: 'length' }),
      }) as Response;
    const requestOptions = (call: number) =>
      JSON.parse(vi.mocked(fetch).mock.calls[call][1]?.body as string).options;
    const promptCharacters = (call: number) =>
      (
        JSON.parse(vi.mocked(fetch).mock.calls[call][1]?.body as string).messages as { content: string }[]
      ).reduce((sum, m) => sum + m.content.length, 0);

    it("gives the answer the room of the report's context beside the prompt and 1024 spare", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      } as Response);

      await new OllamaProvider().analyzeLabReport('Glucose: 95 mg/dL');

      const { num_ctx, num_predict } = requestOptions(0);
      expect(num_predict).toBeGreaterThanOrEqual(4096);
      expect(num_ctx).toBe(ollamaContext(promptCharacters(0), 4096, 0, 1024).size);
      expect(num_ctx - promptTokens(promptCharacters(0)) - num_predict).toBe(1024);
    });

    it("never gives the answer the room of a larger context kept from before", async () => {
      const reply = () => ({ ok: true, json: () => Promise.resolve(mockSuccessResponse) }) as Response;
      vi.mocked(fetch).mockResolvedValueOnce(reply()).mockResolvedValueOnce(reply());
      const provider = new OllamaProvider();
      await provider.analyzeLabReport('x'.repeat(80_000));

      await provider.analyzeLabReport('Glucose: 95 mg/dL');

      expect(requestOptions(1).num_ctx).toBe(requestOptions(0).num_ctx);
      expect(requestOptions(1).num_predict).toBe(ollamaContext(promptCharacters(1), 4096, 0, 1024).answerRoom);
    });

    it('does not ask again at the report\'s own size when a gateway gives up on a kept context', async () => {
      const reply = () => ({ ok: true, json: () => Promise.resolve(mockSuccessResponse) }) as Response;
      vi.mocked(fetch)
        .mockResolvedValueOnce(reply())
        .mockResolvedValueOnce({
          ok: false,
          status: 504,
          statusText: 'Gateway Time-out',
          json: () => Promise.reject(new Error('not JSON')),
        } as unknown as Response);
      const provider = new OllamaProvider();
      await provider.analyzeLabReport('x'.repeat(80_000));

      await expect(provider.analyzeLabReport('Glucose: 95 mg/dL')).rejects.toThrow(/504/);
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    });

    it('asks a later report with its own context after a gateway gave up on a kept one', async () => {
      const reply = () => ({ ok: true, json: () => Promise.resolve(mockSuccessResponse) }) as Response;
      vi.mocked(fetch)
        .mockResolvedValueOnce(reply())
        .mockResolvedValueOnce({
          ok: false,
          status: 504,
          statusText: 'Gateway Time-out',
          json: () => Promise.reject(new Error('not JSON')),
        } as unknown as Response)
        .mockResolvedValueOnce(reply());
      const provider = new OllamaProvider();
      await provider.analyzeLabReport('x'.repeat(80_000));
      await expect(provider.analyzeLabReport('Glucose: 95 mg/dL')).rejects.toThrow(/504/);

      await provider.analyzeLabReport('Glucose: 95 mg/dL');

      expect(requestOptions(2).num_ctx).toBe(ollamaContext(promptCharacters(2), 4096, 0, 1024).size);
      expect(requestOptions(2).num_ctx).toBeLessThan(requestOptions(0).num_ctx);
    });

    it('takes a Cloudflare tunnel timing out on a kept context as a timeout, not as a refused size', async () => {
      const reply = () => ({ ok: true, json: () => Promise.resolve(mockSuccessResponse) }) as Response;
      vi.mocked(fetch)
        .mockResolvedValueOnce(reply())
        .mockResolvedValueOnce({
          ok: false,
          status: 524,
          statusText: 'A Timeout Occurred',
          json: () => Promise.reject(new Error('not JSON')),
        } as unknown as Response);
      const provider = new OllamaProvider();
      await provider.analyzeLabReport('x'.repeat(80_000));

      await expect(provider.analyzeLabReport('Glucose: 95 mg/dL')).rejects.toThrow(/524/);
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    });

    it('leaves at least 1024 tokens spare also when the prompt and answer nearly fill a step', async () => {
      const reply = () => ({ ok: true, json: () => Promise.resolve(mockSuccessResponse) }) as Response;
      vi.mocked(fetch).mockResolvedValueOnce(reply()).mockResolvedValueOnce(reply());
      await new OllamaProvider().analyzeLabReport('x');
      const overhead = promptCharacters(0) - 1;
      // A report whose prompt and answer end 512 tokens short of a step
      const report = 'x'.repeat(Math.floor((4096 * 3 - 512 - 4096) * 2.3) - overhead);

      await new OllamaProvider().analyzeLabReport(report);

      const spare = requestOptions(1).num_ctx - promptTokens(promptCharacters(1)) - 4096;
      expect(spare).toBeGreaterThanOrEqual(1024);
    });

    it('asks again with a larger answer limit also at a context kept from before', async () => {
      const reply = () => ({ ok: true, json: () => Promise.resolve(mockSuccessResponse) }) as Response;
      vi.mocked(fetch)
        .mockResolvedValueOnce(reply())
        .mockResolvedValueOnce(cutOff())
        .mockResolvedValueOnce(reply());
      const provider = new OllamaProvider();
      await provider.analyzeLabReport('x'.repeat(80_000));

      await provider.analyzeLabReport('Glucose: 95 mg/dL');

      expect(requestOptions(2).num_predict).toBeGreaterThan(requestOptions(1).num_predict);
    });

    it('says the answer was cut off when a proxy gives up on the larger request', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(cutOff())
        .mockResolvedValueOnce({
          ok: false,
          status: 504,
          statusText: 'Gateway Time-out',
          json: () => Promise.reject(new Error('not JSON')),
        } as unknown as Response);

      await expect(new OllamaProvider().analyzeLabReport('Glucose: 95 mg/dL')).rejects.toThrow(
        /cut off.*smaller files/
      );
    });

    it('keeps the error of a larger request that fails for another reason than its size', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(cutOff())
        .mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(new OllamaProvider().analyzeLabReport('Glucose: 95 mg/dL')).rejects.toThrow(
        /^Failed to connect to Ollama/
      );
    });

    it('says Ollama is busy, not that the report is too large, when the larger request finds it busy', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(cutOff())
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: 'server busy, please try again. maximum pending requests exceeded' }),
        } as unknown as Response);

      await expect(new OllamaProvider().analyzeLabReport('Glucose: 95 mg/dL')).rejects.toThrow(
        /^Ollama API error: server busy/
      );
    });

    it('says the analysis was cancelled when the caller cancels the larger request', async () => {
      const controller = new AbortController();
      vi.mocked(fetch)
        .mockResolvedValueOnce(cutOff())
        .mockImplementationOnce(() => {
          controller.abort();
          return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });

      const analysis = new OllamaProvider().analyzeLabReport('Glucose: 95 mg/dL', { signal: controller.signal });

      await expect(analysis).rejects.toThrow(/^Ollama request was cancelled/);
    });

    it('asks again with a larger answer limit when the answer was cut off', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(cutOff())
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSuccessResponse) } as Response);

      const result = await new OllamaProvider().analyzeLabReport('Glucose: 95 mg/dL');

      expect(result.biomarkers).toHaveLength(2);
      expect(requestOptions(1).num_predict).toBeGreaterThan(requestOptions(0).num_predict);
      expect(requestOptions(1).num_ctx).toBeGreaterThan(requestOptions(0).num_ctx);
    });

    it('asks again also when a thinking model was stopped before it wrote anything', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ message: { content: '', thinking: '...' }, done_reason: 'length' }),
        } as Response)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSuccessResponse) } as Response);

      const result = await new OllamaProvider().analyzeLabReport('Glucose: 95 mg/dL');

      expect(result.biomarkers).toHaveLength(2);
    });

    it("says an answer cut off again was cut off at HemoIO's limit, not that it was malformed", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(cutOff()).mockResolvedValueOnce(cutOff());

      await expect(new OllamaProvider().analyzeLabReport('Glucose: 95 mg/dL')).rejects.toThrow(
        /cut off at HemoIO's limit of \d+ tokens.*smaller files/
      );
    });

    it('says the answer was cut off when the larger request fails too', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(cutOff())
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'model requires more system memory' }),
        } as unknown as Response);

      await expect(new OllamaProvider().analyzeLabReport('Glucose: 95 mg/dL')).rejects.toThrow(/cut off/);
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
        json: () => Promise.resolve({ message: { content: '' } }),
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
          message: { content: 'This is not valid JSON' },
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
      message: {
        content: JSON.stringify({
          biomarkers: [
            { name: 'Cholesterol', value: 200, unit: 'mg/dL', confidence: 0.85 },
          ],
          labDate: '2024-02-01',
          warnings: ['Some text was difficult to read'],
        }),
      },
      done_reason: 'stop',
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
      // Ollama's native API takes images beside the text, base64 without a data URL
      expect(typeof userMessage.content).toBe('string');
      expect(userMessage.images).toEqual(['dGVzdGltYWdl']);
    });

    it("asks the vision model for the key of each value's test", async () => {
      vi.mocked(getModelNames).mockResolvedValue(['llava:13b']);
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVisionResponse),
      } as Response);

      const provider = new OllamaProvider({ visionModel: 'llava:13b' });
      await provider.analyzeImage('dGVzdGltYWdl', 'image/jpeg');

      const callBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      // The answer format is the system prompt's, not a copy that can drift
      expect(callBody.messages[0].content).toContain('biomarkerKey');
      expect(callBody.messages[1].content).not.toMatch(/biomarkers: Array of/);
      expect(callBody.messages[1].content).toContain('OUTPUT FORMAT');
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
        done_reason: 'stop',
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
        done_reason: 'stop',
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
        message: {
          content: JSON.stringify({
            biomarkers: [],
            warnings: ['No biomarkers found'],
          }),
        },
        done_reason: 'stop',
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
describe('OllamaProvider rate limiting', () => {
  const successBody = {
    message: {
      content: JSON.stringify({
        biomarkers: [{ name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.95 }],
        warnings: [],
      }),
    },
    done_reason: 'stop',
    model: 'llama3.2:8b',
  };
  const rateLimited = () =>
    new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
      status: 429,
      headers: { 'retry-after': '0' },
    });
  const provider = () => new OllamaProvider();

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries a rate-limited request and reports the wait', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(new Response(JSON.stringify(successBody), { status: 200 }));
    const onWait = vi.fn();

    const result = await provider().analyzeLabReport('Glucose 95 mg/dL', { rateLimit: { onWait } });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onWait).toHaveBeenCalledWith(0, 1);
    expect(result.biomarkers.length).toBeGreaterThan(0);
  });

  it('fails with a clear message when the rate limit does not lift', async () => {
    vi.mocked(fetch).mockImplementation(async () => rateLimited());

    await expect(provider().analyzeLabReport('Glucose 95 mg/dL')).rejects.toThrow(
      'The AI provider is rate limiting requests. Wait a minute, then try again.'
    );
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('passes the caller abort signal to the request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(successBody), { status: 200 })
    );
    const controller = new AbortController();

    await provider().analyzeLabReport('Glucose 95 mg/dL', { signal: controller.signal });
    controller.abort();

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(init.signal?.aborted).toBe(true);
  });

  it('does not retry other errors', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'down' } }), { status: 503 })
    );
    await expect(provider().analyzeLabReport('Glucose 95 mg/dL')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('passes on the test key the model gave', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: { content: JSON.stringify({ biomarkers: [ { name: 'Glicemia', value: 95, unit: 'mg/dL', confidence: 0.9, biomarkerKey: 'glucose' }, { name: 'Zorb', value: 1, unit: 'U', confidence: 0.9, biomarkerKey: null } ], warnings: [] }) }, done_reason: 'stop' }),
    } as Response);

    const result = await new OllamaProvider().analyzeLabReport('Glicemia 95 mg/dL');

    expect(result.biomarkers.map((b) => b.biomarkerKey)).toEqual(['glucose', undefined]);
  });
  it('passes on the test key the model gave', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: { content: JSON.stringify({ biomarkers: [ { name: 'Glicemia', value: 95, unit: 'mg/dL', confidence: 0.9, biomarkerKey: 'glucose' }, { name: 'Zorb', value: 1, unit: 'U', confidence: 0.9, biomarkerKey: null } ], warnings: [] }) }, done_reason: 'stop' }),
    } as Response);

    const result = await new OllamaProvider().analyzeLabReport('Glicemia 95 mg/dL');

    expect(result.biomarkers.map((b) => b.biomarkerKey)).toEqual(['glucose', undefined]);
  });
});

describe('OllamaProvider native chat API', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(isOllamaRunning).mockResolvedValue(true);
    vi.mocked(getModelNames).mockResolvedValue(['llama3.2:8b']);
  });

  it('sends the chat to the native API with a context that fits the prompt', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          message: { role: 'assistant', content: '{"biomarkers":[],"warnings":[]}' },
          done_reason: 'stop',
        }),
    } as Response);

    await new OllamaProvider().analyzeLabReport('x'.repeat(35_000));

    const [url, init] = vi.mocked(fetch).mock.calls.at(-1)!;
    expect(String(url)).toMatch(/\/api\/chat$/);
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({ stream: false, format: 'json' });
    expect(body.options.num_ctx).toBeGreaterThan(10_000);
  });

  it('never asks a model for a smaller context than it accepted, so Ollama keeps it loaded', async () => {
    const reply = () =>
      ({
        ok: true,
        json: () => Promise.resolve({ message: { content: '{"biomarkers":[],"warnings":[]}' }, done_reason: 'stop' }),
      }) as Response;
    vi.mocked(fetch).mockResolvedValueOnce(reply()).mockResolvedValueOnce(reply());
    // The app keeps one provider per configuration
    const provider = new OllamaProvider();

    await provider.analyzeLabReport('x'.repeat(60_000));
    await provider.analyzeLabReport('short report text');

    const numCtx = vi.mocked(fetch).mock.calls.slice(-2).map(([, init]) =>
      JSON.parse(String((init as RequestInit).body)).options.num_ctx
    );
    expect(numCtx[1]).toBe(numCtx[0]);
  });

  const okReply = () =>
    ({
      ok: true,
      json: () => Promise.resolve({ message: { content: '{"biomarkers":[],"warnings":[]}' }, done_reason: 'stop' }),
    }) as Response;
  const refused = () =>
    ({ ok: false, status: 500, json: () => Promise.resolve({ error: 'out of memory' }) }) as unknown as Response;
  const contexts = (count: number) =>
    vi.mocked(fetch).mock.calls.slice(-count).map(([, init]) =>
      JSON.parse(String((init as RequestInit).body)).options.num_ctx as number
    );

  it('does not keep a context Ollama refused', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(refused()).mockResolvedValueOnce(okReply());
    const provider = new OllamaProvider();

    await expect(provider.analyzeLabReport('x'.repeat(60_000))).rejects.toThrow();
    await provider.analyzeLabReport('short report text');

    const [large, short] = contexts(2);
    expect(short).toBeLessThan(large);
  });

  it('forgets a context it accepted once Ollama refuses it, and asks at the report\'s own size', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(okReply())
      .mockResolvedValueOnce(refused())
      .mockResolvedValueOnce(okReply())
      .mockResolvedValueOnce(okReply());
    const provider = new OllamaProvider();

    await provider.analyzeLabReport('x'.repeat(60_000));
    await provider.analyzeLabReport('short report text');
    await provider.analyzeLabReport('short report text');

    // The second report asks at the size accepted before, then at its own
    const [large, remembered, own, next] = contexts(4);
    expect(remembered).toBe(large);
    expect(own).toBeLessThan(large);
    expect(next).toBe(own);
  });

  it('keeps the context it accepted when Ollama refuses a larger one', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(okReply())
      .mockResolvedValueOnce(refused())
      .mockResolvedValueOnce(okReply());
    const provider = new OllamaProvider();

    await provider.analyzeLabReport('x'.repeat(30_000));
    await expect(provider.analyzeLabReport('x'.repeat(60_000))).rejects.toThrow();
    await provider.analyzeLabReport('short report text');

    const [accepted, larger, next] = contexts(3);
    expect(larger).toBeGreaterThan(accepted);
    expect(next).toBe(accepted);
  });

  it('keeps the larger context of a cut-off answer it accepted, so the next report needs no reload', async () => {
    const cutOffReply = () =>
      ({
        ok: true,
        json: () => Promise.resolve({ message: { content: '{"biomarkers": [' }, done_reason: 'length' }),
      }) as Response;
    vi.mocked(fetch).mockResolvedValueOnce(cutOffReply()).mockResolvedValueOnce(okReply()).mockResolvedValueOnce(okReply());
    const provider = new OllamaProvider();

    await provider.analyzeLabReport('short report text');
    await provider.analyzeLabReport('short report text');

    const [first, larger, next] = contexts(3);
    expect(larger).toBeGreaterThan(first);
    expect(next).toBe(larger);
  });
});
