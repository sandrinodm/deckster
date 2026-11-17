import type { ReactNode } from 'react';

import { Notes } from '@deckster/engine';
import { Live } from '@deckster/kit';

import { INITIAL_DROPS } from '../lib/price/plans.ts';
import { PriceCalculator, PriceSheet } from '../lib/price/price-calculator.tsx';

/**
 * Read by the build without running the slide, so it must stay a literal.
 */
export const frontmatter = {
  layout: 'demo',
  title: 'Price your own drops',
  eyebrow: 'Try it',
  budget: '1m',
};

/**
 * The drop price calculator, hosted inline in the slide's own React tree. Its poster is the same
 * sheet at the calculator's opening value, so exports and `?static` show what the room first sees.
 */
export default function DemoLive(): ReactNode {
  return (
    <>
      <Live
        component={PriceCalculator}
        label="A drop price calculator"
        poster={() => <PriceSheet drops={INITIAL_DROPS} />}
      />
      <Notes>
        `demo` from a TSX slide with a `&lt;Live&gt;` widget (a small React component in `lib/`) and
        a poster drawn from the same component; use it when the room should be able to touch the
        thing. Here is the price list as something you can move. At 600 drops a month, Open Network
        is the cheapest way to pay. [drag the slider past 950] Above about 950 drops, the hub
        plan&apos;s monthly fee pays for itself. Pay per drop is for shops that send a few drops a
        week. In the PDF you get the poster, at 600 drops.
      </Notes>
    </>
  );
}

/**
 * What to try, beside the calculator.
 */
export function Aside(): ReactNode {
  return (
    <ul>
      <li>Drag the slider, or click it and use the arrow keys</li>
      <li>Past 950 drops a month, the hub plan wins</li>
    </ul>
  );
}
