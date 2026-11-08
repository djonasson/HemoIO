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
  type TestChoice,
  type TestChoiceRequest,
  AIAnalysisError,
} from './types';
import {
  LAB_REPORT_SYSTEM_PROMPT,
  createAnalysisPrompt,
} from './prompts';
import { chooseTestsWith } from './testChoice';
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
import { withParsedValue } from './withParsedValue';
import { withSpecimenHint } from './specimenHint';
import { ollamaContext } from './ollamaContext';
import { fetchWithRateLimitRetry } from './rateLimitedFetch';

/** How many times the usual answer limit a cut-off answer is asked again with */
const LONGER_ANSWER = 4;
/** Room left over the prompt and answer estimates: a prompt read as more tokens never pushes the answer out */
const CONTEXT_SLACK = 1024;

/**
 * Ollama native chat message: text, and images for vision models
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** Base64 images, without the data URL prefix */
  images?: string[];
}

/**
 * Ollama native chat response (POST /api/chat, stream: false)
 */
interface ChatResponse {
  message?: { content?: string };
  done_reason?: string;
  model?: string;
}

/**
 * Ollama Provider for local AI analysis of lab reports
 *
 * Uses Ollama's native chat API, which can set the context size, for text
 * and vision analysis.
 */
export class OllamaProvider implements AIProvider {
  readonly type: AIProviderType = 'ollama';
  readonly name = 'Ollama (Local)';

  private baseUrl: string;
  private model: string;
  private visionModel: string | undefined;
  /**
   * The last context each model accepted (also for a longer answer):
   * Ollama reloads a model whenever the size changes, so a shorter report
   * after a longer one keeps the larger size rather than shrinking it. The
   * answer's limit is the room of the report's own size, never the kept one's.
   */
  private readonly acceptedContext = new Map<string, number>();
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
      { role: 'system', content: LAB_REPORT_SYSTEM_PROMPT },
      { role: 'user', content: createAnalysisPrompt(text, options) },
    ];

    try {
      const parsed = await this.requestAnswer(messages, modelToUse, options, 'Empty response from Ollama');
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
   * Choose the test of each printed value among its candidates, in one call
   */
  async chooseTests(
    requests: TestChoiceRequest[],
    options: Pick<AnalysisOptions, 'rateLimit' | 'signal'> = {}
  ): Promise<TestChoice[]> {
    if (requests.length === 0) return [];
    const modelToUse = await this.ensureModel();
    return chooseTestsWith('ollama', this.maxTokens, requests, async (system, user, answerLimit) => {
      const messages: ChatMessage[] = [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ];
      const characters = messages.reduce((sum, m) => sum + m.content.length, 0);
      const { size, answerRoom } = ollamaContext(characters, answerLimit, 0, CONTEXT_SLACK);
      const response = await this.sendAtKeptSize(messages, modelToUse, options, size, answerRoom);
      // An empty answer has no choices
      return response.message?.content;
    });
  }

  /**
   * Analyze lab report image directly using a vision model
   */
  async analyzeImage(
    imageBase64: string,
    // Ollama's native API reads the image type from the image itself
    _mimeType: string,
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

    // The image goes with the prompt, as Ollama's native API takes it
    const messages: ChatMessage[] = [
      { role: 'system', content: LAB_REPORT_SYSTEM_PROMPT },
      { role: 'user', content: this.createVisionPrompt(options), images: [imageBase64] },
    ];

    try {
      const parsed = await this.requestAnswer(
        messages,
        modelToUse,
        options,
        'Empty response from Ollama vision model'
      );
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
   * Make a chat request to Ollama's native API
   */
  private async makeChatRequest(
    messages: ChatMessage[],
    model: string,
    { rateLimit, signal }: Pick<AnalysisOptions, 'rateLimit' | 'signal'>,
    numCtx: number,
    numPredict: number
  ): Promise<ChatResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    // The caller can cancel too, e.g. when the user leaves the analysis
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', () => controller.abort(), { once: true });

    try {
      // The native API: the OpenAI-compatible one cannot set the context size
      const url = `${this.baseUrl}/api/chat`;

      // The timeout covers the whole call, rate-limit waits included
      const response = await fetchWithRateLimitRetry('ollama', url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          format: 'json',
          options: {
            temperature: this.temperature,
            num_predict: numPredict,
            num_ctx: numCtx,
          },
        }),
        signal: controller.signal,
      }, rateLimit);

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorMessage = await parseOllamaError(response);
        // A server error is a request Ollama could not load or run (too
        // large for its free memory); a gateway giving up (502, 504) ran out
        // of time; a 503 is a busy server
        throw new AIAnalysisError(`Ollama API error: ${errorMessage}`, 'ollama', serverErrorCode(response.status));
      }

      return response.json() as Promise<ChatResponse>;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof AIAnalysisError) {
        throw error;
      }

      if (signal?.aborted) {
        throw new AIAnalysisError('Ollama request was cancelled.', 'ollama', 'cancelled');
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new AIAnalysisError(
          `Ollama request timed out after ${this.timeout / 1000} seconds. Try a smaller model or increase timeout.`,
          'ollama',
          'timeout'
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

Extract every value as the system prompt says: its name as printed, value, unit, reference range, flags and the sample the report names for it, and the lab date and laboratory name if visible.

Respond with ONLY a valid JSON object in the OUTPUT FORMAT the system prompt gives.`;

    if (options.additionalInstructions) {
      prompt += `\n\nADDITIONAL INSTRUCTIONS: ${options.additionalInstructions}`;
    }

    return prompt;
  }

  /**
   * The answer's values. One Ollama stopped at the answer limit before it
   * was complete is asked again once, with room for four times the
   * configured limit.
   */
  private async requestAnswer(
    messages: ChatMessage[],
    model: string,
    options: AnalysisOptions,
    emptyMessage: string
  ): Promise<ParsedAnswer> {
    const characters = messages.reduce((sum, m) => sum + m.content.length, 0);
    const images = messages.reduce((sum, m) => sum + (m.images?.length ?? 0), 0);
    // The answer gets the room of the report's own context beside the
    // prompt and the slack (at least the limit asked for), never that of a
    // larger context kept from before: a runaway answer stops there, and
    // the retry always has more room
    const ask = async (answerTokens: number) => {
      const { size: own, answerRoom: limit } = ollamaContext(characters, answerTokens, images, CONTEXT_SLACK);
      return { limit, response: await this.sendAtKeptSize(messages, model, options, own, limit) };
    };
    const split = 'Split the report into smaller files and import them one by one.';
    const cutOffAt = (limit: number) =>
      `Ollama's answer was cut off at HemoIO's limit of ${limit} tokens before it was complete.`;

    const first = await ask(this.maxTokens);
    const answer = this.readAnswer(first.response);
    if (answer !== 'cut-off') return answer ?? this.empty(emptyMessage);

    let retried: Awaited<ReturnType<typeof ask>>;
    try {
      retried = await ask(this.maxTokens * LONGER_ANSWER);
    } catch (error) {
      // Out of memory or time for the larger answer: still the cut-off's advice;
      // anything else (a busy server, a cancel, Ollama not running) says what it is
      if (!isTooLarge(error)) throw error;
      throw new AIAnalysisError(
        `${cutOffAt(first.limit)} Asking again with more room failed (${error.message}). ${split}`,
        'ollama'
      );
    }
    const again = this.readAnswer(retried.response);
    if (again === 'cut-off') throw new AIAnalysisError(`${cutOffAt(retried.limit)} ${split}`, 'ollama');
    return again ?? this.empty(emptyMessage);
  }

  /**
   * Ask at the larger context kept from before, so Ollama need not reload
   * the model, else at the request's own size; the own size also when the
   * kept one no longer fits (less free memory)
   */
  private async sendAtKeptSize(
    messages: ChatMessage[],
    model: string,
    options: AnalysisOptions,
    own: number,
    answerTokens: number
  ): Promise<ChatResponse> {
    const kept = this.acceptedContext.get(model) ?? 0;
    if (kept <= own) return this.chat(messages, model, options, own, answerTokens);
    try {
      return await this.chat(messages, model, options, kept, answerTokens);
    } catch (error) {
      if (!isRefused(error)) throw error;
      return this.chat(messages, model, options, own, answerTokens);
    }
  }

  /**
   * One chat request with a context of `size`, remembered for the model
   * once Ollama accepted it. A size no larger than the one kept that Ollama
   * refused, or that ran out of time, means that one no longer fits either
   * (less free memory), so it is forgotten; a larger one leaves it.
   */
  private async chat(
    messages: ChatMessage[],
    model: string,
    options: AnalysisOptions,
    size: number,
    answerTokens: number
  ): Promise<ChatResponse> {
    try {
      const response = await this.makeChatRequest(messages, model, options, size, answerTokens);
      this.acceptedContext.set(model, size);
      return response;
    } catch (error) {
      if (isTooLarge(error) && size <= (this.acceptedContext.get(model) ?? 0)) this.acceptedContext.delete(model);
      throw error;
    }
  }

  /**
   * The values of an answer; 'cut-off' when Ollama stopped it at the answer
   * limit before it was complete (also while a model was still thinking,
   * with no content yet); undefined for an empty one
   */
  private readAnswer(response: ChatResponse): ParsedAnswer | 'cut-off' | undefined {
    const content = response.message?.content;
    const stopped = response.done_reason === 'length';
    if (!content) return stopped ? 'cut-off' : undefined;
    try {
      return this.parseResponse(content);
    } catch (error) {
      if (stopped) return 'cut-off';
      throw error;
    }
  }

  private empty(message: string): never {
    throw new AIAnalysisError(message, 'ollama');
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
            ...withSpecimenHint(b),
            ...withParsedValue(b, cleanedUnit),
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

/** Whether Ollama refused a request it could not load or run: too large for its free memory */
function isRefused(error: unknown): error is AIAnalysisError {
  return error instanceof AIAnalysisError && error.code === 'server_error';
}

/** Whether a request ran out of time: HemoIO's own limit, or a proxy's in front of Ollama */
function isTimeout(error: unknown): error is AIAnalysisError {
  return error instanceof AIAnalysisError && error.code === 'timeout';
}

/** Whether a request was too large for Ollama now: refused, or out of time */
function isTooLarge(error: unknown): error is AIAnalysisError {
  return isRefused(error) || isTimeout(error);
}

/** The values read from an answer */
type ParsedAnswer = ReturnType<OllamaProvider['parseResponse']>;

/** A proxy's or tunnel's timeout (Cloudflare's 522 and 524), not Ollama's own answer */
const GATEWAY_TIMEOUTS = new Set([502, 504, 522, 524]);

/** The code of an error status: a refused request, a gateway's timeout, or none */
function serverErrorCode(status: number): string | undefined {
  if (GATEWAY_TIMEOUTS.has(status)) return 'timeout';
  if (status === 503 || status < 500) return undefined;
  return 'server_error';
}
