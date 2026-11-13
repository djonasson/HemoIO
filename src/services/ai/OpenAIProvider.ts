/**
 * OpenAI Provider Implementation
 *
 * Implements the AIProvider interface for OpenAI's API.
 */

import {
  type AIProvider,
  type AIProviderConfig,
  type AIProviderType,
  type AnalysisOptions,
  type LabReportAnalysisResult,
  type TestChoice,
  type TestChoiceRequest,
  AIAnalysisError,
  AIConfigurationError,
} from './types';
import {
  LAB_REPORT_SYSTEM_PROMPT,
  createAnalysisPrompt,
} from './prompts';
import { chooseTestsWith } from './testChoice';
import { overallConfidence, parseExtraction } from './parseExtraction';
import { answerCutOffError, longerAnswerLimit } from './answerCutOff';
import { RESPONSE_SCHEMA_NAME, STRICT_RESPONSE_SCHEMA, STRUCTURED_OUTPUT_UNSUPPORTED } from './structuredOutput';
import { openAIOutputCap } from './openaiUtils';
import { fetchWithRateLimitRetry, type RateLimitOptions } from './rateLimitedFetch';
import { withoutKey } from './withoutKey';

/**
 * Default OpenAI configuration.
 *
 * There is deliberately no default model: the model is always the one the
 * user selected from their account's live model list.
 */
const DEFAULT_CONFIG = {
  maxTokens: 4096,
  temperature: 0.1, // Low temperature for consistent extraction
  baseUrl: 'https://api.openai.com/v1',
};

/**
 * Higher token limit for reasoning models (GPT-5, o1, o3, o4)
 * These models use "reasoning tokens" for internal chain-of-thought,
 * which consume most of the token budget before producing output.
 */
const REASONING_MODEL_MAX_TOKENS = 16384;

/**
 * OpenAI API response types
 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIChoice {
  message: {
    content: string;
  };
  finish_reason: string;
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    code: string;
    param?: string | null;
  };
}

/** Asks for an answer in the analysis schema's exact shape */
const STRUCTURED_FORMAT = {
  type: 'json_schema',
  json_schema: { name: RESPONSE_SCHEMA_NAME, schema: STRICT_RESPONSE_SCHEMA, strict: true },
};

/** Asks for any JSON object: for a model that rejects the schema */
const JSON_FORMAT = { type: 'json_object' };

/** Whether a rejected request was rejected for its response format, which an older model does not support */
function rejectsFormat(status: number, error: OpenAIErrorResponse['error'] | undefined): boolean {
  if (status !== 400 || !error) return false;
  return error.param === 'response_format' || /response_format|json_schema/i.test(error.message ?? '');
}

/** OpenAI answers 429 with code insufficient_quota when the account is out of credit */
async function isQuotaExhausted(response: Response): Promise<boolean> {
  const body = (await response.json().catch(() => ({}))) as OpenAIErrorResponse;
  return body.error?.code === 'insufficient_quota';
}

/**
 * OpenAI Provider for lab report analysis
 */
export class OpenAIProvider implements AIProvider {
  readonly type: AIProviderType = 'openai';
  readonly name = 'OpenAI';

  private config: Required<AIProviderConfig>;
  /** Whether the model rejected the schema format: later reports ask for plain JSON straight away */
  private structuredRejected = false;

  constructor(config: AIProviderConfig) {
    if (!config.apiKey) {
      throw new AIConfigurationError('API key is required', 'openai');
    }
    if (!config.model) {
      throw new AIConfigurationError(
        'No OpenAI model selected. Select a model in Settings → AI Configuration.',
        'openai'
      );
    }

    this.config = {
      apiKey: config.apiKey,
      model: config.model,
      maxTokens: config.maxTokens || DEFAULT_CONFIG.maxTokens,
      temperature: config.temperature ?? DEFAULT_CONFIG.temperature,
      baseUrl: config.baseUrl || DEFAULT_CONFIG.baseUrl,
    };
  }

  /**
   * Analyze lab report text using OpenAI
   */
  async analyzeLabReport(
    text: string,
    options: AnalysisOptions = {}
  ): Promise<LabReportAnalysisResult> {
    const startTime = performance.now();

    if (!text || text.trim().length === 0) {
      throw new AIAnalysisError('Lab report text is empty', 'openai');
    }

    const messages: OpenAIMessage[] = [
      { role: 'system', content: LAB_REPORT_SYSTEM_PROMPT },
      { role: 'user', content: createAnalysisPrompt(text, options) },
    ];

    try {
      const response = await this.requestAnswer(messages, options);
      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new AIAnalysisError('Empty response from OpenAI', 'openai');
      }

      const parsed = parseExtraction(content, 'openai');
      const processingTime = performance.now() - startTime;

      return {
        biomarkers: parsed.biomarkers,
        labDate: parsed.labDate,
        labName: parsed.labName,
        patientName: options.extractPatientInfo ? parsed.patientName : undefined,
        overallConfidence: overallConfidence(parsed.biomarkers),
        analyzedText: text,
        warnings: parsed.warnings || [],
        modelUsed: this.config.model,
        processingTime,
      };
    } catch (error) {
      if (error instanceof AIAnalysisError) {
        throw error;
      }
      throw new AIAnalysisError(
        `OpenAI analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        'openai'
      );
    }
  }

  /**
   * Choose the test of each printed value among its candidates, in one call
   */
  async chooseTests(
    requests: TestChoiceRequest[],
    options: Pick<AnalysisOptions, 'rateLimit' | 'signal'> = {}
  ): Promise<TestChoice[]> {
    return chooseTestsWith('openai', this.config.maxTokens, requests, async (system, user, maxTokens) => {
      const messages: OpenAIMessage[] = [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ];
      const response = await this.makeRequest(messages, { ...options, maxTokens });
      return response.choices[0]?.message?.content;
    });
  }

  /**
   * Validate the provider configuration
   */
  async validateConfiguration(): Promise<boolean> {
    if (!this.config.apiKey) {
      return false;
    }

    // Basic format validation for OpenAI API keys
    if (!this.config.apiKey.startsWith('sk-')) {
      return false;
    }

    return true;
  }

  /**
   * Test the connection to OpenAI.
   *
   * Looks up the selected model rather than sending a message: this checks
   * both the API key and that the model is available to it, without spending
   * tokens (a tiny completion would be consumed by reasoning models).
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.baseUrl}/models/${encodeURIComponent(this.config.model)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check if the model requires max_completion_tokens (newer models)
   */
  private useMaxCompletionTokens(): boolean {
    const model = this.config.model.toLowerCase();
    // GPT-5 series, o1, o3, o4 models use max_completion_tokens
    return (
      model.startsWith('gpt-5') ||
      model.startsWith('o1') ||
      model.startsWith('o3') ||
      model.startsWith('o4')
    );
  }

  /**
   * Check if the model supports custom temperature values
   * Some newer models only support the default temperature (1)
   */
  private supportsCustomTemperature(): boolean {
    const model = this.config.model.toLowerCase();
    // GPT-5 series, o1, o3, o4 models don't support custom temperature
    return !(
      model.startsWith('gpt-5') ||
      model.startsWith('o1') ||
      model.startsWith('o3') ||
      model.startsWith('o4')
    );
  }

  /**
   * Check if the model uses reasoning tokens (chain-of-thought)
   * These models need higher token limits as reasoning consumes most tokens
   */
  private isReasoningModel(): boolean {
    const model = this.config.model.toLowerCase();
    return (
      model.startsWith('gpt-5') ||
      model.startsWith('o1') ||
      model.startsWith('o3') ||
      model.startsWith('o4')
    );
  }

  /**
   * The analysis answer. One OpenAI stopped at the answer limit before it
   * was complete is asked again once with more room, never more than the
   * model can write.
   */
  private async requestAnswer(
    messages: OpenAIMessage[],
    options: Pick<AnalysisOptions, 'rateLimit' | 'signal'>
  ): Promise<OpenAIResponse> {
    const cap = openAIOutputCap(this.config.model);
    const first = Math.min(this.answerLimit(this.config.maxTokens), cap);
    const response = await this.requestStructured(messages, options, first);
    if (!isCutOff(response)) return response;

    const longer = longerAnswerLimit(first, cap);
    if (longer === undefined) throw answerCutOffError('openai', first, cap);
    const again = await this.requestStructured(messages, options, longer);
    if (isCutOff(again)) throw answerCutOffError('openai', longer, cap);
    return again;
  }

  /**
   * A request for an answer in the analysis schema's shape; asking for any
   * JSON object instead when the model does not support the schema
   */
  private async requestStructured(
    messages: OpenAIMessage[],
    options: Pick<AnalysisOptions, 'rateLimit' | 'signal'>,
    maxTokens: number
  ): Promise<OpenAIResponse> {
    if (!this.structuredRejected) {
      try {
        return await this.makeRequest(messages, { ...options, maxTokens, responseFormat: STRUCTURED_FORMAT });
      } catch (error) {
        if (!(error instanceof AIAnalysisError) || error.code !== STRUCTURED_OUTPUT_UNSUPPORTED) throw error;
        this.structuredRejected = true;
      }
    }
    return this.makeRequest(messages, { ...options, maxTokens });
  }

  /** The answer limit for `limit`: reasoning models spend tokens thinking, so they get a higher one */
  private answerLimit(limit: number): number {
    return this.isReasoningModel() ? Math.max(REASONING_MODEL_MAX_TOKENS, limit) : limit;
  }

  /**
   * Make a request to the OpenAI API, for a JSON object unless another
   * response format is given
   */
  private async makeRequest(
    messages: OpenAIMessage[],
    options: {
      rateLimit?: RateLimitOptions;
      signal?: AbortSignal;
      maxTokens?: number;
      responseFormat?: object;
    } = {}
  ): Promise<OpenAIResponse> {
    const url = `${this.config.baseUrl}/chat/completions`;
    const tokenLimit = this.answerLimit(options.maxTokens ?? this.config.maxTokens);
    const responseFormat = options.responseFormat ?? JSON_FORMAT;

    // Build request body with correct parameters for model
    const requestBody: Record<string, unknown> = {
      model: this.config.model,
      messages,
      response_format: responseFormat,
    };

    // Only include temperature for models that support it
    if (this.supportsCustomTemperature()) {
      requestBody.temperature = this.config.temperature;
    }

    // Use max_completion_tokens for newer models, max_tokens for older ones
    if (this.useMaxCompletionTokens()) {
      requestBody.max_completion_tokens = tokenLimit;
    } else {
      requestBody.max_tokens = tokenLimit;
    }

    const response = await fetchWithRateLimitRetry(
      'openai',
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: options.signal,
      },
      // An exhausted quota is a billing problem no wait fixes: it is reported
      // below with OpenAI's own message
      { ...options.rateLimit, shouldRetry: async (r) => !(await isQuotaExhausted(r)) }
    );

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as OpenAIErrorResponse;
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
      const formatRejected = responseFormat !== JSON_FORMAT && rejectsFormat(response.status, errorData.error);
      throw new AIAnalysisError(
        `OpenAI API error: ${withoutKey(errorMessage, this.config.apiKey)}`,
        'openai',
        formatRejected ? STRUCTURED_OUTPUT_UNSUPPORTED : errorData.error?.code
      );
    }

    return response.json() as Promise<OpenAIResponse>;
  }
}

/** Whether OpenAI stopped the answer at the answer limit before it was complete */
function isCutOff(response: OpenAIResponse): boolean {
  return response.choices[0]?.finish_reason === 'length';
}
