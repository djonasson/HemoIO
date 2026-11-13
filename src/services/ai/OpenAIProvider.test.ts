import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from './OpenAIProvider';
import { choiceAnswerLimit } from './testChoice';
import { AIAnalysisError, AIConfigurationError } from './types';
import { ANSWER_CUT_OFF } from './answerCutOff';
import { openAIOutputCap } from './openaiUtils';
import { RESPONSE_SCHEMA_NAME, STRICT_RESPONSE_SCHEMA } from './structuredOutput';

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
                  flag: null,
                },
                {
                  name: 'Hemoglobin',
                  value: 14.5,
                  unit: 'g/dL',
                  confidence: 0.92,
                  flag: null,
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

  it('passes on the sample the model named', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify({ biomarkers: [ { name: 'Glicemia', value: 95, unit: 'mg/dL', confidence: 0.9, specimenHint: 'serum' }, { name: 'Zorb', value: 1, unit: 'U', confidence: 0.9, specimenHint: null } ], warnings: [] }) }, finish_reason: 'stop' }] }),
    } as Response);

    const result = await new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL }).analyzeLabReport('Glicemia 95 mg/dL');

    expect(result.biomarkers.map((b) => b.specimenHint)).toEqual(['serum', undefined]);
  });

  it("keeps a censored value's comparator and the lab's flag", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify({ biomarkers: [ { name: 'Glucosio', value: '< 10', unit: 'mg/dL', confidence: 0.9 }, { name: 'PCR', value: 12, unit: 'mg/L', confidence: 0.9, flag: 'H' } ], warnings: [] }) }, finish_reason: 'stop' }] }),
    } as Response);

    const result = await new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL }).analyzeLabReport('Glucosio < 10 mg/dL');

    expect(result.biomarkers[0]).toMatchObject({ value: 10, censored: '<' });
    expect(result.biomarkers[0].labFlag).toBeUndefined();
    expect(result.biomarkers[1]).toMatchObject({ value: 12, labFlag: 'high' });
    expect(result.biomarkers[1].censored).toBeUndefined();
  });

  it('keeps a qualitative result as printed, with no unit', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify({ biomarkers: [ { name: 'Batteri', value: 0, unit: 'per campo', confidence: 0.9, qualitativeValue: 'Assenti' }, { name: 'Glicemia', value: 95, unit: 'mg/dL', confidence: 0.9 } ], warnings: [] }) }, finish_reason: 'stop' }] }),
    } as Response);

    const result = await new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL }).analyzeLabReport('Batteri Assenti');

    expect(result.biomarkers[0]).toMatchObject({
      value: 0,
      unit: '',
      qualitative: { text: 'Assenti', kind: 'boolean', value: 0 },
    });
    expect(result.biomarkers[1].qualitative).toBeUndefined();
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

    it('gives the answer room for every value of a long report', async () => {
      const many = Array.from({ length: 300 }, (_, i) => ({ ...requests[1], id: `v${i}` }));
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: '{"choices":[{"id":"v0","code":null}]}' }, finish_reason: 'stop' }] }),
      } as Response);

      await new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL }).chooseTests(many);

      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(body.max_completion_tokens ?? body.max_tokens).toBe(choiceAnswerLimit(4096, 300));
    });

    it('makes no call without requests', async () => {
      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });
      expect(await provider.chooseTests([])).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('fails an answer it cannot read, so its values are left to the user', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "not json" }, finish_reason: 'stop' }] }),
      } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });
      await expect(provider.chooseTests(requests)).rejects.toThrow('no choice to read');
    });

    it('reports an API error without the key', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: 'Incorrect API key provided: sk-test-key', type: 'x', code: 'invalid_api_key' } }),
      } as Response);

      const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });
      const error = await provider.chooseTests(requests).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AIAnalysisError);
      expect((error as Error).message).not.toContain('sk-test-key');
    });
  });
});

describe('OpenAIProvider answer shape and cut-off answers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const VALUES = JSON.stringify({ biomarkers: [{ name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.9 }], warnings: [] });
  const answer = (content: string, finishReason = 'stop') =>
    ({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content }, finish_reason: finishReason }] }) }) as Response;
  const rejected = (status: number, error: object) =>
    ({ ok: false, status, json: () => Promise.resolve({ error }) }) as unknown as Response;
  const body = (call: number) => JSON.parse(vi.mocked(fetch).mock.calls[call][1]?.body as string);
  const limit = (call: number) => body(call).max_completion_tokens ?? body(call).max_tokens;

  it('asks for an answer in the strict analysis schema', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(answer(VALUES));

    await new OpenAIProvider({ apiKey: 'sk-test-key', model: 'gpt-4.1' }).analyzeLabReport('Glucose 95 mg/dL');

    expect(body(0).response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: RESPONSE_SCHEMA_NAME, schema: STRICT_RESPONSE_SCHEMA, strict: true },
    });
  });

  it('asks for any JSON object when the model rejects the schema, and keeps doing so', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        rejected(400, {
          message: "Invalid parameter: 'response_format' of type 'json_schema' is not supported with this model.",
          type: 'invalid_request_error',
          param: 'response_format',
          code: null,
        })
      )
      .mockResolvedValue(answer(VALUES));

    const provider = new OpenAIProvider({ apiKey: 'sk-test-key', model: 'gpt-4-turbo' });
    const result = await provider.analyzeLabReport('Glucose 95 mg/dL');
    await provider.analyzeLabReport('Glucose 95 mg/dL');

    expect(result.biomarkers).toHaveLength(1);
    expect(body(1).response_format).toEqual({ type: 'json_object' });
    expect(body(2).response_format).toEqual({ type: 'json_object' });
  });

  it('keeps another rejection of the request as it is', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      rejected(400, { message: 'This model has a maximum context length of 8192 tokens.', type: 'invalid_request_error', code: 'context_length_exceeded' })
    );

    const failure = await new OpenAIProvider({ apiKey: 'sk-test-key', model: 'gpt-4' })
      .analyzeLabReport('Glucose 95 mg/dL')
      .catch((e: unknown) => e);

    expect((failure as AIAnalysisError).code).toBe('context_length_exceeded');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('asks again with four times the room when the answer was cut off', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(answer('{"biomarkers": [', 'length')).mockResolvedValueOnce(answer(VALUES));

    const result = await new OpenAIProvider({ apiKey: 'sk-test-key', model: 'gpt-4.1' }).analyzeLabReport('Glucose 95 mg/dL');

    expect(result.biomarkers).toHaveLength(1);
    expect(limit(0)).toBe(4096);
    expect(limit(1)).toBe(16384);
  });

  it('never asks for more than the model can write', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(answer('{"biomarkers": [', 'length')).mockResolvedValueOnce(answer(VALUES));

    await new OpenAIProvider({ apiKey: 'sk-test-key', model: 'gpt-4', maxTokens: 4096 }).analyzeLabReport('Glucose 95 mg/dL');

    expect(limit(1)).toBe(openAIOutputCap('gpt-4'));
  });

  it('gives a reasoning model its larger room, four times over, when cut off', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(answer('', 'length')).mockResolvedValueOnce(answer(VALUES));

    await new OpenAIProvider({ apiKey: 'sk-test-key', model: 'gpt-5-mini' }).analyzeLabReport('Glucose 95 mg/dL');

    expect(body(0).max_completion_tokens).toBe(16384);
    expect(body(1).max_completion_tokens).toBe(65536);
  });

  it('fails clearly when the answer is cut off again', async () => {
    vi.mocked(fetch).mockResolvedValue(answer('{"biomarkers": [', 'length'));

    const failure = await new OpenAIProvider({ apiKey: 'sk-test-key', model: 'gpt-4.1' })
      .analyzeLabReport('Glucose 95 mg/dL')
      .catch((e: unknown) => e);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(failure).toBeInstanceOf(AIAnalysisError);
    expect((failure as AIAnalysisError).code).toBe(ANSWER_CUT_OFF);
    expect((failure as AIAnalysisError).message).toBe(
      "The AI's answer was cut off at HemoIO's limit of 16384 tokens before all values were read. " +
        'Split the report into smaller files and import them one by one.'
    );
  });

  it("says the model's own limit was reached when there is no more room to ask for", async () => {
    vi.mocked(fetch).mockResolvedValue(answer('{"biomarkers": [', 'length'));

    const failure = await new OpenAIProvider({ apiKey: 'sk-test-key', model: 'gpt-4', maxTokens: 8192 })
      .analyzeLabReport('Glucose 95 mg/dL')
      .catch((e: unknown) => e);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect((failure as Error).message).toMatch(/cut off at the model's limit of 8192 tokens/);
  });

  it('asks which tests values are for any JSON object, not in the analysis schema', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(answer('{"choices":[{"id":"0","code":null}]}'));

    await new OpenAIProvider({ apiKey: 'sk-test-key', model: 'gpt-4.1' }).chooseTests([
      { id: '0', name: 'Glucose', unit: 'mg/dL', candidates: [{ code: '2345-7', name: 'Glucose' }] },
    ]);

    expect(body(0).response_format).toEqual({ type: 'json_object' });
  });
});

describe('openAIOutputCap', () => {
  it.each([
    ['gpt-5', 128000],
    ['gpt-5-chat-latest', 16384],
    ['o3-mini', 100000],
    ['gpt-4.1-mini', 32768],
    ['gpt-4o', 16384],
    ['gpt-4-turbo', 4096],
    ['gpt-4', 8192],
    ['gpt-3.5-turbo', 4096],
    ['some-new-model', 16384],
  ])('%s writes at most %d tokens', (model, cap) => {
    expect(openAIOutputCap(model)).toBe(cap);
  });
});
