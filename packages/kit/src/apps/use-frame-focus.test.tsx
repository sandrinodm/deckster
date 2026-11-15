// @vitest-environment happy-dom
import { act, StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { useFrameFocus } from '#apps/use-frame-focus.ts';

/**
 * The mounted hook, cleaned up even when an assertion fails.
 */
let root: Root | undefined;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

/**
 * Mounts the focus hook for one frame.
 *
 * @param frame - The frame whose owner window emits focus events.
 */
function Probe({ frame }: { frame: HTMLIFrameElement }): ReactNode {
  useFrameFocus(frame);
  return null;
}

describe('useFrameFocus', () => {
  it('cancels every deferred blur check and its polling timer when unmounted', () => {
    const frame = document.createElement('iframe');
    root = createRoot(document.createElement('div'));
    act(() =>
      root?.render(
        <StrictMode>
          <Probe frame={frame} />
        </StrictMode>,
      ),
    );
    act(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('blur'));
    });
    expect(vi.getTimerCount()).toBe(3);

    act(() => root?.unmount());
    root = undefined;
    expect(vi.getTimerCount()).toBe(0);
  });
});
