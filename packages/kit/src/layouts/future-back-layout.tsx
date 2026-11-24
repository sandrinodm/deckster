import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { futureBackLayoutContract } from '#layouts/future-back-layout.contract.ts';

import { smartPunctuation } from '#layout-parts.ts';
import { PatternImage, PatternSlide, usePatternStage } from '#layouts/pattern-slide.tsx';
import '#layouts/future-back-layout.css';

/**
 * Keeps the future outcome in place as its prerequisite chain is exposed from right to left.
 */
function FutureBack({
  frontmatter,
  slots,
}: LayoutProps<typeof futureBackLayoutContract>): ReactNode {
  const { title, eyebrow, reveal, future, capabilities, bet } = frontmatter;
  const stage = usePatternStage(reveal, 2);
  return (
    <PatternSlide layout="future-back" eyebrow={eyebrow} title={title} footnote={slots.footnote}>
      <div className="kit-future-chain">
        <figure className="kit-future-end">
          <div className="kit-future-art">
            <PatternImage image={future.image} />
          </div>
          <figcaption>
            <p className="kit-future-kicker kit-type-label">{smartPunctuation(future.when)}</p>
            <p className="kit-type-lead">{smartPunctuation(future.outcome)}</p>
          </figcaption>
        </figure>
        <div
          className="kit-future-capabilities"
          data-pattern-visible={stage >= 1}
          aria-hidden={stage < 1}>
          <p className="kit-future-bridge kit-type-label">
            <span aria-hidden="true">←</span> It requires
          </p>
          <ul>
            {capabilities.map(({ name, reason }) => (
              <li key={name}>
                <h3 className="kit-type-small">{smartPunctuation(name)}</h3>
                <p className="kit-type-caption">{smartPunctuation(reason)}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="kit-future-bet" data-pattern-visible={stage >= 2} aria-hidden={stage < 2}>
          <p className="kit-future-bridge kit-type-label">
            <span aria-hidden="true">←</span> Prove it first
          </p>
          <p className="kit-future-kicker kit-type-label">{smartPunctuation(bet.when)}</p>
          <h3 className="kit-type-title">{smartPunctuation(bet.action)}</h3>
          <p className="kit-type-small">{smartPunctuation(bet.test)}</p>
        </div>
      </div>
    </PatternSlide>
  );
}

/**
 * The future-back layout for a pictured target and its two prerequisite stages.
 */
export const futureBackLayout = defineLayout<typeof futureBackLayoutContract>({
  name: 'future-back',
  component: FutureBack,
});
