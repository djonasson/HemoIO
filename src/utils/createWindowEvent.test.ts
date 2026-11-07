import { describe, it, expect, vi } from 'vitest';
import { createWindowEvent } from './createWindowEvent';

describe('createWindowEvent', () => {
  it('hands each listener the detail, until it stops listening', () => {
    const event = createWindowEvent<{ count: number }>('test:changed');
    const listener = vi.fn();
    const stop = event.on(listener);

    event.notify({ count: 2 });
    expect(listener).toHaveBeenCalledWith({ count: 2 });

    stop();
    event.notify({ count: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps events of different names apart', () => {
    const one = createWindowEvent('test:one');
    const two = createWindowEvent('test:two');
    const listener = vi.fn();
    const stop = one.on(listener);

    two.notify();
    expect(listener).not.toHaveBeenCalled();
    stop();
  });
});
