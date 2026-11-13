/**
 * The analysis answer's schema in the forms each provider's structured
 * output takes, so the model answers in the shape parseExtraction reads
 */
import { RESPONSE_SCHEMA } from './prompts';
import { AIAnalysisError } from './types';

/** A JSON schema, or a part of one */
export type JsonSchema = { [key: string]: unknown };

/** The name the schema goes by in a request (OpenAI requires one) */
export const RESPONSE_SCHEMA_NAME = 'lab_report_extraction';

/**
 * The code of an error for a request whose structured output the provider
 * rejected (an older model, an older server): the request is sent again
 * asking only for JSON
 */
export const STRUCTURED_OUTPUT_UNSUPPORTED = 'structured_output_unsupported';

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const NULL_TYPE: JsonSchema = { type: 'null' };

function allowsNull(schema: JsonSchema): boolean {
  return Array.isArray(schema.anyOf) && schema.anyOf.some((s) => isSchema(s) && s.type === 'null');
}

/** The schema, or null */
function nullable(schema: JsonSchema): JsonSchema {
  if (allowsNull(schema)) return schema;
  if (Array.isArray(schema.anyOf)) return { ...schema, anyOf: [...schema.anyOf, NULL_TYPE] };
  return { anyOf: [schema, NULL_TYPE] };
}

/**
 * A schema in the form strict structured output takes (OpenAI's strict
 * mode, Anthropic's JSON outputs): every object closed
 * (additionalProperties: false) with all its properties required, an
 * optional one as nullable instead; a list of types as anyOf; no numeric
 * bounds, which neither accepts. parseExtraction treats a null as absent
 * and checks the bounds itself.
 */
export function strictSchema(schema: JsonSchema): JsonSchema {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { minimum, maximum, ...rest } = schema;

  if (Array.isArray(rest.type)) {
    return { anyOf: rest.type.map((type) => strictSchema({ ...rest, type })) };
  }
  if (Array.isArray(rest.anyOf)) {
    return { ...rest, anyOf: rest.anyOf.filter(isSchema).map(strictSchema) };
  }
  if (rest.type === 'array' && isSchema(rest.items)) {
    return { ...rest, items: strictSchema(rest.items) };
  }
  if (rest.type === 'object' && isSchema(rest.properties)) {
    const required = new Set(Array.isArray(rest.required) ? rest.required : []);
    const properties = Object.fromEntries(
      Object.entries(rest.properties)
        .filter((entry): entry is [string, JsonSchema] => isSchema(entry[1]))
        .map(([key, property]) => {
          const strict = strictSchema(property);
          return [key, required.has(key) ? strict : nullable(strict)];
        })
    );
    return { ...rest, properties, required: Object.keys(properties), additionalProperties: false };
  }
  return rest;
}

/** The answer's schema for OpenAI's strict json_schema mode and Anthropic's JSON outputs */
export const STRICT_RESPONSE_SCHEMA: JsonSchema = strictSchema(RESPONSE_SCHEMA);

/**
 * Asks for structured output until the provider rejects it
 * (STRUCTURED_OUTPUT_UNSUPPORTED), then asks without it, at once and from
 * then on
 */
export class StructuredOutputFallback {
  private rejected = false;

  async request<R>(structured: () => Promise<R>, plain: () => Promise<R>): Promise<R> {
    if (!this.rejected) {
      try {
        return await structured();
      } catch (error) {
        if (!(error instanceof AIAnalysisError) || error.code !== STRUCTURED_OUTPUT_UNSUPPORTED) throw error;
        this.rejected = true;
      }
    }
    return plain();
  }
}
