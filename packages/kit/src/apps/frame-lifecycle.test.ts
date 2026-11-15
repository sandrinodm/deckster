import { describe, expect, it } from 'vite-plus/test';

import { frameLifecycle, type FrameLifecycleInput } from '#apps/frame-lifecycle.ts';

/**
 * A slide on the stage and not on screen, with the defaults an `<AppFrame>` has.
 *
 * @param overrides - What the test changes.
 */
function input(overrides: Partial<FrameLifecycleInput> = {}): FrameLifecycleInput {
  return {
    isStatic: false,
    isActive: false,
    isOnStage: true,
    mount: 'adjacent',
    keepAlive: false,
    wasMounted: false,
    ...overrides,
  };
}

describe('frameLifecycle', () => {
  it('never mounts in static mode or in a thumbnail', () => {
    expect(frameLifecycle(input({ isStatic: true, isActive: true }))).toEqual({
      mounted: false,
      running: false,
    });
    expect(frameLifecycle(input({ isOnStage: false, isActive: true })).mounted).toBe(false);
  });

  it('mounts an adjacent slide paused and runs it when the slide arrives', () => {
    expect(frameLifecycle(input())).toEqual({ mounted: true, running: false });
    expect(frameLifecycle(input({ isActive: true }))).toEqual({ mounted: true, running: true });
  });

  it('mounts only the slide on screen with mount active', () => {
    expect(frameLifecycle(input({ mount: 'active' })).mounted).toBe(false);
    expect(frameLifecycle(input({ mount: 'active', isActive: true })).mounted).toBe(true);
  });

  it('unmounts on leaving unless keepAlive holds it', () => {
    const left = input({ mount: 'active', wasMounted: true });
    expect(frameLifecycle(left).mounted).toBe(false);
    expect(frameLifecycle({ ...left, keepAlive: true })).toEqual({ mounted: true, running: false });
  });

  it('keeps a kept-alive app from mounting before it was ever shown', () => {
    expect(frameLifecycle(input({ mount: 'active', keepAlive: true })).mounted).toBe(false);
  });
});
