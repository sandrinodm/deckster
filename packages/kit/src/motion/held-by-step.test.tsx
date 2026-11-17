// @vitest-environment happy-dom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { RevealState } from '#charts/frame/chart-step.tsx';

import { Lottie } from '#media/lottie.tsx';
import { Video } from '#media/video.tsx';
import { RevealContext } from '#motion/still-motion.ts';

/**
 * The player's controls, so a test can see when the animation was asked to play.
 */
const player = vi.hoisted(() => ({
  goToAndPlay: vi.fn(),
  goToAndStop: vi.fn(),
  pause: vi.fn(),
  destroy: vi.fn(),
  totalFrames: 60,
}));

vi.mock('lottie-web/build/player/lottie_light', () => ({
  default: { loadAnimation: () => player },
}));

vi.mock('@deckster/engine', () => ({
  useReadyHold: () => undefined,
  useSlide: () => ({ isActive: true, state: 'current', direction: 'forward' }),
  useStatic: () => false,
  useStep: () => 0,
}));

vi.mock('@deckster/brand/runtime', () => ({
  useBrand: () => ({ brand: { imagery: { default: 'none', treatments: {} } } }),
}));

/**
 * The mounted tree, cleaned up even when an assertion fails.
 */
let root: Root | undefined;

/**
 * Where the tree is mounted, attached to the document so its video can be found.
 */
let container: HTMLDivElement | undefined;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', async () => Response.json({ fr: 30, ip: 0, op: 60, layers: [] }));
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  player.goToAndPlay.mockClear();
  player.pause.mockClear();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

/**
 * Renders a tree inside a `<Step>`'s reveal state, mounting it on the first call.
 *
 * @param reveal - The reveal state of the step around the media; `undefined` outside a step.
 * @param media - The media.
 */
async function renderIn(reveal: RevealState | undefined, media: ReactNode): Promise<void> {
  if (root === undefined) {
    container = document.body.appendChild(document.createElement('div'));
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<RevealContext value={reveal}>{media}</RevealContext>);
    // The player and the file load asynchronously; let them settle inside act.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('media inside a <Step>', () => {
  it('starts a Lottie animation when its step is revealed, not when the slide arrives', async () => {
    const lottie = <Lottie src="check.json" alt="A check" />;
    await renderIn('hidden', lottie);
    expect(player.goToAndPlay).not.toHaveBeenCalled();

    await renderIn('play', lottie);
    expect(player.goToAndPlay).toHaveBeenCalledTimes(1);
    expect(player.goToAndPlay).toHaveBeenCalledWith(0, true);
  });

  it('plays a Lottie animation with the slide outside a step', async () => {
    await renderIn(undefined, <Lottie src="check.json" alt="A check" />);
    expect(player.goToAndPlay).toHaveBeenCalledTimes(1);
  });

  it('starts a video from its first frame when its step is revealed', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(async () => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const video = <Video src="film.webm" poster="film.jpg" alt="A film" />;
    await renderIn('hidden', video);
    await act(async () => {
      // Without a real file the metadata never loads; announce it so the player is ready.
      container?.querySelector('video')?.dispatchEvent(new Event('loadedmetadata'));
      await Promise.resolve();
    });
    expect(play).not.toHaveBeenCalled();

    await renderIn('play', video);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
