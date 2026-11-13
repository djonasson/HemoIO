import { describe, it, expect } from 'vitest';
import { droppedValuesNote, MALFORMED_ANSWER, overallConfidence, parseExtraction } from './parseExtraction';
import { cleanUnitAndExtractRange } from './ollamaUtils';
import { AIAnalysisError } from './types';

const answer = (biomarkers: unknown, extra: object = {}) => JSON.stringify({ biomarkers, warnings: [], ...extra });
const glucose = { name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.9 };

describe('parseExtraction', () => {
  describe('reading the answer', () => {
    it('reads the values, lab date and name, patient name and notes', () => {
      const parsed = parseExtraction(
        answer([glucose], { labDate: '2024-01-15', labName: 'City Lab', patientName: 'X', warnings: ['faint scan'] }),
        'openai'
      );

      expect(parsed.biomarkers).toHaveLength(1);
      expect(parsed.biomarkers[0]).toMatchObject({ name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.9 });
      expect(parsed).toMatchObject({ labDate: '2024-01-15', labName: 'City Lab', patientName: 'X', warnings: ['faint scan'] });
    });

    it('finds the JSON object among other text and inside a code block', () => {
      expect(parseExtraction(`Here you go:\n${answer([glucose])}\nDone.`, 'anthropic').biomarkers).toHaveLength(1);
      expect(parseExtraction('```json\n' + answer([glucose]) + '\n```', 'ollama').biomarkers).toHaveLength(1);
    });

    it('reads unquoted property names, as some local models write them', () => {
      const parsed = parseExtraction(
        '{ biomarkers: [{ name: "Glucose", value: 95, unit: "mg/dL", referenceRange: { low: 70, high: 100 } }] }',
        'ollama'
      );

      expect(parsed.biomarkers[0].referenceRange).toMatchObject({ low: 70, high: 100 });
    });

    it('leaves property-like text inside a valid answer as it is', () => {
      const parsed = parseExtraction(answer([{ ...glucose, notes: 'fasting, note: repeat' }]), 'ollama');

      expect(parsed.biomarkers[0].notes).toBe('fasting, note: repeat');
    });

    it('fails an answer with no JSON object, naming the provider', () => {
      expect(() => parseExtraction('not valid json', 'openai')).toThrow('Failed to parse OpenAI response');
      expect(() => parseExtraction('{"biomarkers": [', 'anthropic')).toThrow('Failed to parse Anthropic response');
    });

    it('fails an answer with no list of values, with the malformed-answer code', () => {
      const failure = (() => {
        try {
          return parseExtraction('{"values": []}', 'ollama');
        } catch (error) {
          return error;
        }
      })();

      expect(failure).toBeInstanceOf(AIAnalysisError);
      expect((failure as AIAnalysisError).code).toBe(MALFORMED_ANSWER);
      expect((failure as Error).message).toMatch(/Failed to parse Ollama response: the answer has no list of values/);
    });

    it('fails an answer whose list of values is not a list', () => {
      expect(() => parseExtraction('{"biomarkers": {"name": "Glucose"}}', 'openai')).toThrow(/no list of values/);
    });

    it('fails an answer that is a list, not an object', () => {
      expect(() => parseExtraction('[{"name": "Glucose"}]', 'openai')).toThrow(/Failed to parse/);
    });
  });

  describe('values not in the expected form', () => {
    it.each([
      ['no name', { value: 95, unit: 'mg/dL', confidence: 0.9 }],
      ['a blank name', { name: '  ', value: 95, unit: 'mg/dL', confidence: 0.9 }],
      ['a name that is not text', { name: 42, value: 95, unit: 'mg/dL', confidence: 0.9 }],
      ['no value', { name: 'Glucose', unit: 'mg/dL', confidence: 0.9 }],
      ['a value that is neither a number nor text', { name: 'Glucose', value: { amount: 95 }, unit: 'mg/dL' }],
      ['a value true or false', { name: 'Glucose', value: true, unit: 'mg/dL' }],
      ['a unit that is not text', { name: 'Glucose', value: 95, unit: 5 }],
      ['a confidence that is not a number', { name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 'high' }],
      ['not an object', 'Glucose 95'],
    ])('leaves out a value with %s, with a note', (_, malformed) => {
      const parsed = parseExtraction(answer([glucose, malformed]), 'openai');

      expect(parsed.biomarkers.map((b) => b.name)).toEqual(['Glucose']);
      expect(parsed.warnings).toEqual([droppedValuesNote(1)]);
    });

    it('says how many were left out, after the notes the AI gave', () => {
      const parsed = parseExtraction(answer([glucose, { value: 1 }, null], { warnings: ['faint scan'] }), 'openai');

      expect(parsed.warnings).toEqual(['faint scan', droppedValuesNote(2)]);
    });

    it('notes how many were left out without any of their content', () => {
      expect(droppedValuesNote(1)).toBe("1 value in the AI's answer was not in the expected form and was left out.");
      expect(droppedValuesNote(3)).toBe("3 values in the AI's answer were not in the expected form and were left out.");
    });

    it('adds no note when every value is well formed', () => {
      expect(parseExtraction(answer([glucose]), 'openai').warnings).toEqual([]);
    });

    it('keeps a qualitative result given with no value', () => {
      const parsed = parseExtraction(answer([{ name: 'Nitriti', value: null, unit: '', qualitativeValue: 'assenti' }]), 'openai');

      expect(parsed.biomarkers[0]).toMatchObject({ name: 'Nitriti', value: 0, qualitative: { text: 'assenti' } });
      expect(parsed.warnings).toEqual([]);
    });

    it('keeps a value given as text: an interval, a censored value', () => {
      const parsed = parseExtraction(
        answer([
          { name: 'Eritrociti', value: '5-10', unit: 'per campo', confidence: 0.9 },
          { name: 'Glucosio', value: '< 10', unit: 'mg/dL', confidence: 0.9 },
        ]),
        'anthropic'
      );

      expect(parsed.biomarkers[0]).toMatchObject({ isInterval: true, intervalLow: 5, intervalHigh: 10 });
      expect(parsed.biomarkers[1]).toMatchObject({ value: 10, censored: '<' });
    });
  });

  describe('normalisation', () => {
    it('keeps confidence within 0 to 1, and a missing one middling', () => {
      const parsed = parseExtraction(
        answer([
          { ...glucose, confidence: 1.5 },
          { ...glucose, confidence: -0.5 },
          { name: 'Glucose', value: 95, unit: 'mg/dL' },
          { ...glucose, confidence: null },
        ]),
        'ollama'
      );

      expect(parsed.biomarkers.map((b) => b.confidence)).toEqual([1, 0, 0.5, 0.5]);
    });

    it('treats the nulls strict structured output gives as absent', () => {
      const parsed = parseExtraction(
        answer(
          [
            {
              ...glucose,
              specimenHint: null,
              qualitativeValue: null,
              referenceRange: null,
              method: null,
              notes: null,
              flag: null,
            },
          ],
          { labDate: null, labName: null, patientName: null }
        ),
        'openai'
      );

      expect(parsed.biomarkers[0]).toMatchObject({ name: 'Glucose', value: 95, unit: 'mg/dL' });
      expect(parsed.biomarkers[0].referenceRange).toBeUndefined();
      expect(parsed.biomarkers[0].method).toBeUndefined();
      expect(parsed.biomarkers[0].specimenHint).toBeUndefined();
      expect(parsed.biomarkers[0].labFlag).toBeUndefined();
      expect(parsed).toMatchObject({ labDate: undefined, labName: undefined, patientName: undefined });
    });

    it('reads a reference range with nulls for the bounds it lacks', () => {
      const parsed = parseExtraction(
        answer([{ ...glucose, referenceRange: { low: null, high: 100, unit: null } }]),
        'openai'
      );

      expect(parsed.biomarkers[0].referenceRange).toEqual({ low: undefined, high: 100, unit: undefined });
    });

    it("keeps a range's own unit only when it is not the value's", () => {
      const parsed = parseExtraction(
        answer([
          { ...glucose, referenceRange: { low: 70, high: 100, unit: 'mg/dL' } },
          { ...glucose, referenceRange: { low: 3.9, high: 5.6, unit: 'mmol/L' } },
        ]),
        'anthropic'
      );

      expect(parsed.biomarkers[0].referenceRange?.unit).toBeUndefined();
      expect(parsed.biomarkers[1].referenceRange?.unit).toBe('mmol/L');
    });

    it('reads the sample, flag, method and notes', () => {
      const parsed = parseExtraction(
        answer([{ ...glucose, specimenHint: ' serum ', flag: 'H', method: 'Enzymatic', notes: 'fasting' }]),
        'openai'
      );

      expect(parsed.biomarkers[0]).toMatchObject({
        specimenHint: 'serum',
        labFlag: 'high',
        method: 'Enzymatic',
        notes: 'fasting',
      });
    });

    it('cleans units and takes a range printed in the unit, when asked to', () => {
      const parsed = parseExtraction(answer([{ name: 'ALT', value: 80, unit: 'UL (5-34)', confidence: 0.9 }]), 'ollama', {
        cleanUnit: cleanUnitAndExtractRange,
      });

      expect(parsed.biomarkers[0]).toMatchObject({ unit: 'U/L', referenceRange: { low: 5, high: 34 } });
    });

    it('reads strings as warnings', () => {
      expect(parseExtraction(answer([], { warnings: ['a', 2] }), 'openai').warnings).toEqual(['a', '2']);
      expect(parseExtraction(answer([], { warnings: 'a' }), 'openai').warnings).toEqual([]);
    });
  });
});

describe('overallConfidence', () => {
  it('is the mean confidence, and 0 for no values', () => {
    const { biomarkers } = parseExtraction(
      answer([
        { ...glucose, confidence: 0.8 },
        { ...glucose, confidence: 1 },
      ]),
      'openai'
    );

    expect(overallConfidence(biomarkers)).toBeCloseTo(0.9);
    expect(overallConfidence([])).toBe(0);
  });
});
