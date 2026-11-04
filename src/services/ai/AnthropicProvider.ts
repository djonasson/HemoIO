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
  ExtractedBiomarker,
  TestChoice,
  TestChoiceRequest,
} from './types';
import { AIAnalysisError, AIConfigurationError } from './types';
import {
  LAB_REPORT_SYSTEM_PROMPT,
  createAnalysisPrompt,
  createTestChoicePrompt,
  TEST_CHOICE_SYSTEM_PROMPT,
} from './prompts';
import { choiceAnswerLimit, parseTestChoices } from './testChoice';
import { parseIntervalValue } from './parseIntervalValue';
import { withSpecimenHint } from './specimenHint';
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
      const response = await this.makeRequest(
        messages,
        LAB_REPORT_SYSTEM_PROMPT,
        options.rateLimit,
        options.signal
      );

      if (response.stop_reason === 'refusal') {
        throw new AIAnalysisError(
          'Anthropic declined to analyze this document',
          'anthropic',
          'refusal'
        );
      }
      if (response.stop_reason === 'max_tokens') {
        throw new AIAnalysisError(
          'Anthropic response was cut off before the results were complete',
          'anthropic',
          'max_tokens'
        );
      }

      // Responses may start with thinking blocks; the answer is in the text block
      const content = response.content.find((block) => block.type === 'text')?.text;

      if (!content) {
        throw new AIAnalysisError('Empty response from Anthropic', 'anthropic');
      }

      const parsed = this.parseResponse(content);
      const processingTime = performance.now() - startTime;

      return {
        biomarkers: parsed.biomarkers,
        labDate: parsed.labDate,
        labName: parsed.labName,
        patientName: options.extractPatientInfo ? parsed.patientName : undefined,
        overallConfidence: this.calculateOverallConfidence(parsed.biomarkers),
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
    if (requests.length === 0) return [];

    const messages: AnthropicMessage[] = [
      { role: 'user', content: createTestChoicePrompt(requests) },
    ];

    try {
      const response = await this.makeRequest(
        messages,
        TEST_CHOICE_SYSTEM_PROMPT,
        options.rateLimit,
        options.signal,
        choiceAnswerLimit(this.config.maxTokens, requests.length)
      );
      // Thinking blocks may come first; a refusal has no readable choices,
      // which is no choice for any value; a cut-off keeps those it completed
      const content = response.content.find((block) => block.type === 'text')?.text;
      return parseTestChoices(content, requests);
    } catch (error) {
      if (error instanceof AIAnalysisError) {
        throw error;
      }
      throw new AIAnalysisError(
        `Anthropic test choice failed: ${error instanceof Error ? error.message : String(error)}`,
        'anthropic'
      );
    }
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
   * Make a request to the Anthropic API
   */
  private async makeRequest(
    messages: AnthropicMessage[],
    systemPrompt: string,
    rateLimit?: RateLimitOptions,
    signal?: AbortSignal,
    maxTokens: number = this.config.maxTokens
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
      }),
      signal,
    }, rateLimit);

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as AnthropicErrorResponse;
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
      throw new AIAnalysisError(
        `Anthropic API error: ${withoutKey(errorMessage, this.config.apiKey)}`,
        'anthropic',
        errorData.error?.type
      );
    }

    return response.json() as Promise<AnthropicResponse>;
  }

  /**
   * Parse the AI response into structured data
   */
  private parseResponse(content: string): {
    biomarkers: ExtractedBiomarker[];
    labDate?: string;
    labName?: string;
    patientName?: string;
    warnings: string[];
  } {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }

      const data = JSON.parse(jsonMatch[0]);

      // Validate and normalize biomarkers
      const biomarkers: ExtractedBiomarker[] = (data.biomarkers || []).map(
        (b: Record<string, unknown>) => {
          // Parse the value, detecting intervals like "5-10"
          const parsedValue = parseIntervalValue(b.value);

          return {
            name: String(b.name || ''),
            ...withSpecimenHint(b),
            value: parsedValue.value,
            unit: String(b.unit || ''),
            referenceRange: b.referenceRange
              ? {
                  low: typeof (b.referenceRange as Record<string, unknown>).low === 'number'
                    ? (b.referenceRange as Record<string, unknown>).low as number
                    : undefined,
                  high: typeof (b.referenceRange as Record<string, unknown>).high === 'number'
                    ? (b.referenceRange as Record<string, unknown>).high as number
                    : undefined,
                  unit: String((b.referenceRange as Record<string, unknown>).unit || b.unit || ''),
                }
              : undefined,
            method: b.method ? String(b.method) : undefined,
            confidence: Math.max(0, Math.min(1, Number(b.confidence) || 0.5)),
            notes: b.notes ? String(b.notes) : undefined,
            flaggedAbnormal: Boolean(b.flaggedAbnormal),
            isInterval: parsedValue.isInterval,
            intervalLow: parsedValue.intervalLow,
            intervalHigh: parsedValue.intervalHigh,
            rawValue: parsedValue.rawValue,
          };
        }
      );

      return {
        biomarkers,
        labDate: data.labDate ? String(data.labDate) : undefined,
        labName: data.labName ? String(data.labName) : undefined,
        patientName: data.patientName ? String(data.patientName) : undefined,
        warnings: Array.isArray(data.warnings)
          ? data.warnings.map((w: unknown) => String(w))
          : [],
      };
    } catch (error) {
      throw new AIAnalysisError(
        `Failed to parse Anthropic response: ${error instanceof Error ? error.message : String(error)}`,
        'anthropic'
      );
    }
  }

  /**
   * Calculate overall confidence from individual biomarker confidences
   */
  private calculateOverallConfidence(biomarkers: ExtractedBiomarker[]): number {
    if (biomarkers.length === 0) return 0;

    const sum = biomarkers.reduce((acc, b) => acc + b.confidence, 0);
    return sum / biomarkers.length;
  }
}
