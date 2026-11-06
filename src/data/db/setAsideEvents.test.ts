import { describe, it, expect, vi } from 'vitest';
import { notifySetAsideChanged, onSetAsideChanged } from './setAsideEvents';

describe('set-aside events', () => {
  it('tells every listener what changed, until it unsubscribes', () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = onSetAsideChanged(first);
    const stopSecond = onSetAsideChanged(second);

    notifySetAsideChanged({ movedAside: ['labResults'] });
    stopFirst();
    notifySetAsideChanged();
    stopSecond();

    expect(first.mock.calls).toEqual([[{ movedAside: ['labResults'] }]]);
    expect(second.mock.calls).toEqual([[{ movedAside: ['labResults'] }], [{ movedAside: [] }]]);
  });
});
