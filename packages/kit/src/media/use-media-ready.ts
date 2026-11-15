import { useReadyHold } from '@deckster/engine';
import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether an image has loaded and decoded, or failed.
 */
export type ImageStatus = 'loading' | 'ready' | 'error';

/**
 * Tracks an image until it has decoded, and holds the slide's `ready()` meanwhile so screenshots
 * and exports never catch it half drawn. A file that fails to load releases the hold and reports
 * `error`, so the component can show a placeholder instead of stalling the deck.
 *
 * @param ref - The `<img>` element.
 * @param src - The image URL; a change starts a new load.
 * @returns The status.
 */
export function useImageStatus(ref: RefObject<HTMLImageElement | null>, src: string): ImageStatus {
  const [state, setState] = useState<{ src: string; status: ImageStatus }>({
    src,
    status: 'loading',
  });
  const status = state.src === src ? state.status : 'loading';
  useReadyHold(status === 'loading');
  useEffect(() => {
    const image = ref.current;
    if (image === null) {
      return undefined;
    }

    let live = true;
    /**
     * Records how the load ended, unless the component moved on.
     *
     * @param next - The final status.
     */
    const settle = (next: ImageStatus): void => {
      if (live) {
        setState({ src, status: next });
      }
    };
    image
      .decode()
      .then(() => settle('ready'))
      .catch(() => settle(image.complete && image.naturalWidth > 0 ? 'ready' : 'error'));
    return () => {
      live = false;
    };
  }, [ref, src]);
  return status;
}
