import type { ReactNode } from 'react';

import { Notes } from '@deckster/engine';
import { Live } from '@deckster/kit';

import { Counter } from '../lib/counter.tsx';

/**
 * Read by the build without running the slide, so it must stay a literal.
 */
export const frontmatter = {
  layout: 'demo',
  title: 'A widget lives in the slide',
  eyebrow: 'Inline',
  budget: '1m',
};

/**
 * The widget, hosted inline in the slide's own React tree. Its poster is what exports and `?static`
 * show, so the finished frame never depends on a click.
 */
export default function CounterSlide(): ReactNode {
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
        Click the counter and press the arrow keys: they change the number and the deck stays put.
        Escape hands the keyboard back, and the hint in the corner says so.
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
      <li>It is plain React in this slide</li>
      <li>Focus inside keeps the arrow keys</li>
      <li>Escape returns the keyboard</li>
    </ul>
  );
}
