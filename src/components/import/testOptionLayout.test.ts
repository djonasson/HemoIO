import { describe, it, expect } from 'vitest';
import { accessibleName, shownName } from './testOptionLayout';
import { BLOOD_GLUCOSE_OPTION } from './testOptionFixture';

describe('shownName', () => {
  it("shows what a test measures and its kind, or what it measures alone when LOINC gives no kind", () => {
    expect(shownName(BLOOD_GLUCOSE_OPTION)).toBe('Glucose · Mass/volume');
    expect(shownName({ title: 'Specific gravity', kind: '' })).toBe('Specific gravity');
  });
});

describe('accessibleName', () => {
  it('opens with the name as shown, so a voice command saying it reaches the test, then the long name and code', () => {
    expect(accessibleName(BLOOD_GLUCOSE_OPTION)).toBe('Glucose · Mass/volume, Glucose [Mass/volume] in Blood · 2339-0');
  });
});
