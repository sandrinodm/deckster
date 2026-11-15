import { useSlide } from '@deckster/engine';

/**
 * The file of the slide a component renders in, relative to the deck folder, for
 * `frontmatterAsset`; `undefined` outside a slide.
 */
export function useSlideFile(): string | undefined {
  try {
    return useSlide().file;
  } catch {
    return undefined;
  }
}
