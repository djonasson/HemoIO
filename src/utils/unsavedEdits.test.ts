import { describe, it, expect } from 'vitest';
import { hasUnsavedEdits, markUnsavedEdit } from './unsavedEdits';

describe('unsavedEdits', () => {
  it('holds while any editor holds unsaved text', () => {
    expect(hasUnsavedEdits()).toBe(false);
    const clearFirst = markUnsavedEdit();
    const clearSecond = markUnsavedEdit();

    clearFirst();
    expect(hasUnsavedEdits()).toBe(true);
    clearSecond();
    clearSecond();
    expect(hasUnsavedEdits()).toBe(false);
  });
});
