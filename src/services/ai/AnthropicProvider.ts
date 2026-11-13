/**
 * Anthropic Provider Implementation
 *
 * Implements the AIProvider interface for Anthropic's Claude API.
 */

import type {
  AIProvider,
  AIProviderConfig,
  AIProviderType,
  AnalysisOptions,
  LabReportAnalysisResult,
  TestChoice,
  TestChoiceRequest,
} from './types';
import { AIAnalysisError, AIConfigurationError } from './types';
import {
  LAB_REPORT_SYSTEM_PROMPT,
  createAnalysisPrompt,
} from './prompts';
import { chooseTestsWith } from './testChoice';
import { overallConfidence, parseExtraction } from './parseExtraction';
import { askWithLongerRetry } from './answerCutOff';
import { STRICT_RESPONSE_SCHEMA, StructuredOutputFallback, STRUCTURED_OUTPUT_UNSUPPORTED } from './structuredOutput';
import { fetchWithRateLimitRetry, type RateLimitOptions } from './rateLimitedFetch';
import { ANTHROPIC_API_HEADERS } from './anthropicUtils';
import { withoutKey } from './withoutKey';

/**
 * Default Anthropic configuration.
 *
 * There is deliberately no default model: the model is always the one the
 * user selected from their account's live model list, so the app never
 * calls a model that has been retired or that the user did not choose.
 */
const DEFAULT_CONFIG = {
  // Current models think before answering and thinking tokens count against
  // max_tokens, so leave enough room for the extraction JSON itself.
  maxTokens: 16000,
  baseUrl: 'https://api.anthropic.com/v1',
};

/**
 * The most a model is assumed to write when its own limit cannot be looked
 * up: what the oldest models still offered can write
 */
const FALLBACK_OUTPUT_CAP = 32000;

/** Asks for an answer in the analysis schema's exact shape (JSON outputs) */
const STRUCTURED_OUTPUT_CONFIG = {
  format: { type: 'json_schema', schema: STRICT_RESPONSE_SCHEMA },
};

/** Whether a rejected request was rejected for its structured output, which an older model does not support */
function rejectsFormat(status: number, message: string | undefined): boolean {
  return status === 400 && /output_config|output_format|json_schema|schema|structured/i.test(message ?? '');
}

/**
 * Anthropic API message types
 */
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason: string | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicErrorResponse {
  error: {
    type: string;
    message: string;
  };
}

/**
 * Anthropic Provider for lab report analysis
 */
export class AnthropicProvider implements AIProvider {
  readonly type: AIProviderType = 'anthropic';
  readonly name = 'Anthropic Claude';

  // Sampling parameters (temperature) are not sent: current Claude models
  // reject non-default values with a 400.
  private config: Required<Omit<AIProviderConfig, 'temperature'>>;
  /** Once the model rejects structured output, later reports ask without it straight away */
  private structuredOutput = new StructuredOutputFallback();
  /** The most the model can write, once looked up */
  private outputCap: number | undefined;

  constructor(config: AIProviderConfig) {
    if (!config.apiKey) {
      throw new AIConfigurationError('API key is required', 'anthropic');
    }
    if (!config.model) {
      throw new AIConfigurationError(
        'No Anthropic model selected. Select a model in Settings → AI Configuration.',
        'anthropic'
      );
    }

    this.config = {
      apiKey: config.apiKey,
      model: config.model,
      maxTokens: config.maxTokens || DEFAULT_CONFIG.maxTokens,
      baseUrl: config.baseUrl || DEFAULT_CONFIG.baseUrl,
    };
  }

  /**
   * Analyze lab report text using Anthropic Claude
   */
  async analyzeLabReport(
    text: string,
    options: AnalysisOptions = {}
  ): Promise<LabReportAnalysisResult> {
    const startTime = performance.now();

    if (!text || text.trim().length === 0) {
      throw new AIAnalysisError('Lab report text is empty', 'anthropic');
    }

    const messages: AnthropicMessage[] = [
      { role: 'user', content: createAnalysisPrompt(text, options) },
    ];

    try {
      const response = await this.requestAnswer(messages, options);

      // Responses may start with thinking blocks; the answer is in the text block
      const content = response.content.find((block) => block.type === 'text')?.text;

      if (!content) {
        throw new AIAnalysisError('Empty response from Anthropic', 'anthropic');
      }

      const parsed = parseExtraction(content, 'anthropic');
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
        `Anthropic analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        'anthropic'
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
    return chooseTestsWith('anthropic', this.config.maxTokens, requests, async (system, user, answerLimit) => {
      const messages: AnthropicMessage[] = [{ role: 'user', content: user }];
      const response = await this.makeRequest(messages, system, options.rateLimit, options.signal, answerLimit);
      // Thinking blocks may come first; a refusal has no readable choices, which is no choice for any value
      return response.content.find((block) => block.type === 'text')?.text;
    });
  }

  /**
   * Validate the provider configuration
   */
  async validateConfiguration(): Promise<boolean> {
    if (!this.config.apiKey) {
      return false;
    }

    // Basic format validation for Anthropic API keys
    if (!this.config.apiKey.startsWith('sk-ant-')) {
      return false;
    }

    return true;
  }

  /**
   * Test the connection to Anthropic.
   *
   * Looks up the selected model rather than sending a message: this checks
   * both the API key and that the model is available to it, without spending
   * tokens (a tiny message would be consumed by thinking on current models).
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.baseUrl}/models/${encodeURIComponent(this.config.model)}`,
        {
          method: 'GET',
          headers: {
            'x-api-key': this.config.apiKey,
            ...ANTHROPIC_API_HEADERS,
          },
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * The analysis answer. One Claude stopped at the answer limit before it
   * was complete is asked again once with more room, never more than the
   * model can write.
   */
  private async requestAnswer(
    messages: AnthropicMessage[],
    options: Pick<AnalysisOptions, 'rateLimit' | 'signal'>
  ): Promise<AnthropicResponse> {
    return askWithLongerRetry(
      'anthropic',
      this.config.maxTokens,
      () => this.modelOutputCap(options.signal),
      (maxTokens) => this.requestStructured(messages, options, maxTokens),
      (response) => response.stop_reason === 'max_tokens'
    );
  }

  /**
   * A request for an answer in the analysis schema's shape; without it when
   * the model does not support structured output. A refusal is an error.
   */
  private async requestStructured(
    messages: AnthropicMessage[],
    { rateLimit, signal }: Pick<AnalysisOptions, 'rateLimit' | 'signal'>,
    maxTokens: number
  ): Promise<AnthropicResponse> {
    const response = await this.structuredOutput.request(
      () => this.makeRequest(messages, LAB_REPORT_SYSTEM_PROMPT, rateLimit, signal, maxTokens, STRUCTURED_OUTPUT_CONFIG),
      () => this.makeRequest(messages, LAB_REPORT_SYSTEM_PROMPT, rateLimit, signal, maxTokens)
    );
    if (response.stop_reason === 'refusal') {
      throw new AIAnalysisError('Anthropic declined to analyze this document', 'anthropic', 'refusal');
    }
    return response;
  }

  /**
   * The most the model can write, as the Models API gives it; an assumed
   * limit when it cannot be looked up
   */
  private async modelOutputCap(signal?: AbortSignal): Promise<number> {
    if (this.outputCap !== undefined) return this.outputCap;
    try {
      const response = await fetch(`${this.config.baseUrl}/models/${encodeURIComponent(this.config.model)}`, {
        method: 'GET',
        headers: { 'x-api-key': this.config.apiKey, ...ANTHROPIC_API_HEADERS },
        signal,
      });
      const model = response.ok ? ((await response.json()) as { max_tokens?: unknown }) : undefined;
      if (typeof model?.max_tokens === 'number' && model.max_tokens > 0) {
        this.outputCap = model.max_tokens;
        return model.max_tokens;
      }
    } catch {
      // An assumed limit below
    }
    return FALLBACK_OUTPUT_CAP;
  }

  /**
   * Make a request to the Anthropic API
   */
  private async makeRequest(
    messages: AnthropicMessage[],
    systemPrompt: string,
    rateLimit?: RateLimitOptions,
    signal?: AbortSignal,
    maxTokens: number = this.config.maxTokens,
    outputConfig?: object
  ): Promise<AnthropicResponse> {
    const url = `${this.config.baseUrl}/messages`;

    const response = await fetchWithRateLimitRetry('anthropic', url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        ...ANTHROPIC_API_HEADERS,
      },
      body: JSON.stringify({
        model: this.config.model,
        // Cached: the same instructions and test list open every file's request
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages,
        max_tokens: maxTokens,
        ...(outputConfig ? { output_config: outputConfig } : {}),
      }),
      signal,
    }, rateLimit);

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as AnthropicErrorResponse;
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
      const formatRejected = outputConfig !== undefined && rejectsFormat(response.status, errorData.error?.message);
      throw new AIAnalysisError(
        `Anthropic API error: ${withoutKey(errorMessage, this.config.apiKey)}`,
        'anthropic',
        formatRejected ? STRUCTURED_OUTPUT_UNSUPPORTED : errorData.error?.type
      );
    }

    return response.json() as Promise<AnthropicResponse>;
  }
}
