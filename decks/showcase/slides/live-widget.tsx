import type { ReactNode } from 'react';

import { Notes } from '@deckster/engine';
import { Live } from '@deckster/kit';

import { Counter } from '../lib/counter.tsx';

/**
 * Read by the build without running the slide, so it must stay a literal.
 */
export const frontmatter = {
  layout: 'demo',
  title: 'A React widget runs inside the slide',
  eyebrow: 'Live, inline',
  budget: '1m',
};

/**
 * The widget, hosted inline in the slide's own React tree. Its poster is what exports and `?static`
 * show, so the finished frame never depends on a click.
 */
export default function LiveWidget(): ReactNode {
  return (
    <>
      <Live
        component={Counter}
        label="A counter"
        poster={() => (
          <div className="counter">
            <p className="counter-label">Votes for the demo</p>
            <output className="counter-value">3</output>
            <p className="counter-hint">Click here, then use the arrow keys</p>
          </div>
        )}
      />
      <Notes>
        This slide is a TSX file, and the counter is plain React. [click the counter, press the
        arrow keys] The arrows now belong to the widget, so the deck stays put. Escape hands the
        keyboard back, and the hint in the corner says so. In the PDF you get the poster: the
        counter at three. Transition: that is what a slide can show. Part three: how it stays right.
      </Notes>
    </>
  );
}

/**
 * What to try, beside the demo.
 */
export function Aside(): ReactNode {
  return (
    <ul>
      <li>Plain React, no iframe</li>
      <li>Focus inside keeps the arrow keys</li>
      <li>Escape returns the keyboard</li>
    </ul>
  );
}
