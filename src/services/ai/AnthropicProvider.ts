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
} from './types';
import { AIAnalysisError, AIConfigurationError } from './types';
import {
  ENHANCED_SYSTEM_PROMPT,
  createAnalysisPrompt,
  CONNECTION_TEST_PROMPT,
} from './prompts';
import { parseIntervalValue } from './parseIntervalValue';

/**
 * Default Anthropic configuration
 */
const DEFAULT_CONFIG = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.1, // Low temperature for consistent extraction
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
  type: 'text';
  text: string;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason: string;
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

  private config: Required<AIProviderConfig>;

  constructor(config: AIProviderConfig) {
    if (!config.apiKey) {
      throw new AIConfigurationError('API key is required', 'anthropic');
    }

    this.config = {
      apiKey: config.apiKey,
      model: config.model || DEFAULT_CONFIG.model,
      maxTokens: config.maxTokens || DEFAULT_CONFIG.maxTokens,
      temperature: config.temperature ?? DEFAULT_CONFIG.temperature,
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
      const response = await this.makeRequest(messages, ENHANCED_SYSTEM_PROMPT);
      const content = response.content[0]?.text;

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
   * Test the connection to Anthropic
   */
  async testConnection(): Promise<boolean> {
    try {
      const messages: AnthropicMessage[] = [
        { role: 'user', content: CONNECTION_TEST_PROMPT },
      ];

      const response = await this.makeRequest(
        messages,
        'You are a helpful assistant.',
        { maxTokens: 10 }
      );
      const content = response.content[0]?.text?.trim();

      return content === 'OK';
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
    options: { maxTokens?: number } = {}
  ): Promise<AnthropicResponse> {
    const url = `${this.config.baseUrl}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        system: systemPrompt,
        messages,
        max_tokens: options.maxTokens || this.config.maxTokens,
        temperature: this.config.temperature,
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as AnthropicErrorResponse;
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
      throw new AIAnalysisError(
        `Anthropic API error: ${errorMessage}`,
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
