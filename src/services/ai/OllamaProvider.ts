/**
 * Ollama Provider Implementation
 *
 * Implements the AIProvider interface for local Ollama models.
 * Supports both text and vision-based analysis of lab reports.
 */

import {
  type AIProvider,
  type AIProviderType,
  type OllamaConfig,
  type AnalysisOptions,
  type LabReportAnalysisResult,
  type ExtractedBiomarker,
  AIAnalysisError,
} from './types';
import {
  ENHANCED_SYSTEM_PROMPT,
  createAnalysisPrompt,
} from './prompts';
import {
  OLLAMA_DEFAULTS,
  isOllamaRunning,
  getModelNames,
  selectBestTextModel,
  selectBestVisionModel,
  isVisionModel,
  parseOllamaError,
  cleanUnitAndExtractRange,
} from './ollamaUtils';

/**
 * OpenAI-compatible chat message type
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContent[];
}

/**
 * Multimodal content for vision messages
 */
type ChatContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/**
 * OpenAI-compatible response type
 */
interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
    finish_reason: string;
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Ollama Provider for local AI analysis of lab reports
 *
 * Uses Ollama's OpenAI-compatible API for text analysis
 * and native API for vision analysis.
 */
export class OllamaProvider implements AIProvider {
  readonly type: AIProviderType = 'ollama';
  readonly name = 'Ollama (Local)';

  private baseUrl: string;
  private model: string;
  private visionModel: string | undefined;
  private enableVision: boolean;
  private timeout: number;
  private temperature: number;
  private maxTokens: number;

  constructor(config: OllamaConfig = {}) {
    this.baseUrl = config.baseUrl || OLLAMA_DEFAULTS.baseUrl;
    this.model = config.model || 'llama3.2:8b'; // Will auto-detect if not available
    this.visionModel = config.visionModel;
    this.enableVision = config.enableVision ?? true;
    this.timeout = config.timeout || OLLAMA_DEFAULTS.timeout;
    this.temperature = config.temperature ?? OLLAMA_DEFAULTS.temperature;
    this.maxTokens = config.maxTokens || OLLAMA_DEFAULTS.maxTokens;
  }

  /**
   * Analyze lab report text using Ollama
   */
  async analyzeLabReport(
    text: string,
    options: AnalysisOptions = {}
  ): Promise<LabReportAnalysisResult> {
    const startTime = performance.now();

    if (!text || text.trim().length === 0) {
      throw new AIAnalysisError('Lab report text is empty', 'ollama');
    }

    // Ensure we have a valid model
    const modelToUse = await this.ensureModel();

    const messages: ChatMessage[] = [
      { role: 'system', content: ENHANCED_SYSTEM_PROMPT },
      { role: 'user', content: createAnalysisPrompt(text, options) },
    ];

    try {
      const response = await this.makeChatRequest(messages, modelToUse);
      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new AIAnalysisError('Empty response from Ollama', 'ollama');
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
        modelUsed: modelToUse,
        processingTime,
      };
    } catch (error) {
      if (error instanceof AIAnalysisError) {
        throw error;
      }
      throw new AIAnalysisError(
        `Ollama analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        'ollama'
      );
    }
  }

  /**
   * Analyze lab report image directly using a vision model
   */
  async analyzeImage(
    imageBase64: string,
    mimeType: string,
    options: AnalysisOptions = {}
  ): Promise<LabReportAnalysisResult> {
    const startTime = performance.now();

    if (!imageBase64) {
      throw new AIAnalysisError('Image data is empty', 'ollama');
    }

    // Ensure we have a vision model
    const modelToUse = await this.ensureVisionModel();

    if (!modelToUse) {
      throw new AIAnalysisError(
        'No vision model available. Install a vision model like llava:13b or llama3.2-vision:11b',
        'ollama'
      );
    }

    // Build multimodal message with image
    const userContent: ChatContent[] = [
      {
        type: 'text',
        text: this.createVisionPrompt(options),
      },
      {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${imageBase64}`,
        },
      },
    ];

    const messages: ChatMessage[] = [
      { role: 'system', content: ENHANCED_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ];

    try {
      const response = await this.makeChatRequest(messages, modelToUse);
      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new AIAnalysisError('Empty response from Ollama vision model', 'ollama');
      }

      const parsed = this.parseResponse(content);
      const processingTime = performance.now() - startTime;

      return {
        biomarkers: parsed.biomarkers,
        labDate: parsed.labDate,
        labName: parsed.labName,
        patientName: options.extractPatientInfo ? parsed.patientName : undefined,
        overallConfidence: this.calculateOverallConfidence(parsed.biomarkers),
        analyzedText: '[Image analysis - no text extracted]',
        warnings: parsed.warnings || [],
        modelUsed: modelToUse,
        processingTime,
      };
    } catch (error) {
      if (error instanceof AIAnalysisError) {
        throw error;
      }
      throw new AIAnalysisError(
        `Ollama vision analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        'ollama'
      );
    }
  }

  /**
   * Check if this provider supports vision/image analysis
   */
  supportsVision(): boolean {
    return this.enableVision && this.visionModel !== undefined;
  }

  /**
   * Validate the provider configuration
   */
  async validateConfiguration(): Promise<boolean> {
    // Ollama doesn't require an API key
    // Just check if the configured model is available
    const running = await isOllamaRunning(this.baseUrl);
    if (!running) {
      return false;
    }

    const models = await getModelNames(this.baseUrl);
    return models.length > 0;
  }

  /**
   * Test the connection to Ollama
   */
  async testConnection(): Promise<boolean> {
    return isOllamaRunning(this.baseUrl, 5000);
  }

  /**
   * Get available models from Ollama
   */
  async getAvailableModels(): Promise<string[]> {
    return getModelNames(this.baseUrl);
  }

  /**
   * Check if a vision model is available
   */
  async isVisionModelAvailable(): Promise<boolean> {
    const models = await getModelNames(this.baseUrl);
    const visionModel = selectBestVisionModel(models);
    return visionModel !== undefined;
  }

  /**
   * Get the currently configured model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Get the currently configured vision model
   */
  getVisionModel(): string | undefined {
    return this.visionModel;
  }

  /**
   * Update the model configuration
   */
  setModel(model: string): void {
    this.model = model;
  }

  /**
   * Update the vision model configuration
   */
  setVisionModel(model: string | undefined): void {
    this.visionModel = model;
  }

  /**
   * Auto-detect and configure the best available models
   */
  async autoConfigureModels(): Promise<{
    textModel: string | undefined;
    visionModel: string | undefined;
  }> {
    const models = await getModelNames(this.baseUrl);

    const textModel = selectBestTextModel(models);
    const visionModel = this.enableVision ? selectBestVisionModel(models) : undefined;

    if (textModel) {
      this.model = textModel;
    }
    if (visionModel) {
      this.visionModel = visionModel;
    }

    return { textModel, visionModel };
  }

  /**
   * Ensure a valid text model is available
   */
  private async ensureModel(): Promise<string> {
    const models = await getModelNames(this.baseUrl);

    if (models.length === 0) {
      throw new AIAnalysisError(
        'No models available in Ollama. Please install a model (e.g., ollama pull llama3.2:8b)',
        'ollama'
      );
    }

    // Check if configured model is available
    if (models.includes(this.model)) {
      return this.model;
    }

    // Try to find a similar model or auto-select best
    const bestModel = selectBestTextModel(models);
    if (bestModel) {
      this.model = bestModel;
      return bestModel;
    }

    // Use first available non-vision model
    const textModel = models.find((m) => !isVisionModel(m));
    if (textModel) {
      this.model = textModel;
      return textModel;
    }

    throw new AIAnalysisError(
      `Configured model "${this.model}" not found and no suitable alternative available`,
      'ollama'
    );
  }

  /**
   * Ensure a valid vision model is available
   */
  private async ensureVisionModel(): Promise<string | undefined> {
    if (!this.enableVision) {
      return undefined;
    }

    const models = await getModelNames(this.baseUrl);

    // Check if configured vision model is available
    if (this.visionModel && models.includes(this.visionModel)) {
      return this.visionModel;
    }

    // Auto-select best vision model
    const bestVisionModel = selectBestVisionModel(models);
    if (bestVisionModel) {
      this.visionModel = bestVisionModel;
      return bestVisionModel;
    }

    return undefined;
  }

  /**
   * Make a chat completion request to Ollama's OpenAI-compatible API
   */
  private async makeChatRequest(
    messages: ChatMessage[],
    model: string
  ): Promise<ChatCompletionResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = `${this.baseUrl}/v1/chat/completions`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorMessage = await parseOllamaError(response);
        throw new AIAnalysisError(
          `Ollama API error: ${errorMessage}`,
          'ollama'
        );
      }

      return response.json() as Promise<ChatCompletionResponse>;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof AIAnalysisError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new AIAnalysisError(
          `Ollama request timed out after ${this.timeout / 1000} seconds. Try a smaller model or increase timeout.`,
          'ollama'
        );
      }

      throw new AIAnalysisError(
        `Failed to connect to Ollama: ${error instanceof Error ? error.message : String(error)}`,
        'ollama'
      );
    }
  }

  /**
   * Create prompt for vision analysis
   */
  private createVisionPrompt(options: AnalysisOptions = {}): string {
    const { language = 'English', extractPatientInfo = false } = options;

    let prompt = `Analyze this lab report image and extract all biomarker values.

REPORT LANGUAGE: ${language}
EXTRACT PATIENT INFO: ${extractPatientInfo ? 'Yes' : 'No'}

Extract the following information:
- All biomarker names and their numeric values
- Units of measurement
- Reference ranges when shown
- Lab date and laboratory name if visible
- Any abnormal flags (High, Low, H, L, etc.)

Respond with ONLY a valid JSON object containing:
- biomarkers: Array of {name, value, unit, referenceRange?, confidence, notes?, flaggedAbnormal?}
- labDate: Date string if found
- labName: Laboratory name if found
- warnings: Array of any issues or uncertainties`;

    if (options.additionalInstructions) {
      prompt += `\n\nADDITIONAL INSTRUCTIONS: ${options.additionalInstructions}`;
    }

    return prompt;
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
      // Remove markdown code block markers if present
      const cleanedContent = content
        .replace(/^```(?:json)?\s*\n?/gm, '')
        .replace(/\n?```\s*$/gm, '')
        .trim();

      // Try to extract JSON from the response
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }

      let jsonString = jsonMatch[0];

      // Fix unquoted property names (common issue with some models)
      // This converts { low: 5, high: 10 } to { "low": 5, "high": 10 }
      jsonString = jsonString.replace(
        /([{,]\s*)(\w+)(\s*:)/g,
        '$1"$2"$3'
      );

      const data = JSON.parse(jsonString);

      // Validate and normalize biomarkers
      const biomarkers: ExtractedBiomarker[] = (data.biomarkers || []).map(
        (b: Record<string, unknown>) => {
          // Clean unit field and extract any embedded reference range
          const rawUnit = String(b.unit || '');
          const { unit: cleanedUnit, extractedRange } = cleanUnitAndExtractRange(rawUnit);

          // Get reference range from response
          const responseRange = b.referenceRange as Record<string, unknown> | undefined;
          const responseLow = typeof responseRange?.low === 'number' ? responseRange.low : undefined;
          const responseHigh = typeof responseRange?.high === 'number' ? responseRange.high : undefined;

          // Merge reference ranges: prefer response range, fall back to extracted from unit
          const finalLow = responseLow ?? extractedRange?.low;
          const finalHigh = responseHigh ?? extractedRange?.high;
          const hasRange = finalLow !== undefined || finalHigh !== undefined;

          return {
            name: String(b.name || ''),
            value: Number(b.value) || 0,
            unit: cleanedUnit,
            referenceRange: hasRange
              ? {
                  low: finalLow,
                  high: finalHigh,
                  unit: String(responseRange?.unit || cleanedUnit || ''),
                }
              : undefined,
            method: b.method ? String(b.method) : undefined,
            confidence: Math.max(0, Math.min(1, Number(b.confidence) || 0.5)),
            notes: b.notes ? String(b.notes) : undefined,
            flaggedAbnormal: Boolean(b.flaggedAbnormal),
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
        `Failed to parse Ollama response: ${error instanceof Error ? error.message : String(error)}`,
        'ollama'
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
