import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from './OpenAIProvider';
import { AIAnalysisError, AIConfigurationError } from './types';

// Model IDs come from the user's selection at runtime; tests use a placeholder
const TEST_MODEL = 'gpt-test-model';

describe('OpenAIProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('creates provider with valid config', () => {
      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });

      expect(provider.type).toBe('openai');
      expect(provider.name).toBe('OpenAI');
    });

    it('throws error without API key', () => {
      expect(() => new OpenAIProvider({ apiKey: '', model: TEST_MODEL })).toThrow(
        AIConfigurationError
      );
    });

    it('throws error without a model, instead of guessing one', () => {
      expect(() => new OpenAIProvider({ apiKey: 'sk-test-key' })).toThrow(/select a model/i);
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

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });
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

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });
      const result = await provider.analyzeLabReport('Lab report text');

      expect(result.labDate).toBe('2024-01-15');
      expect(result.labName).toBe('City Medical Lab');
    });

    it('calculates overall confidence', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLabReportResponse),
      } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });
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

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });
      const result = await provider.analyzeLabReport('Lab report text');

      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('throws error for empty text', async () => {
      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });

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

      const provider = new OpenAIProvider({ apiKey: 'sk-invalid-key', model: TEST_MODEL });

      await expect(provider.analyzeLabReport('Lab report text')).rejects.toThrow(
        AIAnalysisError
      );
    });

    it('handles empty response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });

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

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });

      await expect(provider.analyzeLabReport('Lab report text')).rejects.toThrow(
        'Failed to parse'
      );
    });
  });

  describe('validateConfiguration', () => {
    it('returns true for valid sk- prefixed key', async () => {
      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });

      const result = await provider.validateConfiguration();

      expect(result).toBe(true);
    });

    it('returns false for invalid key format', async () => {
      const provider = new OpenAIProvider({ apiKey: 'invalid-key', model: TEST_MODEL });

      const result = await provider.validateConfiguration();

      expect(result).toBe(false);
    });
  });

  describe('testConnection', () => {
    it('checks the selected model is available to the API key', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });
      const result = await provider.testConnection();

      expect(result).toBe(true);
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        `https://api.openai.com/v1/models/${TEST_MODEL}`,
        expect.objectContaining({
          method: 'GET',
          headers: { Authorization: 'Bearer sk-test-key' },
        })
      );
    });

    it('returns false when the model or key is rejected', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });

      expect(await provider.testConnection()).toBe(false);
    });

    it('returns false on network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });

      expect(await provider.testConnection()).toBe(false);
    });
  });
});
describe('OpenAIProvider rate limiting', () => {
  const successBody = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            biomarkers: [{ name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.95 }],
            warnings: [],
          }),
        },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
  const rateLimited = () =>
    new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
      status: 429,
      headers: { 'retry-after': '0' },
    });
  const provider = () => new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });

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
});

describe('OpenAIProvider quota', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports an exhausted quota at once instead of retrying it as a rate limit', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'You exceeded your current quota, please check your plan and billing details.',
            code: 'insufficient_quota',
          },
        }),
        { status: 429 }
      )
    );
    const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });

    await expect(provider.analyzeLabReport('Glucose 95 mg/dL')).rejects.toThrow(/exceeded your current quota/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('passes on the test key the model gave', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify({ biomarkers: [ { name: 'Glicemia', value: 95, unit: 'mg/dL', confidence: 0.9, biomarkerKey: 'glucose' }, { name: 'Zorb', value: 1, unit: 'U', confidence: 0.9, biomarkerKey: null } ], warnings: [] }) }, finish_reason: 'stop' }] }),
    } as Response);

    const result = await new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL }).analyzeLabReport('Glicemia 95 mg/dL');

    expect(result.biomarkers.map((b) => b.biomarkerKey)).toEqual(['glucose', undefined]);
  });

  describe('chooseTests', () => {
    const requests = [
      {
        id: 'v1',
        name: 'Glucosio',
        unit: 'mg/dL',
        specimenHint: 'urine',
        candidates: [
          { code: '2350-7', name: 'Glucose [Mass/volume] in Urine' },
          { code: '2345-7', name: 'Glucose [Mass/volume] in Serum or Plasma' },
        ],
      },
      { id: 'v2', name: 'Creatinina', unit: 'mg/dL', candidates: [{ code: '2160-0', name: 'Creatinine [Mass/volume] in Serum or Plasma' }] },
    ];
    const answer = JSON.stringify({
      choices: [
        { id: 'v1', code: '2350-7', confident: true },
        { id: 'v2', code: '9999-9', confident: true },
      ],
    });

    it('sends one request per report with every candidate\'s code and name', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: answer }, finish_reason: 'stop' }] }),
      } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });
      const result = await provider.chooseTests(requests);

      expect(fetch).toHaveBeenCalledTimes(1);
      const body = JSON.stringify(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string).messages);
      for (const request of requests) {
        expect(body).toContain(request.name);
        for (const candidate of request.candidates) {
          expect(body).toContain(candidate.code);
          expect(body).toContain(candidate.name);
        }
      }
      expect(result).toEqual([
        { id: 'v1', code: '2350-7', confident: true },
        { id: 'v2', code: null, confident: false },
      ]);
    });

    it('makes no call without requests', async () => {
      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });
      expect(await provider.chooseTests([])).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('gives no choice for an answer it cannot read', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "not json" }, finish_reason: 'stop' }] }),
      } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });
      const result = await provider.chooseTests(requests);

      expect(result.map((c) => c.code)).toEqual([null, null]);
    });

    it('reports an API error without the key', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: 'Invalid key', type: 'x', code: 'invalid_api_key' } }),
      } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });
      const error = await provider.chooseTests(requests).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AIAnalysisError);
      expect((error as Error).message).not.toContain('sk-');
    });
  });
});
