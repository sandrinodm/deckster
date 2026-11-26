/**
 * The functions waiting for a lazy layout to finish loading.
 */
const listeners = new Set<() => void>();

/**
 * How many lazy layouts have finished loading, a snapshot for `useSyncExternalStore`.
 */
let finishedLoads = 0;

/**
 * Calls `listener` whenever a lazy layout finishes loading, successfully or not.
 *
 * @param listener - What to call.
 * @returns The function that stops listening.
 */
export function subscribeToLayoutLoads(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * How many lazy layouts have finished loading; it changes whenever one more does.
 */
export function layoutLoadCount(): number {
  return finishedLoads;
}

/**
 * Tells everything that reads layouts, such as page chrome that reads a layout's `bleed`, that a
 * lazy layout finished loading.
 */
export function announceLayoutLoad(): void {
  finishedLoads += 1;
  for (const listener of listeners) {
    listener();
  }
}
