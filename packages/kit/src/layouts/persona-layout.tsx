import { defineLayout, type LayoutProps } from '@deckster/engine';
import { useId, useRef, type CSSProperties, type ReactNode } from 'react';

import type { personaLayoutContract } from '#layouts/persona-layout.contract.ts';

import { Portrait } from '#foundation/portrait.tsx';
import { stripQuoteMarks } from '#foundation/quote-marks.ts';
import {
  FittedText,
  Footnote,
  Frame,
  Region,
  SlideHeader,
  smartPunctuation,
  useEnter,
  useFitLevel,
  type FitRung,
} from '#layout-parts.ts';
import '#layouts/persona-layout.css';

/**
 * The research sizes, largest first. Both lists step down together; the portrait uses the room
 * beside them without forcing a shorter quotation or smaller findings.
 */
const PERSONA_LEVELS = [
  { item: 'lead', quote: 1, compact: false },
  { item: 'lead', quote: 0.85, compact: false },
  { item: 'lead', quote: 0.7, compact: false },
  { item: 'body', quote: 0.6, compact: false },
  { item: 'body', quote: 0.5, compact: true },
  { item: 'small', quote: 0.6, compact: false },
  { item: 'small', quote: 0.5, compact: true },
  { item: 'caption', quote: 0.5, compact: true },
] as const;

/**
 * Prefer a single line for a short name. Longer names take two lines at a smaller size, so a medium
 * name cannot make the identity taller than the longest name at its fitted size.
 */
const PERSONA_NAME_LADDER: readonly FitRung[] = [
  { scale: 1, maxLines: 1 },
  { scale: 0.88, maxLines: 1 },
  { scale: 0.78, maxLines: 2 },
  { scale: 0.7, maxLines: 2 },
  { scale: 0.62, maxLines: 2 },
];

/**
 * The quotation's multiplier of the brand's quote type step.
 */
type PersonaQuoteStyle = CSSProperties & { '--kit-scale': number };

/**
 * A research sheet under an assertion title: the portrait and identity in three columns, the
 * participant’s words immediately followed by two labelled lists in the last nine. The research
 * steps down when dense, while the portrait yields height to a long identity independently.
 */
function PersonaLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof personaLayoutContract>): ReactNode {
  const nameId = useId();
  const region = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const identityEnter = useEnter(1);
  const quoteEnter = useEnter(2);
  const listsEnter = useEnter(3);
  const key = JSON.stringify([frontmatter, slots.body === undefined, slots.footnote === undefined]);
  const { level } = useFitLevel(region, sheet, PERSONA_LEVELS.length, key, {
    height: personaHeight,
    restartOnFontLoad: true,
  });
  const size = PERSONA_LEVELS[level] ?? { item: 'caption', quote: 0.5, compact: true };
  const quoteStyle: PersonaQuoteStyle = { '--kit-scale': size.quote };
  return (
    <Frame
      layout="persona"
      variant={{ 'data-level': String(level), 'data-compact': String(size.compact) }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      <Region ref={region} className="kit-persona-region">
        <div ref={sheet} className="kit-persona-sheet">
          <section className="kit-persona-identity" aria-labelledby={nameId} {...identityEnter}>
            <Portrait
              className="kit-persona-portrait"
              name={frontmatter.name}
              photo={frontmatter.photo}
              focal={frontmatter.focal}
              treatment={frontmatter.treatment}
            />
            <FittedText
              as="p"
              className="kit-persona-name kit-heading kit-type-title"
              ladder={PERSONA_NAME_LADDER}>
              <span id={nameId}>{smartPunctuation(frontmatter.name)}</span>
            </FittedText>
            <p className="kit-persona-role kit-type-body">{smartPunctuation(frontmatter.role)}</p>
          </section>
          <div className="kit-persona-research">
            {slots.body === undefined ? null : (
              <blockquote
                className="kit-persona-quote kit-quote-text kit-heading kit-type-quote"
                data-fit="scaled"
                style={quoteStyle}
                {...quoteEnter}>
                {stripQuoteMarks(slots.body)}
              </blockquote>
            )}
            <div className="kit-persona-lists" {...listsEnter}>
              <ResearchList
                title={frontmatter.labels.goals}
                items={frontmatter.goals}
                type={size.item}
              />
              <ResearchList
                title={frontmatter.labels.frustrations}
                items={frontmatter.frustrations}
                type={size.item}
              />
            </div>
          </div>
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The research's natural height and the identity's contents, ignoring entrance transforms. The
 * portrait can shrink within its column, so a long role does not reduce the findings' type size.
 */
function personaHeight(sheet: HTMLElement): number {
  const identity = sheet.querySelector<HTMLElement>('.kit-persona-identity');
  const research = sheet.querySelector<HTMLElement>('.kit-persona-research');
  return Math.max(identity?.scrollHeight ?? 0, research?.scrollHeight ?? 0);
}

/**
 * Props of one labelled research list.
 */
type ResearchListProps = {
  /**
   * The explicit heading, so colour is never needed to distinguish the lists.
   */
  title: string;

  /**
   * The participant’s goals or frustrations.
   */
  items: readonly string[];

  /**
   * The shared type step selected for both lists.
   */
  type: (typeof PERSONA_LEVELS)[number]['item'];
};

/**
 * A semantic list with a heading and a quiet rule, rather than positive and negative colours.
 */
function ResearchList({ title, items, type }: ResearchListProps): ReactNode {
  return (
    <section className="kit-persona-list">
      <h3 className="kit-persona-list-title kit-type-label">{smartPunctuation(title)}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={index} className={`kit-type-${type}`}>
            {smartPunctuation(item)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The `persona` layout's component, including the shared photo handling used by bio.
 */
export const personaLayout = defineLayout<typeof personaLayoutContract>({
  name: 'persona',
  component: PersonaLayout,
});
