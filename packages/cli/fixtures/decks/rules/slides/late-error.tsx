import { Notes, type SlideFrontmatterInput } from '@deckster/engine';
import { useEffect, type ReactNode } from 'react';

/**
 * Read by the build without running the slide, so it must stay a literal.
 */
export const frontmatter = {
  /**
   * The slide title.
   */
  title: 'Late error',

  /**
   * The brand surface.
   */
  surface: 'default',
} satisfies SlideFrontmatterInput;

/**
 * A slide that renders, then throws from a timer: an uncaught page error.
 */
export default function LateError(): ReactNode {
  useEffect(() => {
    const timer = setTimeout(() => {
      throw new Error('Thrown after mount on purpose.');
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div>
      <h2>Late error</h2>
      <Notes>Fail case for render-error from an uncaught page error.</Notes>
    </div>
  );
}
