/**
 * Save errors
 *
 * A write the browser's storage did not keep. Its message is fixed text per
 * kind of failure: the underlying error is never kept, as its text can
 * quote stored keys or values.
 */

/**
 * Why a write was not kept:
 * - quota: the browser has no room left for the app's data
 * - closed: the connection to the storage is gone (another tab upgraded or
 *   deleted the database, or the browser closed it)
 * - timeout: the storage did not answer in time, so the write was cancelled
 * - failed: the storage refused or cancelled the write for another reason
 */
export type SaveErrorKind = 'quota' | 'closed' | 'timeout' | 'failed';

const MESSAGES: Record<SaveErrorKind, string> = {
  quota: "There is no room left in this browser's storage. Free up disk space, then try again.",
  closed: "The connection to this browser's storage was lost. Reload the page, then try again.",
  timeout:
    "This browser's storage did not respond. Close other HemoIO tabs or reload the page, then try again.",
  failed:
    "This browser's storage did not keep the change. Try again, or reload the page if it keeps failing.",
};

export class SaveError extends Error {
  readonly kind: SaveErrorKind;

  constructor(kind: SaveErrorKind) {
    super(MESSAGES[kind]);
    this.name = 'SaveError';
    this.kind = kind;
  }
}

/** The error and the errors it carries: Dexie wraps the cause of an abort, and a bulk write's failures */
function* errorChain(err: unknown, depth = 0): Generator<{ name?: unknown }> {
  if (typeof err !== 'object' || err === null || depth > 5) return;
  yield err as { name?: unknown };
  const { inner, failures } = err as { inner?: unknown; failures?: unknown };
  yield* errorChain(inner, depth + 1);
  const failed = Array.isArray(failures)
    ? failures
    : failures && typeof failures === 'object'
      ? Object.values(failures)
      : [];
  for (const failure of failed) yield* errorChain(failure, depth + 1);
}

const CLOSED_NAMES = new Set(['DatabaseClosedError', 'InvalidStateError', 'OpenFailedError']);

/**
 * The SaveError for an error from a write: by the names of the error and
 * the errors it carries, the most telling first
 */
export function toSaveError(err: unknown): SaveError {
  if (err instanceof SaveError) return err;
  const names = [...errorChain(err)].map((e) => e.name);
  if (names.includes('QuotaExceededError')) return new SaveError('quota');
  if (names.some((name) => typeof name === 'string' && CLOSED_NAMES.has(name))) {
    return new SaveError('closed');
  }
  return new SaveError('failed');
}

/**
 * What to tell the user about a failed save: why, for a SaveError, and a
 * general message otherwise, never the text of the error itself
 */
export function saveErrorMessage(err: unknown): string {
  return err instanceof SaveError ? err.message : MESSAGES.failed;
}
