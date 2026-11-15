import { createContext, useContext } from 'react';

import type { SlideMeta } from '#contract/manifest.ts';
import type { Direction } from '#navigation/navigation.ts';
import type { StepRegistry } from '#steps/step-registry.ts';

/**
 * Where a slide on the deck's stage stands relative to the one on screen.
 */
export type SlideState = 'past' | 'current' | 'future';

/**
 * What a mounted slide knows about itself; provided by the engine around each slide, on the deck's
 * stage and in every `SlideView`.
 */
export type SlideContextValue = {
  /**
   * The slide's zero-based position in the deck.
   */
  index: number;

  /**
   * The slide id, its file name without extension.
   */
  id: string;

  /**
   * The slide file relative to the deck folder, such as `slides/title.mdx`.
   */
  file: string;

  /**
   * The slide's validated frontmatter, its layout's fields included.
   */
  frontmatter: SlideMeta['frontmatter'];

  /**
   * Whether the slide behaves as the one on screen: `false` for mounted neighbours and for inactive
   * `SlideView`s (thumbnails, previews), which media and mini apps must not start in.
   */
  isActive: boolean;

  /**
   * Where the slide stands relative to the one on screen; `undefined` in a `SlideView`.
   */
  state: SlideState | undefined;

  /**
   * Which way the deck moved last; `none` in a `SlideView`.
   */
  direction: Direction;

  /**
   * The deck step this slide is asked to show; may exceed its last step.
   */
  step: number;

  /**
   * The distinct `at` values registered on the slide, ascending, as of the last commit.
   */
  steps: readonly number[];

  /**
   * Where the slide's steps register while they are mounted.
   */
  registry: StepRegistry;

  /**
   * Holds the deck's `ready()` until the returned release function is called.
   */
  holdReady: () => () => void;
};

/**
 * The slide a component renders in; `undefined` outside a slide.
 */
export const SlideContext = createContext<SlideContextValue | undefined>(undefined);

/**
 * The public view of the enclosing slide, returned by {@link useSlide}.
 */
export type SlideInfo = Pick<
  SlideContextValue,
  'index' | 'id' | 'file' | 'frontmatter' | 'isActive' | 'state' | 'direction'
>;

/**
 * Describes the slide the calling component renders in. Media and mini apps use `isActive` to start
 * only on the slide that is on screen; transitions use `state` and `direction`.
 *
 * @returns The slide's index, id, file, frontmatter, whether it is on screen, where it stands and
 *   which way the deck moved last.
 * @throws Error when called outside a slide.
 */
export function useSlide(): SlideInfo {
  const { index, id, file, frontmatter, isActive, state, direction } =
    useSlideContext('useSlide()');
  return { index, id, file, frontmatter, isActive, state, direction };
}

/**
 * Reads the enclosing slide.
 *
 * @param caller - The hook or component name, used in the error message.
 * @throws Error naming the fix when called outside a slide.
 */
export function useSlideContext(caller: string): SlideContextValue {
  const slide = useContext(SlideContext);
  if (slide === undefined) {
    throw outsideSlideError(caller);
  }

  return slide;
}

/**
 * The error for a slide hook used outside a slide, naming the fix.
 *
 * @param caller - The hook or component name.
 */
export function outsideSlideError(caller: string): Error {
  return new Error(
    `${caller} was used outside a slide. Use it in a component rendered by a slide file ` +
      'under decks/<deck>/slides/.',
  );
}
