import type { ReactNode } from 'react';

import { MORPH_ATTRIBUTE } from '@deckster/engine';

import { checkComponentProps } from '#components/check-component-props.ts';
import '#motion/morph.css';

/**
 * Props of {@link Morph}.
 */
export type MorphProps = {
  /**
   * The name the element shares with its counterpart on the next or previous slide, unique on the
   * slide, such as `logo` or `p95`.
   */
  id: string;

  /**
   * What flies: one element, such as a number, a logo, an icon, a picture or a heading.
   */
  children?: ReactNode;
};

/**
 * Marks content to fly to its place on the neighbouring slide instead of cross-fading with the
 * rest. When the deck moves between two neighbouring slides that both show a `Morph` with the same
 * `id`, the content moves and resizes from where it is on one to where it is on the other over the
 * brand's transition, cross-fading its own look on the way, while the slides run their transition
 * underneath. A `Morph` in a step that is not shown yet, or whose `id` the other slide lacks, does
 * not fly. It has no box of its own (`display: contents`), so the layout places its child as if it
 * were not wrapped; wrap one element, since only the first flies.
 *
 * Static mode, `SlideView` copies, `window.__deck` moves and viewers who ask for reduced motion see
 * no morph.
 *
 * @throws Error when a prop is not one the catalog lists or `id` is missing or empty.
 */
export function Morph(props: MorphProps): ReactNode {
  checkComponentProps('Morph', props);
  const { id, children } = props;
  if (id.trim() === '') {
    throw new Error(
      '<Morph> needs an id, the name it shares with the next slide, for example <Morph id="logo">.',
    );
  }

  return (
    <div className="kit-morph" {...{ [MORPH_ATTRIBUTE]: id }}>
      {children}
    </div>
  );
}
