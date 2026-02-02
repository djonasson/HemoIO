/**
 * AI Prompts for Lab Report Analysis
 *
 * Contains system prompts and templates for extracting biomarker data
 * from lab report text using AI models.
 */

/**
 * AI Prompts for Lab Report Analysis
 *
 * Contains system prompts and templates for extracting biomarker data
 * from lab report text using AI models.
 */
import type { AnalysisOptions } from './types';

/**
 * System prompt for lab report analysis
 */
export const LAB_REPORT_SYSTEM_PROMPT = `You are a medical lab report data extraction assistant. Your task is to accurately extract biomarker values, reference ranges, and metadata from lab report text.

IMPORTANT GUIDELINES:
1. Extract ONLY values that are clearly present in the text
2. Do not infer or calculate values that are not explicitly stated
3. Preserve exact units as they appear in the report
4. Include reference ranges when available
5. Note any abnormal flags (H, L, High, Low, etc.)
6. Assign confidence scores based on clarity of the text
7. If a value is ambiguous, lower the confidence score

OUTPUT FORMAT:
Respond with a JSON object containing:
- biomarkers: Array of extracted biomarker objects
- labDate: Date of the lab test (ISO format if possible, otherwise as found)
- labName: Name of the laboratory or healthcare facility
- patientName: Patient name (only if explicitly requested)
- warnings: Array of any issues or ambiguities found

Each biomarker object should have:
- name: Biomarker name as found in report
- value: Numeric value (number only, no units)
- unit: Unit of measurement
- referenceRange: { low, high, unit } if available
- confidence: 0-1 score based on extraction certainty
- notes: Any flags or additional notes
- flaggedAbnormal: boolean if marked as abnormal

CONFIDENCE SCORING:
- 0.9-1.0: Clear, unambiguous value with standard format
- 0.7-0.9: Clear value but unusual format or minor ambiguity
- 0.5-0.7: Value present but some uncertainty about name/unit
- Below 0.5: High uncertainty, may need verification`;

/**
 * Create the user prompt for lab report analysis
 *
 * @param text - Lab report text to analyze
 * @param options - Analysis options
 * @returns User prompt string
 */
export function createAnalysisPrompt(
  text: string,
  options: AnalysisOptions = {}
): string {
  const {
    additionalInstructions,
    language = 'English',
    extractPatientInfo = false,
  } = options;

  let prompt = `Analyze the following lab report text and extract all biomarker values.

REPORT LANGUAGE: ${language}
EXTRACT PATIENT INFO: ${extractPatientInfo ? 'Yes' : 'No'}
`;

  if (additionalInstructions) {
    prompt += `\nADDITIONAL INSTRUCTIONS: ${additionalInstructions}\n`;
  }

  prompt += `
LAB REPORT TEXT:
---
${text}
---

Respond with ONLY a valid JSON object, no additional text or explanation.`;

  return prompt;
}

/**
 * Expected JSON schema for AI response
 */
export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    biomarkers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: 'number' },
          unit: { type: 'string' },
          referenceRange: {
            type: 'object',
            properties: {
              low: { type: 'number' },
              high: { type: 'number' },
              unit: { type: 'string' },
            },
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          notes: { type: 'string' },
          flaggedAbnormal: { type: 'boolean' },
        },
        required: ['name', 'value', 'unit', 'confidence'],
      },
    },
    labDate: { type: 'string' },
    labName: { type: 'string' },
    patientName: { type: 'string' },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['biomarkers', 'warnings'],
};

/**
 * Prompt for validating API connection
 */
export const CONNECTION_TEST_PROMPT = 'Respond with exactly: "OK"';

/**
 * Common biomarker name variations for context
 * This helps the AI recognize various formats
 */
export const BIOMARKER_CONTEXT = `
COMMON BIOMARKER ALIASES:
- Glucose: Blood Sugar, FBS, Fasting Glucose, Blood Glucose
- Hemoglobin: Hb, Hgb, HGB
- Hematocrit: Hct, HCT
- WBC: White Blood Cells, Leukocytes
- RBC: Red Blood Cells, Erythrocytes
- Platelets: PLT, Thrombocytes
- Total Cholesterol: TC, Cholesterol
- LDL: LDL-C, LDL Cholesterol, Bad Cholesterol
- HDL: HDL-C, HDL Cholesterol, Good Cholesterol
- Triglycerides: TG, Trigs
- TSH: Thyroid Stimulating Hormone, Thyrotropin
- T3: Triiodothyronine
- T4: Thyroxine
- Free T4: FT4
- HbA1c: Hemoglobin A1c, Glycated Hemoglobin, A1C
- Creatinine: Cr, CREA
- BUN: Blood Urea Nitrogen, Urea
- Sodium: Na
- Potassium: K
- Chloride: Cl
- CO2: Carbon Dioxide, Bicarbonate
- Calcium: Ca
- Iron: Fe, Serum Iron
- Ferritin: Ferr
- TIBC: Total Iron Binding Capacity
- Vitamin D: 25-OH Vitamin D, 25-Hydroxyvitamin D
- Vitamin B12: B12, Cobalamin
- ALT: SGPT, Alanine Aminotransferase
- AST: SGOT, Aspartate Aminotransferase
- ALP: Alkaline Phosphatase
- GGT: Gamma-GT, Gamma Glutamyl Transferase
- Bilirubin: Total Bilirubin, TBIL
`;

/**
 * Enhanced system prompt with biomarker context
 */
export const ENHANCED_SYSTEM_PROMPT = `${LAB_REPORT_SYSTEM_PROMPT}

${BIOMARKER_CONTEXT}`;
