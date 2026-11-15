import { describe, expect, it } from 'vite-plus/test';

import { createReadinessRegistry } from '#readiness/readiness-registry.ts';

describe('whenReleased', () => {
  it('resolves when the last hold is released', async () => {
    const registry = createReadinessRegistry();
    const release = registry.hold(0);
    let resolved = false;
    const waiting = registry.whenReleased([0]).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    release();
    await waiting;
    expect(resolved).toBe(true);
  });

  it('gives up its waiter when the signal aborts, without a release', async () => {
    const registry = createReadinessRegistry();
    registry.hold(0);
    const controller = new AbortController();
    const waiting = registry.whenReleased([0], controller.signal);
    controller.abort();
    await waiting;
    expect(registry.heldSlides([0])).toEqual([0]);
  });

  it('resolves at once for a signal that is already aborted', async () => {
    const registry = createReadinessRegistry();
    registry.hold(0);
    await expect(registry.whenReleased([0], AbortSignal.abort())).resolves.toBeUndefined();
  });
});
