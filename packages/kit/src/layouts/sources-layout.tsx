import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useRef, type CSSProperties, type ReactNode } from 'react';

import type { SourceEntry, sourcesLayoutContract } from '#layouts/sources-layout.contract.ts';

import {
  enterProps,
  Footnote,
  Frame,
  Region,
  SlideHeader,
  smartPunctuation,
  useEnter,
  useFitLevel,
} from '#layout-parts.ts';
import { shortAddress } from '#layouts/sources-address.ts';
import { linkAttributes } from '#links/link-target.ts';
import '#layouts/sources-layout.css';

/**
 * Five references start a second column, keeping at most four citations in each. Keep equal to
 * `SOURCES_TWO_COLUMNS` in the contract.
 */
const TWO_COLUMN_COUNT = 5;

/**
 * The longest visible address in one column, including the ellipsis. Keep equal to the address caps
 * in the `sources` hint of the contract.
 */
const ADDRESS_MAX_CHARS_ONE_COLUMN = 64;

/**
 * The longest visible address in two columns, including the ellipsis. Keep equal to the address
 * caps in the `sources` hint of the contract.
 */
const ADDRESS_MAX_CHARS_TWO_COLUMNS = 40;

/**
 * The first reference enters after the header and optional context.
 */
const FIRST_SOURCE_ORDER = 2;

/**
 * The digits in a citation index, matching the agenda's list numbering.
 */
const NUMBER_DIGITS = 2;

/**
 * The citation sizes, largest first. Light content fills balanced rows at headline or title size;
 * dense references step down through body and small to caption, with compact final spacing.
 */
const SOURCE_LEVELS = [
  { title: 'headline', detail: 'body', compact: false, roomy: true },
  { title: 'title', detail: 'body', compact: false, roomy: true },
  { title: 'title', detail: 'small', compact: false, roomy: true },
  { title: 'lead', detail: 'small', compact: false, roomy: true },
  { title: 'body', detail: 'small', compact: false, roomy: true },
  { title: 'body', detail: 'caption', compact: true, roomy: true },
  { title: 'small', detail: 'caption', compact: false, roomy: false },
  { title: 'small', detail: 'caption', compact: false, roomy: false, tight: true },
  { title: 'small', detail: 'caption', compact: true, roomy: false },
  { title: 'caption', detail: 'caption', compact: true, roomy: false },
] as const;

/**
 * The custom property that arranges citations down each column before starting the next.
 */
type SourcesStyle = CSSProperties & {
  /**
   * How many source rows each column holds.
   */
  '--kit-source-rows': number;
};

/**
 * The numbered sources, in citation order down the left column and then down the right. A single
 * ordered list keeps assistive reading order identical to the visible order. The fit ladder uses
 * the full list, so optional metadata and long titles determine its size together.
 */
function SourcesLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof sourcesLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const { sources } = frontmatter;
  const columns = sources.length >= TWO_COLUMN_COUNT ? 2 : 1;
  const rows = Math.ceil(sources.length / columns);
  const region = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const key = JSON.stringify([
    sources,
    frontmatter.title,
    slots.body === undefined,
    slots.footnote === undefined,
  ]);
  const { level } = useFitLevel(region, list, SOURCE_LEVELS.length, key, {
    height: sourcesHeight,
    restartOnFontLoad: true,
  });
  const size = SOURCE_LEVELS[level] ?? SOURCE_LEVELS[SOURCE_LEVELS.length - 1]!;
  const numberType = size.title === 'headline' ? 'title' : size.title;
  const style: SourcesStyle = { '--kit-source-rows': rows };
  return (
    <Frame
      layout="sources"
      variant={{
        'data-count': String(sources.length),
        'data-columns': String(columns),
        'data-level': String(level),
        'data-compact': String(size.compact),
        'data-roomy': String(size.roomy),
        'data-tight': String('tight' in size && size.tight),
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      {slots.body === undefined ? null : (
        <div className="kit-sources-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-sources-region">
        {/* WebKit drops list semantics with list-style: none. */}
        {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles */}
        <ol role="list" ref={list} className="kit-sources" style={style}>
          {sources.map((source, index) => (
            <li
              key={index}
              className={`kit-source kit-type-${size.title}`}
              {...enterProps(FIRST_SOURCE_ORDER + index, isStatic)}>
              <span
                className={`kit-source-number kit-numeric kit-type-${numberType}`}
                aria-hidden="true">
                {String(index + 1).padStart(NUMBER_DIGITS, '0')}
              </span>
              <div className="kit-source-text">
                <cite className={`kit-source-title kit-heading kit-type-${size.title}`}>
                  {smartPunctuation(source.title)}
                </cite>
                <SourceDetails
                  source={source}
                  type={`kit-type-${size.detail}`}
                  addressMax={
                    columns === 1 ? ADDRESS_MAX_CHARS_ONE_COLUMN : ADDRESS_MAX_CHARS_TWO_COLUMNS
                  }
                />
              </div>
            </li>
          ))}
        </ol>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The natural height of each grid row, including gaps, even when roomy tracks stretch. Both columns
 * share the taller citation in each row; entrance transforms do not affect offsetHeight.
 */
function sourcesHeight(list: HTMLElement): number {
  const items = Array.from(list.querySelectorAll<HTMLElement>('.kit-source'));
  const style = getComputedStyle(list);
  const rows = Number(style.getPropertyValue('--kit-source-rows'));
  const gap = Number.parseFloat(style.rowGap) || 0;
  return Array.from({ length: rows }, (_, row) =>
    Math.max(items[row]?.offsetHeight ?? 0, items[row + rows]?.offsetHeight ?? 0),
  ).reduce((total, height) => total + height, gap * (rows - 1));
}

/**
 * A reference's optional bibliographic line and its underlined destination. URLs retain their
 * original href; only the visible label loses the scheme and, when long, its tail.
 */
function SourceDetails({
  source,
  type,
  addressMax,
}: {
  source: SourceEntry;
  type: string;
  addressMax: number;
}): ReactNode {
  const metadata = [source.author, source.publisher, source.year]
    .filter((value) => value !== undefined)
    .join(' · ');
  return (
    <>
      {metadata.length === 0 ? null : (
        <p className={`kit-source-meta ${type}`}>{smartPunctuation(metadata)}</p>
      )}
      {source.url === undefined ? null : (
        <a className={`kit-source-link ${type}`} {...linkAttributes(source.url)} title={source.url}>
          {shortAddress(source.url, addressMax)}
        </a>
      )}
    </>
  );
}

/**
 * The sources layout's component.
 */
export const sourcesLayout = defineLayout<typeof sourcesLayoutContract>({
  name: 'sources',
  component: SourcesLayout,
});
