import { defineLayout, type LayoutProps } from '@deckster/engine';
import { isValidElement, useRef, type CSSProperties, type ReactNode } from 'react';

import type { definitionLayoutContract } from '#layouts/definition-layout.contract.ts';

import {
  Footnote,
  Frame,
  Region,
  SlideHeader,
  smartPunctuation,
  useEnter,
  useFitLevel,
} from '#layout-parts.ts';
import '#layouts/definition-layout.css';

/**
 * The smallest composition, used after every larger level has been tried.
 */
const COMPACT_DEFINITION_LEVEL = {
  /**
   * The term's type step after the display sizes have been tried.
   */
  term: 'headline',

  /**
   * The term's multiplier at the smallest step.
   */
  scale: 1.5,

  /**
   * The type step for a dense definition.
   */
  body: 'small',

  /**
   * The example's type step in the densest composition.
   */
  example: 'caption',

  /**
   * Whether the entry uses its tighter spacing.
   */
  compact: true,
} as const;

/**
 * One composition of the entry, largest first: light content takes display and lead type; dense
 * content reduces the term, definition and spacing together. The full limit case in nocturne and
 * the long-word limit case in default, nocturne and wide-sans reach compact level 4.
 */
const DEFINITION_LEVELS = [
  { term: 'display', scale: 1.6, body: 'lead', example: 'body', compact: false },
  { term: 'display', scale: 1.25, body: 'lead', example: 'body', compact: false },
  { term: 'display', scale: 1, body: 'lead', example: 'body', compact: false },
  { term: 'display', scale: 0.85, body: 'body', example: 'body', compact: false },
  COMPACT_DEFINITION_LEVEL,
] as const;

/**
 * The type multiplier read by the kit's type classes.
 */
type TermStyle = CSSProperties & { '--kit-scale': number };

/**
 * A dictionary entry aligned to the shared content grid: term, optional metadata, meaning and an
 * example separated by a rule. A semantic definition list preserves the term/meaning relationship
 * without relying on color. The whole entry is measured so its fit stays stable during entrances.
 */
function DefinitionLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof definitionLayoutContract>): ReactNode {
  const region = useRef<HTMLDivElement>(null);
  const entry = useRef<HTMLDListElement>(null);
  const termEnter = useEnter(1);
  const bodyEnter = useEnter(2);
  const exampleEnter = useEnter(3);
  const key = JSON.stringify([frontmatter, textOf(slots.body), slots.footnote === undefined]);
  const { level } = useFitLevel(region, entry, DEFINITION_LEVELS.length, key, {
    restartOnFontLoad: true,
  });
  const size = DEFINITION_LEVELS[level] ?? COMPACT_DEFINITION_LEVEL;
  const style: TermStyle = { '--kit-scale': size.scale };
  const metadata = [
    frontmatter.pronunciation,
    frontmatter.kind === undefined ? undefined : smartPunctuation(frontmatter.kind),
  ].filter((value) => value !== undefined);
  return (
    <Frame
      layout="definition"
      variant={{ 'data-level': String(level), 'data-compact': String(size.compact) }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      <Region ref={region} className="kit-definition-region" place="optical">
        <dl ref={entry} className="kit-definition">
          <dt
            className={`kit-definition-term kit-heading kit-type-${size.term}`}
            data-fit="scaled"
            style={style}
            {...termEnter}>
            {smartPunctuation(frontmatter.term)}
          </dt>
          <dd className="kit-definition-meaning">
            {metadata.length === 0 ? null : (
              <p className="kit-definition-meta kit-type-small" {...termEnter}>
                {metadata.map((value, index) => (
                  <span key={index}>{value}</span>
                ))}
              </p>
            )}
            <div className={`kit-definition-body kit-prose kit-type-${size.body}`} {...bodyEnter}>
              {slots.body}
            </div>
            {frontmatter.example === undefined ? null : (
              <div className="kit-definition-example" {...exampleEnter}>
                <p className="kit-definition-example-label kit-type-label">
                  {smartPunctuation(frontmatter.labels.example)}
                </p>
                <p className={`kit-definition-example-text kit-type-${size.example}`}>
                  {smartPunctuation(frontmatter.example)}
                </p>
              </div>
            )}
          </dd>
        </dl>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The text held by an MDX slot, so edits to the meaning restart the fit ladder.
 */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textOf).join('');
  }

  return isValidElement<{ children?: ReactNode }>(node) ? textOf(node.props.children) : '';
}

/**
 * The `definition` layout's component.
 */
export const definitionLayout = defineLayout<typeof definitionLayoutContract>({
  name: 'definition',
  component: DefinitionLayout,
});
