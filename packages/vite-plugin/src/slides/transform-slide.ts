import type { AnyLayoutContract } from '@deckster/engine/layout';
import type { MdxPlugins } from '@deckster/engine/mdx';

import { SLIDE_META_EXPORT, type SlideKind, type SlideMeta } from '@deckster/engine/manifest';
import { BODY_SLOT, slotTag } from '@deckster/engine/slots';
import { Effect } from 'effect';

import type { LayoutCatalogIndex } from '#layouts/load-layout-catalog.ts';

import {
  invalidExports,
  invalidSlots,
  tryDeckBuild,
  type DeckBuildError,
  type FileRef,
} from '#errors.ts';
import { checkSurface, withLayoutSurface, type SlideBrand } from '#slides/check-surface.ts';
import { compileMdx, type MdxWarning } from '#slides/compile-mdx.ts';
import { readMdxFrontmatter, validateFrontmatter } from '#slides/frontmatter.ts';
import { checkSlotUsage } from '#slides/slot-usage.ts';
import { readTsxMeta } from '#slides/tsx-meta.ts';

/**
 * A slide file to compile.
 */
export type SlideSource = FileRef & {
  /**
   * The slide id: the file name without its extension.
   */
  id: string;

  /**
   * The slide's source code.
   */
  code: string;

  /**
   * Every layout the deck can use; the slide's frontmatter and slots are checked against the one it
   * names.
   */
  layouts: LayoutCatalogIndex;

  /**
   * The deck's brand; when given, a `surface:` the brand lacks fails the build.
   */
  brand?: SlideBrand;

  /**
   * The plugins the deck's MDX extensions add to the compile.
   */
  mdx?: MdxPlugins;

  /**
   * Called with each warning a plugin reports while the slide compiles.
   */
  onWarning?: (message: string, warning: MdxWarning) => void;
};

/**
 * A slide that passed the build's checks: its module code without the `slideMeta` export, and that
 * export's value.
 */
type CheckedSlide = {
  /**
   * The compiled MDX, or the TSX source as written.
   */
  code: string;

  /**
   * The validated frontmatter, the title, the notes and the filled slots.
   */
  meta: SlideMeta;
};

/**
 * Compiles an MDX slide for its layout and appends its `slideMeta` export (validated frontmatter,
 * title, notes, filled slots).
 *
 * @param slide - The slide file and its source.
 * @param development - Emit development JSX with source locations.
 * @returns JavaScript for the slide module.
 * @throws DeckBuildError in the error channel, for invalid frontmatter (an unknown layout, fields
 *   the layout does not have, a surface the brand lacks), MDX that does not compile, exports the
 *   build does not accept, or slots the layout does not have or needs.
 */
export const transformMdxSlide = Effect.fn('transformMdxSlide')(function* (
  slide: SlideSource,
  development: boolean,
): Effect.fn.Return<string, DeckBuildError> {
  const { code, meta } = yield* compileMdxSlide(slide, development);
  return `${code}\n${slideMetaExport(meta)}`;
});

/**
 * The `slideMeta` the build gives a slide, read the way `transformMdxSlide` and `transformTsxSlide`
 * read it: the validated frontmatter with defaults applied (so `frontmatter.layout` is the layout
 * the slide renders with), the title (the frontmatter `title`, else the first heading outside
 * `<Notes>`, an MDX heading after the deck's MDX extensions ran, else the slide id), the notes and
 * the filled slots.
 *
 * @param slide - The slide file, its source and its kind.
 * @returns The slide's `slideMeta`.
 * @throws DeckBuildError in the error channel for anything that fails the slide's build.
 */
export const readSlideMeta = Effect.fn('readSlideMeta')(function* (
  slide: SlideSource & { kind: SlideKind },
): Effect.fn.Return<SlideMeta, DeckBuildError> {
  const { meta } =
    slide.kind === 'mdx' ? yield* compileMdxSlide(slide, false) : yield* readTsxSlide(slide);
  return meta;
});

/**
 * Compiles an MDX file under `slides/` that the deck does not list, such as a partial a slide
 * imports, as plain MDX: no frontmatter, layout or `slideMeta`.
 *
 * @param slide - The file and its source.
 * @param development - Emit development JSX with source locations.
 * @returns JavaScript whose default export renders the MDX.
 * @throws DeckBuildError in the error channel for MDX that does not compile.
 */
export const transformMdxPartial = Effect.fn('transformMdxPartial')(function* (
  slide: FileRef & { code: string } & Pick<SlideSource, 'mdx' | 'onWarning'>,
  development: boolean,
): Effect.fn.Return<string, DeckBuildError> {
  const compiled = yield* compileMdx(slide.code, slide, {
    development,
    ...extensionOptions(slide),
  });
  return compiled.code;
});

/**
 * Validates a TSX slide's frontmatter export and slot exports, and appends its `slideMeta` export.
 * The TSX itself is left for the React plugin to compile.
 *
 * @param slide - The slide file and its source.
 * @returns The TSX source with the `slideMeta` export appended.
 * @throws DeckBuildError in the error channel, for a non-literal or invalid frontmatter export, a
 *   surface the brand lacks, a missing default export, a reserved or unreadable export, or slot
 *   exports the layout does not have or needs.
 */
export const transformTsxSlide = Effect.fn('transformTsxSlide')(function* (
  slide: SlideSource,
): Effect.fn.Return<string, DeckBuildError> {
  const { code, meta } = yield* readTsxSlide(slide);
  return `${code}\n${slideMetaExport(meta)}`;
});

/**
 * Compiles an MDX slide for its layout and reads its `slideMeta`, as `transformMdxSlide` does.
 *
 * @param slide - The slide file and its source.
 * @param development - Emit development JSX with source locations.
 */
const compileMdxSlide = Effect.fn('compileMdxSlide')(function* (
  slide: SlideSource,
  development: boolean,
): Effect.fn.Return<CheckedSlide, DeckBuildError> {
  const { data, body } = yield* readMdxFrontmatter(slide.code, slide);
  const validated = yield* validateFrontmatter(data, slide.layouts, slide);
  const { layout } = validated;
  yield* checkSurface(validated.frontmatter, slide.brand, slide);
  const frontmatter = withLayoutSurface(
    validated.frontmatter,
    layout.contract.surface,
    slide.brand,
  );
  const compiled = yield* compileMdx(body, slide, {
    development,
    frontmatter,
    slotTags: slotTagsOf(layout.contract),
    ...extensionOptions(slide),
  });
  if (compiled.exportProblems.length > 0) {
    return yield* invalidExports(slide, compiled.exportProblems);
  }

  const usage = {
    kind: 'mdx',
    candidates: compiled.candidates,
    hasBody: compiled.hasBody,
  } as const;
  const { slots, problems } = checkSlotUsage(usage, layout, slide.layouts);
  if (problems.length > 0) {
    return yield* invalidSlots(slide, problems);
  }

  const title = frontmatter.title ?? compiled.heading ?? slide.id;
  return { code: compiled.code, meta: { frontmatter, title, notes: compiled.notes, slots } };
});

/**
 * Reads and checks a TSX slide's `slideMeta`, as `transformTsxSlide` does; the code is the source.
 *
 * @param slide - The slide file and its source.
 */
const readTsxSlide = Effect.fn('readTsxSlide')(function* (
  slide: SlideSource,
): Effect.fn.Return<CheckedSlide, DeckBuildError> {
  const meta = yield* tryDeckBuild(() => readTsxMeta(slide.code, slide));
  const validated = yield* validateFrontmatter(meta.frontmatter, slide.layouts, slide);
  const { layout } = validated;
  yield* checkSurface(validated.frontmatter, slide.brand, slide);
  const frontmatter = withLayoutSurface(
    validated.frontmatter,
    layout.contract.surface,
    slide.brand,
  );
  const usage = { kind: 'tsx', candidates: meta.candidates, hasBody: true } as const;
  const { slots, problems } = checkSlotUsage(usage, layout, slide.layouts);
  if (problems.length > 0) {
    return yield* invalidSlots(slide, problems);
  }

  const title = frontmatter.title ?? meta.heading ?? slide.id;
  return { code: slide.code, meta: { frontmatter, title, notes: meta.notes, slots } };
});

/**
 * The compile options a slide's MDX extensions contribute; left out when it has none.
 *
 * @param slide - The slide file.
 */
function extensionOptions(slide: Pick<SlideSource, 'mdx' | 'onWarning'>): {
  extensions?: MdxPlugins;
  onWarning?: (message: string, warning: MdxWarning) => void;
} {
  return {
    ...(slide.mdx === undefined ? {} : { extensions: slide.mdx }),
    ...(slide.onWarning === undefined ? {} : { onWarning: slide.onWarning }),
  };
}

/**
 * The tags of a contract's named slots, mapped to their slot names.
 *
 * @param contract - The layout's contract.
 */
function slotTagsOf(contract: AnyLayoutContract): Map<string, string> {
  const slots = Object.keys(contract.slots).filter((slot) => slot !== BODY_SLOT);
  return new Map(slots.map((slot) => [slotTag(slot), slot]));
}

/**
 * The `slideMeta` export appended to every slide module.
 *
 * @param meta - The validated frontmatter, the title, the notes and the filled slots.
 */
function slideMetaExport(meta: SlideMeta): string {
  return `export const ${SLIDE_META_EXPORT} = ${JSON.stringify(meta)};\n`;
}
