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
  type ExtractedBiomarker,
  AIAnalysisError,
  AIConfigurationError,
} from './types';
import {
  ENHANCED_SYSTEM_PROMPT,
  createAnalysisPrompt,
  CONNECTION_TEST_PROMPT,
} from './prompts';

/**
 * Default OpenAI configuration
 */
const DEFAULT_CONFIG = {
  model: 'gpt-4o-mini',
  maxTokens: 4096,
  temperature: 0.1, // Low temperature for consistent extraction
  baseUrl: 'https://api.openai.com/v1',
};

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
  };
}

/**
 * OpenAI Provider for lab report analysis
 */
export class OpenAIProvider implements AIProvider {
  readonly type: AIProviderType = 'openai';
  readonly name = 'OpenAI';

  private config: Required<AIProviderConfig>;

  constructor(config: AIProviderConfig) {
    if (!config.apiKey) {
      throw new AIConfigurationError('API key is required', 'openai');
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
      { role: 'system', content: ENHANCED_SYSTEM_PROMPT },
      { role: 'user', content: createAnalysisPrompt(text, options) },
    ];

    try {
      const response = await this.makeRequest(messages);
      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new AIAnalysisError('Empty response from OpenAI', 'openai');
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
        `OpenAI analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        'openai'
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

    // Basic format validation for OpenAI API keys
    if (!this.config.apiKey.startsWith('sk-')) {
      return false;
    }

    return true;
  }

  /**
   * Test the connection to OpenAI
   */
  async testConnection(): Promise<boolean> {
    try {
      const messages: OpenAIMessage[] = [
        { role: 'user', content: CONNECTION_TEST_PROMPT },
      ];

      const response = await this.makeRequest(messages, { maxTokens: 10 });
      const content = response.choices[0]?.message?.content?.trim();

      return content === 'OK';
    } catch {
      return false;
    }
  }

  /**
   * Make a request to the OpenAI API
   */
  private async makeRequest(
    messages: OpenAIMessage[],
    options: { maxTokens?: number } = {}
  ): Promise<OpenAIResponse> {
    const url = `${this.config.baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: options.maxTokens || this.config.maxTokens,
        temperature: this.config.temperature,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as OpenAIErrorResponse;
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
      throw new AIAnalysisError(
        `OpenAI API error: ${errorMessage}`,
        'openai',
        errorData.error?.code
      );
    }

    return response.json() as Promise<OpenAIResponse>;
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
        (b: Record<string, unknown>) => ({
          name: String(b.name || ''),
          value: Number(b.value) || 0,
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
          confidence: Math.max(0, Math.min(1, Number(b.confidence) || 0.5)),
          notes: b.notes ? String(b.notes) : undefined,
          flaggedAbnormal: Boolean(b.flaggedAbnormal),
        })
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
        `Failed to parse OpenAI response: ${error instanceof Error ? error.message : String(error)}`,
        'openai'
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
