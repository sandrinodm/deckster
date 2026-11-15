import type { ReactNode } from 'react';

/**
 * Props for {@link Notes}.
 */
export type NotesProps = {
  /**
   * The notes text; the build reads it, and nothing renders.
   */
  children?: ReactNode;
};

/**
 * Speaker notes for the slide. The build reads the text of every `<Notes>` block into the slide's
 * metadata (`window.__deck.slides[i].notes`), so the block itself renders nothing on the slide.
 */
export function Notes(_props: NotesProps): null {
  return null;
}
