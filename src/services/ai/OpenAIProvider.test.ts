import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from './OpenAIProvider';
import { AIAnalysisError, AIConfigurationError } from './types';

describe('OpenAIProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('creates provider with valid config', () => {
      const provider = new OpenAIProvider({ apiKey: 'sk-test-key' });

      expect(provider.type).toBe('openai');
      expect(provider.name).toBe('OpenAI');
    });

    it('throws error without API key', () => {
      expect(() => new OpenAIProvider({ apiKey: '' })).toThrow(
        AIConfigurationError
      );
    });
  });

  describe('analyzeLabReport', () => {
    const mockLabReportResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              biomarkers: [
                {
                  name: 'Glucose',
                  value: 95,
                  unit: 'mg/dL',
                  referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
                  confidence: 0.95,
                  flaggedAbnormal: false,
                },
                {
                  name: 'Hemoglobin',
                  value: 14.5,
                  unit: 'g/dL',
                  confidence: 0.92,
                  flaggedAbnormal: false,
                },
              ],
              labDate: '2024-01-15',
              labName: 'City Medical Lab',
              warnings: [],
            }),
          },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    };

    it('extracts biomarkers from lab report text', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLabReportResponse),
      } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key' });
      const result = await provider.analyzeLabReport(
        'Patient Lab Report\nGlucose: 95 mg/dL (70-100)\nHemoglobin: 14.5 g/dL'
      );

      expect(result.biomarkers).toHaveLength(2);
      expect(result.biomarkers[0].name).toBe('Glucose');
      expect(result.biomarkers[0].value).toBe(95);
      expect(result.biomarkers[0].unit).toBe('mg/dL');
      expect(result.biomarkers[0].confidence).toBe(0.95);
    });

    it('extracts lab date and name', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLabReportResponse),
      } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key' });
      const result = await provider.analyzeLabReport('Lab report text');

      expect(result.labDate).toBe('2024-01-15');
      expect(result.labName).toBe('City Medical Lab');
    });

    it('calculates overall confidence', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLabReportResponse),
      } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key' });
      const result = await provider.analyzeLabReport('Lab report text');

      // Average of 0.95 and 0.92
      expect(result.overallConfidence).toBeCloseTo(0.935, 2);
    });

    it('includes model used in result', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLabReportResponse),
      } as Response);

      const provider = new OpenAIProvider({
        apiKey: 'sk-test-key',
        model: 'gpt-4o',
      });
      const result = await provider.analyzeLabReport('Lab report text');

      expect(result.modelUsed).toBe('gpt-4o');
    });

    it('tracks processing time', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLabReportResponse),
      } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key' });
      const result = await provider.analyzeLabReport('Lab report text');

      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('throws error for empty text', async () => {
      const provider = new OpenAIProvider({ apiKey: 'sk-test-key' });

      await expect(provider.analyzeLabReport('')).rejects.toThrow(
        AIAnalysisError
      );
    });

    it('handles API errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: { message: 'Invalid API key', type: 'auth_error' },
          }),
      } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-invalid-key' });

      await expect(provider.analyzeLabReport('Lab report text')).rejects.toThrow(
        AIAnalysisError
      );
    });

    it('handles empty response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key' });

      await expect(provider.analyzeLabReport('Lab report text')).rejects.toThrow(
        'Empty response'
      );
    });

    it('handles malformed JSON in response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'not valid json' } }],
          }),
      } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key' });

      await expect(provider.analyzeLabReport('Lab report text')).rejects.toThrow(
        'Failed to parse'
      );
    });
  });

  describe('validateConfiguration', () => {
    it('returns true for valid sk- prefixed key', async () => {
      const provider = new OpenAIProvider({ apiKey: 'sk-test-key' });

      const result = await provider.validateConfiguration();

      expect(result).toBe(true);
    });

    it('returns false for invalid key format', async () => {
      const provider = new OpenAIProvider({ apiKey: 'invalid-key' });

      const result = await provider.validateConfiguration();

      expect(result).toBe(false);
    });
  });

  describe('testConnection', () => {
    it('returns true when API responds correctly', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'OK' } }],
          }),
      } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key' });

      const result = await provider.testConnection();

      expect(result).toBe(true);
    });

    it('returns false when API responds incorrectly', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Something else' } }],
          }),
      } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key' });

      const result = await provider.testConnection();

      expect(result).toBe(false);
    });

    it('returns false on network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key' });

      const result = await provider.testConnection();

      expect(result).toBe(false);
    });
  });
});
