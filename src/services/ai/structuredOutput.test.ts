import { describe, it, expect } from 'vitest';
import { STRICT_RESPONSE_SCHEMA, strictSchema, type JsonSchema } from './structuredOutput';
import { RESPONSE_SCHEMA } from './prompts';

/** Every object schema within a schema */
function objectsIn(schema: unknown): JsonSchema[] {
  if (Array.isArray(schema)) return schema.flatMap(objectsIn);
  if (typeof schema !== 'object' || schema === null) return [];
  const own = (schema as JsonSchema).type === 'object' ? [schema as JsonSchema] : [];
  return [...own, ...Object.values(schema).flatMap(objectsIn)];
}

const biomarker = (schema: JsonSchema) =>
  ((schema.properties as JsonSchema).biomarkers as JsonSchema).items as JsonSchema;

describe('RESPONSE_SCHEMA', () => {
  it('allows a value as a number or as text, with anyOf rather than oneOf', () => {
    expect((biomarker(RESPONSE_SCHEMA).properties as JsonSchema).value).toEqual({
      anyOf: [{ type: 'number' }, { type: 'string' }],
    });
    expect(JSON.stringify(RESPONSE_SCHEMA)).not.toContain('oneOf');
  });
});

describe('strictSchema', () => {
  it('closes every object and requires all its properties', () => {
    const objects = objectsIn(STRICT_RESPONSE_SCHEMA);

    expect(objects.length).toBeGreaterThanOrEqual(3);
    for (const object of objects) {
      expect(object.additionalProperties).toBe(false);
      expect(object.required).toEqual(Object.keys(object.properties as JsonSchema));
    }
  });

  it('makes an optional property nullable, and leaves a required one as it is', () => {
    const properties = biomarker(STRICT_RESPONSE_SCHEMA).properties as JsonSchema;

    expect(properties.name).toEqual({ type: 'string' });
    expect(properties.value).toEqual({ anyOf: [{ type: 'number' }, { type: 'string' }] });
    expect(properties.method).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    expect(properties.specimenHint).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    expect((properties.referenceRange as JsonSchema).anyOf).toContainEqual({ type: 'null' });
  });

  it('drops numeric bounds, which strict structured output rejects', () => {
    expect(JSON.stringify(STRICT_RESPONSE_SCHEMA)).not.toMatch(/minimum|maximum/);
    expect((biomarker(STRICT_RESPONSE_SCHEMA).properties as JsonSchema).confidence).toEqual({ type: 'number' });
  });

  it('writes a list of types as anyOf, and adds null only once', () => {
    expect(strictSchema({ type: ['string', 'null'] })).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    const optional = strictSchema({
      type: 'object',
      properties: { a: { type: ['string', 'null'] } },
    });
    expect((optional.properties as JsonSchema).a).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
  });

  it('leaves the schema it derives from as it is', () => {
    const before = JSON.stringify(RESPONSE_SCHEMA);
    strictSchema(RESPONSE_SCHEMA);
    expect(JSON.stringify(RESPONSE_SCHEMA)).toBe(before);
  });
});
