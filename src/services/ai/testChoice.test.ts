import { describe, it, expect } from 'vitest';
import { choiceAnswerLimit, parseTestChoices } from './testChoice';
import type { TestChoiceRequest } from './types';

const requests: TestChoiceRequest[] = [
  {
    id: 'a',
    name: 'Glucosio',
    unit: 'mg/dL',
    candidates: [
      { code: '2345-7', name: 'Glucose [Mass/volume] in Serum or Plasma' },
      { code: '2339-0', name: 'Glucose [Mass/volume] in Blood' },
    ],
  },
  { id: 'b', name: 'Creatinina', unit: 'mg/dL', candidates: [{ code: '2160-0', name: 'Creatinine' }] },
];

describe('parseTestChoices', () => {
  it('keeps a choice from the candidates', () => {
    const raw = { choices: [{ id: 'a', code: '2345-7', confident: true }, { id: 'b', code: '2160-0', confident: false }] };
    expect(parseTestChoices(raw, requests)).toEqual([
      { id: 'a', code: '2345-7', confident: true },
      { id: 'b', code: '2160-0', confident: false },
    ]);
  });

  it('reads the model text as JSON, around any prose', () => {
    const raw = 'Here you go: {"choices":[{"id":"a","code":"2339-0","confident":true}]}';
    expect(parseTestChoices(raw, requests)[0]).toEqual({ id: 'a', code: '2339-0', confident: true });
  });

  it('reads ids the model wrote as numbers', () => {
    const numbered: TestChoiceRequest[] = [{ ...requests[0], id: '0' }, { ...requests[1], id: '1' }];
    const raw = '{"choices":[{"id":0,"code":"2345-7","confident":true},{"id":1,"code":"2160-0","confident":true}]}';
    expect(parseTestChoices(raw, numbered)).toEqual([
      { id: '0', code: '2345-7', confident: true },
      { id: '1', code: '2160-0', confident: true },
    ]);
  });

  it('rejects a code outside the candidates', () => {
    const raw = { choices: [{ id: 'a', code: '2160-0', confident: true }, { id: 'b', code: '9999-9', confident: true }] };
    expect(parseTestChoices(raw, requests)).toEqual([
      { id: 'a', code: null, confident: false },
      { id: 'b', code: null, confident: false },
    ]);
  });

  it('treats malformed JSON as no choice for every request', () => {
    const none = [
      { id: 'a', code: null, confident: false },
      { id: 'b', code: null, confident: false },
    ];
    expect(parseTestChoices('{"choices": [{"id": "a", "co', requests)).toEqual(none);
    expect(parseTestChoices('not json', requests)).toEqual(none);
    expect(parseTestChoices(undefined, requests)).toEqual(none);
    expect(parseTestChoices({ choices: 'x' }, requests)).toEqual(none);
  });

  it('keeps the complete choices of an answer cut off, the rest no choice', () => {
    const cutOff = '{"choices": [{"id": "a", "code": "2339-0", "confident": true}, {"id": "b", "co';
    expect(parseTestChoices(cutOff, requests)).toEqual([
      { id: 'a', code: '2339-0', confident: true },
      { id: 'b', code: null, confident: false },
    ]);
  });

  it('keeps ids that were asked about only', () => {
    const raw = { choices: [{ id: 'zzz', code: '2345-7', confident: true }, { id: 'a', code: '2345-7', confident: true }] };
    const result = parseTestChoices(raw, requests);
    expect(result.map((c) => c.id)).toEqual(['a', 'b']);
    expect(result[1]).toEqual({ id: 'b', code: null, confident: false });
  });

  it('is not confident unless the model said so with a boolean', () => {
    const raw = { choices: [{ id: 'a', code: '2345-7', confident: 'yes' }] };
    expect(parseTestChoices(raw, requests)[0]).toEqual({ id: 'a', code: '2345-7', confident: false });
  });
});

describe('choiceAnswerLimit', () => {
  it('gives each value room for its choice, never less than the configured limit', () => {
    expect(choiceAnswerLimit(4096, 2)).toBe(4096);
    expect(choiceAnswerLimit(4096, 300)).toBeGreaterThan(4096);
    expect(choiceAnswerLimit(4096, 300)).toBe(choiceAnswerLimit(1000, 300));
  });
});
