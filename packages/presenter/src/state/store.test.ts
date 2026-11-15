import { describe, expect, it, vi } from 'vite-plus/test';

import { createStore } from '#state/store.ts';

describe('createStore', () => {
  it('notifies subscribers when the value changes and stops after unsubscribe', () => {
    const store = createStore(1);
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.set(2);
    stop();
    store.set(3);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).toBe(3);
  });

  it('ignores a set of the same value', () => {
    const store = createStore('a');
    const listener = vi.fn();
    store.subscribe(listener);
    store.set('a');
    expect(listener).not.toHaveBeenCalled();
  });
});
