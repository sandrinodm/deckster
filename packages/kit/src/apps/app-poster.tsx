import { useRef, type ReactNode } from 'react';

import { useImageStatus } from '#media/use-media-ready.ts';

/**
 * A static representation of an app: an image URL, or a function that renders it. A function gets
 * the slide's current step, so exports and screenshots show the app's state at each step, and it
 * draws with the brand like any slide content.
 */
export type Poster = string | ((context: { step: number }) => ReactNode);

/**
 * Props of {@link PosterView}.
 */
type PosterViewProps = {
  /**
   * The poster, or `undefined` when the author left it out.
   */
  poster: Poster | undefined;

  /**
   * What the poster shows, for people who cannot see it.
   */
  alt: string;

  /**
   * The slide's current step, passed to a poster function.
   */
  step: number;
};

/**
 * Draws a poster filling its region. A missing poster draws a visible placeholder marked
 * `data-app-missing-poster`, which `deckster lint` reports as an error: exports and offline runs
 * have nothing else to show.
 */
export function PosterView({ poster, alt, step }: PosterViewProps): ReactNode {
  if (poster === undefined) {
    return (
      <div className="kit-app-poster kit-app-poster-missing" data-app-missing-poster="">
        <p className="kit-type-small">No poster. Add a poster image for export and offline runs.</p>
      </div>
    );
  }

  if (typeof poster === 'function') {
    return <div className="kit-app-poster">{poster({ step })}</div>;
  }

  return <PosterImage src={poster} alt={alt} />;
}

/**
 * Props of {@link PosterImage}.
 */
type PosterImageProps = {
  /**
   * The image URL.
   */
  src: string;

  /**
   * The image's description.
   */
  alt: string;
};

/**
 * An image poster; the slide's `ready()` waits for it to decode.
 */
function PosterImage({ src, alt }: PosterImageProps): ReactNode {
  const ref = useRef<HTMLImageElement | null>(null);
  useImageStatus(ref, src);
  return (
    <div className="kit-app-poster">
      <img ref={ref} className="kit-app-poster-image" src={src} alt={alt} draggable={false} />
    </div>
  );
}
