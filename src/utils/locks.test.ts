import { describe, it, expect, afterEach } from 'vitest';
import { installFakeWebLocks, type FakeWebLocks } from '@/test/fakeWebLocks';
import { FOLDER_SYNC_LOCK, SETUP_LOCK, withLocks } from './locks';

describe('withLocks', () => {
  let fake: FakeWebLocks | undefined;

  afterEach(() => {
    fake?.uninstall();
    fake = undefined;
  });

  it("takes setup's lock, then folder sync's, however they are named, and runs the task holding both", async () => {
    const locks = (fake = installFakeWebLocks());

    let heldDuringTask: string[] = [];
    const result = await withLocks([FOLDER_SYNC_LOCK, SETUP_LOCK], async () => {
      heldDuringTask = locks.heldNames();
      return 'done';
    });

    expect(result).toBe('done');
    expect(heldDuringTask).toEqual([SETUP_LOCK, FOLDER_SYNC_LOCK]);
    expect(locks.requests.map((request) => request.name)).toEqual([SETUP_LOCK, FOLDER_SYNC_LOCK]);
    expect(locks.held()).toBeNull();
  });

  it('takes only the locks named', async () => {
    const locks = (fake = installFakeWebLocks());

    await withLocks([FOLDER_SYNC_LOCK], async () => undefined);

    expect(locks.requests.map((request) => request.name)).toEqual([FOLDER_SYNC_LOCK]);
  });
});
