import { describe, it, expect, afterEach } from 'vitest';
import { installFakeWebLocks, type FakeWebLocks } from '@/test/fakeWebLocks';
import { withWebLock } from '@/utils/withWebLock';
import { UNSAVED_EDIT_LOCK_PREFIX, hasUnsavedEdits, markUnsavedEdit } from './unsavedEdits';

describe('unsavedEdits', () => {
  describe('without Web Locks: this tab only', () => {
    it('holds while any editor holds unsaved text', async () => {
      expect(await hasUnsavedEdits()).toBe(false);
      const clearFirst = markUnsavedEdit();
      const clearSecond = markUnsavedEdit();

      clearFirst();
      expect(await hasUnsavedEdits()).toBe(true);
      clearSecond();
      clearSecond();
      expect(await hasUnsavedEdits()).toBe(false);
    });
  });

  describe('across the tabs of this browser (P44)', () => {
    let locks: FakeWebLocks;
    afterEach(() => locks.uninstall());

    it('holds a Web Lock of its own while it holds unsaved text, and releases it once cleared', async () => {
      locks = installFakeWebLocks();

      const clear = markUnsavedEdit();
      await expect.poll(() => locks.heldNames()).toEqual([expect.stringMatching(/^hemoio-unsaved-edit:[0-9a-f-]{36}$/)]);
      expect(locks.requests[0].options).toEqual({ mode: 'shared' });

      clear();
      await expect.poll(() => locks.heldNames()).toEqual([]);
    });

    it("sees another tab's editor holding unsaved text", async () => {
      locks = installFakeWebLocks();
      let release = (): void => {};
      // Another tab's editor: the same lock, taken there
      const otherTab = withWebLock(
        `${UNSAVED_EDIT_LOCK_PREFIX}0b6f3c1e-1111-4222-8333-944455556666`,
        () => new Promise<void>((resolve) => (release = resolve))
      );
      await expect.poll(() => locks.heldNames()).toHaveLength(1);

      expect(await hasUnsavedEdits()).toBe(true);

      release();
      await otherTab;
      expect(await hasUnsavedEdits()).toBe(false);
    });

    it('a cleared editor whose lock was not yet granted holds nothing', async () => {
      locks = installFakeWebLocks();

      markUnsavedEdit()();

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(locks.heldNames()).toEqual([]);
      expect(await hasUnsavedEdits()).toBe(false);
    });

    it('other locks do not hold the load', async () => {
      locks = installFakeWebLocks();
      let release = (): void => {};
      const sync = withWebLock('hemoio-folder-sync', () => new Promise<void>((resolve) => (release = resolve)));
      await expect.poll(() => locks.heldNames()).toEqual(['hemoio-folder-sync']);

      expect(await hasUnsavedEdits()).toBe(false);

      release();
      await sync;
    });
  });
});
