import { useSyncExternalStore } from 'react';

/**
 * A small observable value outside React, shared by the keyboard handler (which runs outside any
 * component) and the components that draw its state.
 */
export type Store<T> = {
  /**
   * The current value; the same object until {@link Store.set} replaces it.
   */
  get: () => T;

  /**
   * Replaces the value and notifies subscribers, unless it is the same object.
   */
  set: (next: T) => void;

  /**
   * Calls `listener` after every change; returns the function that stops it.
   */
  subscribe: (listener: () => void) => () => void;
};

/**
 * Creates a store.
 *
 * @param initial - The first value.
 */
export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) {
        return;
      }

      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Reads a store in a component and re-renders when it changes.
 *
 * @param store - The store to read.
 */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
