import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from './AnthropicProvider';
import { choiceAnswerLimit } from './testChoice';
import { AIAnalysisError, AIConfigurationError } from './types';
import { ANSWER_CUT_OFF } from './answerCutOff';
import { STRICT_RESPONSE_SCHEMA } from './structuredOutput';

// Model IDs come from the user's selection at runtime; tests use a placeholder
const TEST_MODEL = 'claude-test-model';

describe('AnthropicProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('creates provider with valid config', () => {
      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });

      expect(provider.type).toBe('anthropic');
      expect(provider.name).toBe('Anthropic Claude');
    });

    it('throws error without API key', () => {
      expect(() => new AnthropicProvider({ apiKey: '', model: TEST_MODEL })).toThrow(
        AIConfigurationError
      );
    });

    it('throws error without a model, instead of guessing one', () => {
      expect(() => new AnthropicProvider({ apiKey: 'sk-ant-test-key' })).toThrow(
        AIConfigurationError
      );
      expect(() => new AnthropicProvider({ apiKey: 'sk-ant-test-key' })).toThrow(
        /select a model/i
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
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
    };

    it('extracts biomarkers from lab report text', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLabReportResponse),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });
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

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });
      const result = await provider.analyzeLabReport('Lab report text');

      expect(result.labDate).toBe('2024-01-15');
      expect(result.labName).toBe('City Medical Lab');
    });

    it('calculates overall confidence', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLabReportResponse),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });
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
        model: 'claude-chosen-by-user',
      });
      const result = await provider.analyzeLabReport('Lab report text');

      expect(result.modelUsed).toBe('claude-chosen-by-user');
    });

    it('tracks processing time', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLabReportResponse),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });
      const result = await provider.analyzeLabReport('Lab report text');

      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('throws error for empty text', async () => {
      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });

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

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-invalid-key', model: TEST_MODEL });

      await expect(provider.analyzeLabReport('Lab report text')).rejects.toThrow(
        AIAnalysisError
      );
    });

    it('handles empty response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [] }),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });

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

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });

      await expect(provider.analyzeLabReport('Lab report text')).rejects.toThrow(
        'Failed to parse'
      );
    });

    it('reads the text block when the response starts with a thinking block', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ...mockLabReportResponse,
            content: [
              { type: 'thinking', thinking: '', signature: 'sig' },
              ...mockLabReportResponse.content,
            ],
          }),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });
      const result = await provider.analyzeLabReport('Lab report text');

      expect(result.biomarkers).toHaveLength(2);
      expect(result.biomarkers[0].name).toBe('Glucose');
    });

    it('sends the selected model and no sampling parameters', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLabReportResponse),
      } as Response);

      const provider = new AnthropicProvider({
        apiKey: 'sk-ant-test-key',
        model: 'claude-chosen-by-user',
        temperature: 0.1,
      });
      await provider.analyzeLabReport('Lab report text');

      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
      expect(body.model).toBe('claude-chosen-by-user');
      // Current models reject non-default sampling parameters with a 400
      expect(body).not.toHaveProperty('temperature');
      // Thinking tokens count against max_tokens, so leave room for the answer
      expect(body.max_tokens).toBeGreaterThanOrEqual(16000);
    });

    it('reports a refusal instead of failing to parse it', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [],
            stop_reason: 'refusal',
            stop_details: { type: 'refusal', category: null, explanation: null },
          }),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });

      await expect(provider.analyzeLabReport('Lab report text')).rejects.toThrow(
        /declined/i
      );
    });

    it('reports a truncated response when max_tokens is reached also when asked again', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'text', text: '{"biomarkers": [' }],
            stop_reason: 'max_tokens',
          }),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });

      await expect(provider.analyzeLabReport('Lab report text')).rejects.toThrow(
        /cut off/i
      );
    });

    it('sends correct headers for Anthropic API', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLabReportResponse),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });
      await provider.analyzeLabReport('Lab report text');

      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-test-key',
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          }),
        })
      );
    });
  });

  describe('validateConfiguration', () => {
    it('returns true for valid sk-ant- prefixed key', async () => {
      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });

      const result = await provider.validateConfiguration();

      expect(result).toBe(true);
    });

    it('returns false for invalid key format', async () => {
      const provider = new AnthropicProvider({ apiKey: 'sk-test-key', model: TEST_MODEL });

      const result = await provider.validateConfiguration();

      expect(result).toBe(false);
    });
  });

  describe('testConnection', () => {
    it('checks the selected model is available to the API key', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });
      const result = await provider.testConnection();

      expect(result).toBe(true);
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        `https://api.anthropic.com/v1/models/${TEST_MODEL}`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-test-key',
            'anthropic-dangerous-direct-browser-access': 'true',
          }),
        })
      );
    });

    it('returns false when the model or key is rejected', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });

      expect(await provider.testConnection()).toBe(false);
    });

    it('returns false on network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });

      expect(await provider.testConnection()).toBe(false);
    });
  });
});
describe('AnthropicProvider rate limiting', () => {
  const successBody = {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          biomarkers: [{ name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.95 }],
          warnings: [],
        }),
      },
    ],
    stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
  };
  const rateLimited = () =>
    new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
      status: 429,
      headers: { 'retry-after': '0' },
    });
  const provider = () => new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });

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

  it('passes on the sample the model named', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ biomarkers: [ { name: 'Glicemia', value: 95, unit: 'mg/dL', confidence: 0.9, specimenHint: 'serum' }, { name: 'Zorb', value: 1, unit: 'U', confidence: 0.9, specimenHint: null } ], warnings: [] }) }], stop_reason: 'end_turn' }),
    } as Response);

    const result = await new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL }).analyzeLabReport('Glicemia 95 mg/dL');

    expect(result.biomarkers.map((b) => b.specimenHint)).toEqual(['serum', undefined]);
  });

  it("keeps a censored value's comparator and the lab's flag", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ biomarkers: [ { name: 'Glucosio', value: '< 10', unit: 'mg/dL', confidence: 0.9 }, { name: 'PCR', value: 12, unit: 'mg/L', confidence: 0.9, flag: 'H' } ], warnings: [] }) }], stop_reason: 'end_turn' }),
    } as Response);

    const result = await new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL }).analyzeLabReport('Glucosio < 10 mg/dL');

    expect(result.biomarkers[0]).toMatchObject({ value: 10, censored: '<' });
    expect(result.biomarkers[0].labFlag).toBeUndefined();
    expect(result.biomarkers[1]).toMatchObject({ value: 12, labFlag: 'high' });
    expect(result.biomarkers[1].censored).toBeUndefined();
  });

  it('keeps a qualitative result as printed, with no unit', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ biomarkers: [ { name: 'Batteri', value: 0, unit: 'per campo', confidence: 0.9, qualitativeValue: 'Assenti' }, { name: 'Glicemia', value: 95, unit: 'mg/dL', confidence: 0.9 } ], warnings: [] }) }], stop_reason: 'end_turn' }),
    } as Response);

    const result = await new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL }).analyzeLabReport('Batteri Assenti');

    expect(result.biomarkers[0]).toMatchObject({
      value: 0,
      unit: '',
      qualitative: { text: 'Assenti', kind: 'boolean', value: 0 },
    });
    expect(result.biomarkers[1].qualitative).toBeUndefined();
  });
});

describe('AnthropicProvider prompt caching', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('marks the system prompt cacheable across files', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: 'text', text: '{"biomarkers":[],"warnings":[]}' }],
          stop_reason: 'end_turn',
        }),
    } as Response);

    await new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL }).analyzeLabReport(
      'Glucose 95 mg/dL'
    );

    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.system).toEqual([
      { type: 'text', text: expect.stringContaining('OUTPUT FORMAT'), cache_control: { type: 'ephemeral' } },
    ]);
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

    it('gives the answer room for every value of a long report', async () => {
      const many = Array.from({ length: 600 }, (_, i) => ({ ...requests[1], id: `v${i}` }));
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [{ type: 'text', text: '{"choices":[]}' }], stop_reason: 'end_turn' }),
      } as Response);

      await new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL }).chooseTests(many);

      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(body.max_tokens).toBe(choiceAnswerLimit(16000, 600));
    });

    it('sends one request per report with every candidate\'s code and name', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [{ type: 'text', text: answer }], stop_reason: 'end_turn' }),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });
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
      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });
      expect(await provider.chooseTests([])).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('gives no choice for an answer it cannot read', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [{ type: 'text', text: "not json" }], stop_reason: 'end_turn' }),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });
      const result = await provider.chooseTests(requests);

      expect(result.map((c) => c.code)).toEqual([null, null]);
    });

    it('reports an API error without the key', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: 'Incorrect API key provided: sk-ant-test-key', type: 'x', code: 'invalid_api_key' } }),
      } as Response);

      const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });
      const error = await provider.chooseTests(requests).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AIAnalysisError);
      expect((error as Error).message).not.toContain('sk-ant-test-key');
    });
  });
});

describe('AnthropicProvider answer shape and cut-off answers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const VALUES = JSON.stringify({ biomarkers: [{ name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.9 }], warnings: [] });
  const answer = (text: string, stopReason = 'end_turn') =>
    ({ ok: true, json: () => Promise.resolve({ content: [{ type: 'text', text }], stop_reason: stopReason }) }) as Response;
  const cutOff = () => answer('{"biomarkers": [', 'max_tokens');
  const modelInfo = (maxTokens: number) =>
    ({ ok: true, json: () => Promise.resolve({ id: TEST_MODEL, max_tokens: maxTokens }) }) as Response;
  const rejected = (message: string) =>
    ({ ok: false, status: 400, json: () => Promise.resolve({ error: { type: 'invalid_request_error', message } }) }) as unknown as Response;
  const call = (n: number) => vi.mocked(fetch).mock.calls[n];
  const body = (n: number) => JSON.parse(call(n)[1]?.body as string);
  const provider = () => new AnthropicProvider({ apiKey: 'sk-ant-test-key', model: TEST_MODEL });

  it('asks for an answer in the strict analysis schema, keeping the browser access header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(answer(VALUES));

    await provider().analyzeLabReport('Glucose 95 mg/dL');

    expect(body(0).output_config).toEqual({ format: { type: 'json_schema', schema: STRICT_RESPONSE_SCHEMA } });
    expect((call(0)[1]?.headers as Record<string, string>)['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('asks without structured output when the model rejects it, and keeps doing so', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(rejected('output_config.format: structured outputs are not supported for this model'))
      .mockResolvedValue(answer(VALUES));

    const anthropic = provider();
    const result = await anthropic.analyzeLabReport('Glucose 95 mg/dL');
    await anthropic.analyzeLabReport('Glucose 95 mg/dL');

    expect(result.biomarkers).toHaveLength(1);
    expect(body(1)).not.toHaveProperty('output_config');
    expect(body(2)).not.toHaveProperty('output_config');
  });

  it('keeps another rejection of the request as it is', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(rejected('prompt is too long: 1200000 tokens > 1000000 maximum'));

    await expect(provider().analyzeLabReport('Glucose 95 mg/dL')).rejects.toThrow(/prompt is too long/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("asks again with four times the room when cut off, within the model's own limit", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(cutOff())
      .mockResolvedValueOnce(modelInfo(128000))
      .mockResolvedValueOnce(answer(VALUES));

    const result = await provider().analyzeLabReport('Glucose 95 mg/dL');

    expect(result.biomarkers).toHaveLength(1);
    expect(String(call(1)[0])).toMatch(new RegExp(`/models/${TEST_MODEL}$`));
    expect(body(0).max_tokens).toBe(16000);
    expect(body(2).max_tokens).toBe(64000);
    expect(body(2).output_config).toBeDefined();
  });

  it('never asks for more than the model can write', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(cutOff())
      .mockResolvedValueOnce(modelInfo(32000))
      .mockResolvedValueOnce(answer(VALUES));

    await provider().analyzeLabReport('Glucose 95 mg/dL');

    expect(body(2).max_tokens).toBe(32000);
  });

  it('assumes a limit when the model cannot be looked up', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(cutOff())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(answer(VALUES));

    await provider().analyzeLabReport('Glucose 95 mg/dL');

    expect(body(2).max_tokens).toBe(32000);
  });

  it('fails clearly when the answer is cut off again', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(cutOff()).mockResolvedValueOnce(modelInfo(128000)).mockResolvedValueOnce(cutOff());

    const failure = await provider().analyzeLabReport('Glucose 95 mg/dL').catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(AIAnalysisError);
    expect((failure as AIAnalysisError).code).toBe(ANSWER_CUT_OFF);
    expect((failure as AIAnalysisError).message).toBe(
      "The AI's answer was cut off at HemoIO's limit of 64000 tokens before all values were read. " +
        'Split the report into smaller files and import them one by one.'
    );
  });

  it('reports a refusal when asked again', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(cutOff())
      .mockResolvedValueOnce(modelInfo(128000))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ content: [], stop_reason: 'refusal' }) } as Response);

    await expect(provider().analyzeLabReport('Glucose 95 mg/dL')).rejects.toThrow(/declined/);
  });

  it('asks which tests values are without the analysis schema', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(answer('{"choices":[]}'));

    await provider().chooseTests([
      { id: '0', name: 'Glucose', unit: 'mg/dL', candidates: [{ code: '2345-7', name: 'Glucose' }] },
    ]);

    expect(body(0)).not.toHaveProperty('output_config');
  });
});
