import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from './AnthropicProvider';
import { AIAnalysisError, AIConfigurationError } from './types';

describe('AnthropicProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('creates provider with valid config', () => {
      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key' });

      expect(provider.type).toBe('anthropic');
      expect(provider.name).toBe('Anthropic Claude');
    });

    it('throws error without API key', () => {
      expect(() => new AnthropicProvider({ apiKey: '' })).toThrow(
        AIConfigurationError
      );
    });
  });

  describe('analyzeLabReport', () => {
    const mockLabReportResponse = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
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
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
    };

    it('extracts biomarkers from lab report text', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLabReportResponse),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key' });
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

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key' });
      const result = await provider.analyzeLabReport('Lab report text');

      expect(result.labDate).toBe('2024-01-15');
      expect(result.labName).toBe('City Medical Lab');
    });

    it('calculates overall confidence', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLabReportResponse),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key' });
      const result = await provider.analyzeLabReport('Lab report text');

      // Average of 0.95 and 0.92
      expect(result.overallConfidence).toBeCloseTo(0.935, 2);
    });

    it('includes model used in result', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLabReportResponse),
      } as Response);

      const provider = new AnthropicProvider({
        apiKey: 'sk-ant-test-key',
        model: 'claude-3-opus-20240229',
      });
      const result = await provider.analyzeLabReport('Lab report text');

      expect(result.modelUsed).toBe('claude-3-opus-20240229');
    });

    it('tracks processing time', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLabReportResponse),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key' });
      const result = await provider.analyzeLabReport('Lab report text');

      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('throws error for empty text', async () => {
      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key' });

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

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-invalid-key' });

      await expect(provider.analyzeLabReport('Lab report text')).rejects.toThrow(
        AIAnalysisError
      );
    });

    it('handles empty response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [] }),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key' });

      await expect(provider.analyzeLabReport('Lab report text')).rejects.toThrow(
        'Empty response'
      );
    });

    it('handles malformed JSON in response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'text', text: 'not valid json' }],
          }),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key' });

      await expect(provider.analyzeLabReport('Lab report text')).rejects.toThrow(
        'Failed to parse'
      );
    });

    it('sends correct headers for Anthropic API', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLabReportResponse),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key' });
      await provider.analyzeLabReport('Lab report text');

      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-test-key',
            'anthropic-version': '2023-06-01',
          }),
        })
      );
    });
  });

  describe('validateConfiguration', () => {
    it('returns true for valid sk-ant- prefixed key', async () => {
      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key' });

      const result = await provider.validateConfiguration();

      expect(result).toBe(true);
    });

    it('returns false for invalid key format', async () => {
      const provider = new AnthropicProvider({ apiKey: 'sk-test-key' });

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
            content: [{ type: 'text', text: 'OK' }],
          }),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key' });

      const result = await provider.testConnection();

      expect(result).toBe(true);
    });

    it('returns false when API responds incorrectly', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'text', text: 'Something else' }],
          }),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key' });

      const result = await provider.testConnection();

      expect(result).toBe(false);
    });

    it('returns false on network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key' });

      const result = await provider.testConnection();

      expect(result).toBe(false);
    });
  });
});
