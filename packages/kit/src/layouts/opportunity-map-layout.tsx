import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { opportunityMapLayoutContract } from '#layouts/opportunity-map-layout.contract.ts';

import { smartPunctuation } from '#layout-parts.ts';
import {
  PatternImage,
  patternPosition,
  PatternSlide,
  usePatternStage,
} from '#layouts/pattern-slide.tsx';
import '#layouts/opportunity-map-layout.css';

/**
 * Keeps the geography fixed while the proposal and the limiting feature are added to their places.
 */
function OpportunityMap({
  frontmatter,
  slots,
}: LayoutProps<typeof opportunityMapLayoutContract>): ReactNode {
  const { title, eyebrow, map, districts, proposed, constraint, route, reveal } = frontmatter;
  const stage = usePatternStage(reveal, 2);
  return (
    <PatternSlide
      layout="opportunity-map"
      eyebrow={eyebrow}
      title={title}
      footnote={slots.footnote}>
      <div className="kit-opportunity">
        <figure className="kit-opportunity-map">
          <PatternImage image={map} />
          <svg
            className="kit-pattern-plot"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true">
            <polyline
              className="kit-opportunity-route"
              points={route.map(({ x, y }) => `${x},${y}`).join(' ')}
              pathLength={1}
              data-pattern-draw={stage >= 1}
            />
          </svg>
          <ul className="kit-opportunity-labels" aria-label="Map locations">
            {districts.map(({ label, point }) => (
              <MapLabel key={label} label={label} point={point} kind="context" shown />
            ))}
            <MapLabel
              label={proposed.label}
              point={proposed.point}
              kind="proposed"
              shown={stage >= 1}
            />
            <MapLabel
              label={constraint.label}
              point={constraint.point}
              kind="constraint"
              shown={stage >= 2}
            />
          </ul>
        </figure>
        <aside className="kit-opportunity-reading" aria-label="Expansion decision">
          <div data-pattern-visible={stage >= 1} aria-hidden={stage < 1}>
            <p className="kit-type-label kit-opportunity-kicker">Open first</p>
            <h3 className="kit-type-title">{smartPunctuation(proposed.label)}</h3>
            <p className="kit-type-small">{smartPunctuation(proposed.detail)}</p>
          </div>
          <div data-pattern-visible={stage >= 2} aria-hidden={stage < 2}>
            <p className="kit-type-label kit-opportunity-constraint">Expansion constraint</p>
            <h3 className="kit-type-title">{smartPunctuation(constraint.label)}</h3>
            <p className="kit-type-small">{smartPunctuation(constraint.detail)}</p>
          </div>
        </aside>
      </div>
    </PatternSlide>
  );
}

/**
 * Places a readable district, selected site or constraint directly at its geographic anchor.
 */
function MapLabel({
  label,
  point,
  kind,
  shown,
}: {
  label: string;
  point: { x: number; y: number };
  kind: 'context' | 'proposed' | 'constraint';
  shown: boolean;
}): ReactNode {
  return (
    <li
      className="kit-opportunity-pin kit-type-caption"
      style={patternPosition(point.x, point.y)}
      data-map-kind={kind}
      data-pattern-visible={shown}
      aria-hidden={!shown}>
      {smartPunctuation(label)}
    </li>
  );
}

/**
 * The map layout for a location decision with a demonstrable spatial constraint.
 */
export const opportunityMapLayout = defineLayout<typeof opportunityMapLayoutContract>({
  name: 'opportunity-map',
  component: OpportunityMap,
});
