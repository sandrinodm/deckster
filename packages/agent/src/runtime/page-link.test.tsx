// @vitest-environment happy-dom
import type { DeckPlugin } from '@deckster/engine';

import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import pageLink from '#runtime/page-link.ts';
import { render, type Rendered } from '#runtime/render.fixture.tsx';

vi.mock('@deckster/engine', () => ({
  definePlugin: (plugin: DeckPlugin) => plugin,
  useDeck: () => ({ isStatic: true, position: { slide: 0, step: 0 } }),
}));

/**
 * The mounted page reporter, removed after each test.
 */
let mounted: Rendered | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.restoreAllMocks();
});

describe('page link identity', () => {
  it('allocates one page id per mount and retains it across renders', () => {
    const Overlay = pageLink.overlay;
    if (Overlay === undefined) {
      throw new Error('The page link has no overlay.');
    }

    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    mounted = render(<Overlay />);
    mounted.rerender(<Overlay />);
    mounted.rerender(<Overlay />);
    expect(random).toHaveBeenCalledTimes(1);
    mounted.unmount();
    mounted = render(<Overlay />);
    expect(random).toHaveBeenCalledTimes(2);
  });
});
