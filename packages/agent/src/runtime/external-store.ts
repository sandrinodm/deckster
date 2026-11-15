import { useSyncExternalStore } from 'react';

/**
 * A value outside React that components read and re-render on.
 */
export type ExternalStore<T> = {
  /**
   * The current value.
   */
  readonly get: () => T;

  /**
   * Replaces the value and notifies readers when it changed.
   */
  readonly set: (value: T) => void;

  /**
   * Changes the value with a function of the current one.
   */
  readonly update: (change: (value: T) => T) => void;

  /**
   * Adds a listener; returns a function that removes it.
   */
  readonly subscribe: (listener: () => void) => () => void;
};

/**
 * Makes a store.
 *
 * @param initial - The first value.
 */
export function createExternalStore<T>(initial: T): ExternalStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  /**
   * Replaces the value.
   *
   * @param next - The new value.
   */
  const set = (next: T) => {
    if (Object.is(next, value)) {
      return;
    }

    value = next;
    for (const listener of listeners) {
      listener();
    }
  };
  return {
    get: () => value,
    set,
    update: (change) => set(change(value)),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Reads a store in a component.
 *
 * @param store - The store.
 */
export function useExternalStore<T>(store: ExternalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
