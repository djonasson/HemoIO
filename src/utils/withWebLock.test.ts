import { describe, it, expect, vi, afterEach } from 'vitest';
import { installFakeWebLocks, type FakeWebLocks } from '@/test/fakeWebLocks';
import { withWebLock } from './withWebLock';

describe('withWebLock', () => {
  let fake: FakeWebLocks | undefined;

  afterEach(() => {
    fake?.uninstall();
    fake = undefined;
  });

  it('holds the lock while the task runs', async () => {
    const locks = (fake = installFakeWebLocks());
    let heldDuringTask: string | null = null;

    const result = await withWebLock('hemoio-setup', async () => {
      heldDuringTask = locks.held();
      return 42;
    });

    expect(result).toBe(42);
    expect(heldDuringTask).toBe('hemoio-setup');
    expect(locks.requests).toEqual([{ name: 'hemoio-setup', options: { mode: 'exclusive' } }]);
    expect(locks.held()).toBeNull();
  });

  it('runs one task at a time under the same name', async () => {
    fake = installFakeWebLocks();
    const order: string[] = [];
    let releaseFirst!: () => void;

    const first = withWebLock('hemoio-setup', async () => {
      order.push('first starts');
      await new Promise<void>((resolve) => (releaseFirst = resolve));
      order.push('first ends');
    });
    const second = withWebLock('hemoio-setup', async () => {
      order.push('second starts');
    });
    await vi.waitFor(() => expect(order).toEqual(['first starts']));
    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(['first starts', 'first ends', 'second starts']);
  });

  it('passes on what the task throws', async () => {
    fake = installFakeWebLocks();

    await expect(
      withWebLock('hemoio-setup', () => Promise.reject(new Error('task failed')))
    ).rejects.toThrow('task failed');
  });

  it('runs directly without Web Locks', async () => {
    expect('locks' in navigator).toBe(false);

    await expect(withWebLock('hemoio-setup', async () => 'ran')).resolves.toBe('ran');
  });
});
