import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { SaveError, saveErrorMessage, toSaveError } from './saveError';

const domError = (name: string, message = 'details about record 42: Glucose 125') =>
  new DOMException(message, name);

describe('toSaveError', () => {
  it('reads a full storage from the error, or from the error that aborted the transaction', () => {
    expect(toSaveError(domError('QuotaExceededError')).kind).toBe('quota');
    expect(toSaveError(new Dexie.AbortError('aborted', domError('QuotaExceededError'))).kind).toBe(
      'quota'
    );
    expect(toSaveError(new Dexie.QuotaExceededError('full')).kind).toBe('quota');
  });

  it('reads a full storage from a bulk write whose records failed', () => {
    const bulk = new Dexie.BulkError('1 of 2 operations failed', [domError('QuotaExceededError')]);

    expect(toSaveError(bulk).kind).toBe('quota');
  });

  it('reads a lost connection', () => {
    expect(toSaveError(new Dexie.DatabaseClosedError()).kind).toBe('closed');
    expect(toSaveError(domError('InvalidStateError')).kind).toBe('closed');
  });

  it('calls anything else a refused change', () => {
    expect(toSaveError(new Dexie.AbortError('aborted')).kind).toBe('failed');
    expect(toSaveError(new Error('boom')).kind).toBe('failed');
    expect(toSaveError('not an error').kind).toBe('failed');
  });

  it('keeps a SaveError as it is', () => {
    const error = new SaveError('timeout');

    expect(toSaveError(error)).toBe(error);
  });

  it('never carries the text of the error it was made from', () => {
    for (const kind of ['QuotaExceededError', 'InvalidStateError', 'AbortError', 'DataError']) {
      const error = toSaveError(domError(kind));

      expect(error.message).not.toMatch(/Glucose|125|record 42/);
      expect(error.cause).toBeUndefined();
      expect(JSON.stringify(error)).not.toMatch(/Glucose/);
    }
  });
});

describe('saveErrorMessage', () => {
  it('says why in plain words', () => {
    expect(saveErrorMessage(new SaveError('quota'))).toMatch(/no room left/);
    expect(saveErrorMessage(new SaveError('closed'))).toMatch(/Reload the page/);
    expect(saveErrorMessage(new SaveError('timeout'))).toMatch(/did not respond/);
    expect(saveErrorMessage(new SaveError('failed'))).toMatch(/did not keep the change/);
  });

  it('does not show the text of other errors, which can hold health data', () => {
    expect(saveErrorMessage(new Error('Glucose 125 mg/dL'))).not.toMatch(/Glucose/);
  });
});
