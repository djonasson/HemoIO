import { describe, it, expect, vi } from 'vitest';
import { logFailure } from './logFailure';

describe('logFailure', () => {
  it('logs only the fixed message', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    logFailure('Could not keep the folder choice');

    expect(error).toHaveBeenCalledWith('Could not keep the folder choice');
    expect(error.mock.calls[0]).toHaveLength(1);
    error.mockRestore();
  });
});
