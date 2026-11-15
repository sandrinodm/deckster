import type { SlideMeta } from '@deckster/engine/manifest';

import { deckCommand } from '@deckster/engine/command';
import {
  DEFAULT_LAYOUT,
  SLIDE_FRONTMATTER_HINTS,
  SlideFrontmatter,
} from '@deckster/engine/frontmatter';
import { fieldLimitBreaches, matchingVariants, slideFieldLimits } from '@deckster/engine/layout';
import { KEBAB_CASE_PATTERN } from '@deckster/engine/names';
import { Effect, Predicate } from 'effect';
import { parse, YAMLParseError } from 'yaml';

import type { CatalogLayout, LayoutCatalogIndex } from '#layouts/load-layout-catalog.ts';

import {
  invalidFields,
  unreadableFile,
  type DeckBuildError,
  type FileRef,
  type Problem,
} from '#errors.ts';
import { slideHintsFor, slideSchemaFor } from '#layouts/check-contract.ts';
import { suggest } from '#suggest.ts';
import { decodeFields, describeValue } from '#validation/decode-fields.ts';

/**
 * The line that opens and closes a frontmatter block.
 */
const FENCE = '---';

/**
 * A line break, Unix or Windows.
 */
const LINE_BREAK_PATTERN = /\r?\n/;

/**
 * The most characters of frontmatter the build parses.
 */
const MAX_FRONTMATTER_CHARS = 64 * 1024;

/**
 * The most alias references the YAML parser expands in one block.
 */
const MAX_ALIAS_COUNT = 100;

/**
 * How deep {@link unsafeKey} looks, so a hostile nesting cannot exhaust the stack.
 */
const MAX_NESTING = 64;

/**
 * The anchor name in the YAML parser's unresolved alias message.
 */
const ALIAS_NAME_PATTERN = /\): (\S+)$/;

/**
 * What frontmatter is called in messages.
 */
const WHAT = 'frontmatter';

/**
 * An MDX source split into its frontmatter and its body.
 */
export type MdxSource = {
  /**
   * The parsed frontmatter fields, not validated yet; `{}` for a slide without frontmatter.
   */
  data: unknown;

  /**
   * The MDX after the frontmatter. The frontmatter lines are replaced by empty lines, so line
   * numbers in MDX errors still match the file.
   */
  body: string;
};

/**
 * Splits the YAML frontmatter from the top of an MDX slide and parses it;
 * {@link validateFrontmatter} checks the fields.
 *
 * @param source - The whole MDX file.
 * @param ref - The file, for error messages.
 * @throws DeckBuildError in the error channel, for an unclosed block or invalid YAML.
 */
export const readMdxFrontmatter = Effect.fn('readMdxFrontmatter')(function* (
  source: string,
  ref: FileRef,
): Effect.fn.Return<MdxSource, DeckBuildError> {
  const lines = source.split(LINE_BREAK_PATTERN);
  if (lines[0]?.trim() !== FENCE) {
    return { data: {}, body: source };
  }

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === FENCE);
  if (end === -1) {
    return yield* unreadableFile(ref, WHAT, {
      message: 'The frontmatter opened with --- on line 1 is never closed.',
      fix: 'Add a line containing only --- after the last frontmatter field.',
    });
  }

  const data = yield* parseYaml(lines.slice(1, end).join('\n'), ref);
  const body = [...lines.slice(0, end + 1).map(() => ''), ...lines.slice(end + 1)].join('\n');
  return { data: data ?? {}, body };
});

/**
 * Validated frontmatter and the layout it names.
 */
export type ValidFrontmatter = {
  /**
   * The frontmatter with defaults applied: the fields every slide has plus the layout's own.
   */
  frontmatter: SlideMeta['frontmatter'];

  /**
   * The layout the slide names, from the catalog.
   */
  layout: CatalogLayout;
};

/**
 * Validates slide frontmatter from any source (MDX YAML or a TSX `frontmatter` export) against the
 * fields every slide has and the fields of the layout it names.
 *
 * @param data - The parsed frontmatter.
 * @param catalog - Every layout the deck can use.
 * @param ref - The file, for error messages.
 * @returns The frontmatter with defaults applied, and its layout.
 * @throws DeckBuildError in the error channel: for a layout the catalog lacks (with the closest
 *   name), and otherwise listing unknown fields (with "did you mean", or the layouts that have the
 *   field) and invalid values.
 */
export const validateFrontmatter = Effect.fn('validateFrontmatter')(function* (
  data: unknown,
  catalog: LayoutCatalogIndex,
  ref: FileRef,
): Effect.fn.Return<ValidFrontmatter, DeckBuildError> {
  if (!Predicate.isObject(data)) {
    return yield* unreadableFile(ref, WHAT, {
      message: `Frontmatter must be a set of fields, got ${describeValue(data)}.`,
      fix: 'Write one "key: value" field per line, for example `layout: default`.',
    });
  }

  const name = data.layout ?? DEFAULT_LAYOUT;
  const layout = typeof name === 'string' ? catalog.get(name) : undefined;
  if (layout === undefined) {
    if (typeof name === 'string' && KEBAB_CASE_PATTERN.test(name)) {
      return yield* invalidFields(ref, WHAT, [unknownLayoutProblem(name, catalog)]);
    }

    // Not a layout name at all: the base schema reports it with the value and the fix.
    const decoded = yield* decodeFields(data, {
      schema: SlideFrontmatter,
      hints: SLIDE_FRONTMATTER_HINTS,
      what: WHAT,
      ref,
    });
    return yield* invalidFields(ref, WHAT, [unknownLayoutProblem(decoded.layout, catalog)]);
  }

  const frontmatter = yield* decodeFields(data, {
    schema: slideSchemaFor(layout.contract),
    hints: slideHintsFor(layout.contract),
    what: WHAT,
    ref,
    unknownKeyFix: (key) => layoutsWithField(key, catalog),
  });
  const problems = [
    ...checkTitle(frontmatter.title, layout),
    ...checkFieldLimits(frontmatter, layout),
    ...checkCrossFields(frontmatter, layout),
  ];
  if (problems.length > 0) {
    return yield* invalidFields(ref, WHAT, problems);
  }

  return { frontmatter, layout };
});

/**
 * Problems with fields a layout's variant holds to a tighter limit than its schema, such as the
 * labels of a row of four stats. Only variants that select on frontmatter apply here; the slots a
 * slide fills are known once it renders.
 *
 * @param frontmatter - The decoded frontmatter.
 * @param layout - The slide's layout.
 */
function checkFieldLimits(
  frontmatter: Readonly<Record<string, unknown>>,
  layout: CatalogLayout,
): Problem[] {
  const contract = layout.contract;
  const slide = { frontmatter, filled: [] };
  const variants = matchingVariants(contract, slide)
    .filter((variant) => variant.fields !== undefined)
    .map((variant) => variant.name);
  return fieldLimitBreaches(frontmatter, slideFieldLimits(contract, slide)).map((breach) => ({
    message:
      `${breach.path}: The ${contract.name} layout sets at most ${breach.maxChars} characters ` +
      `here (${variants.join('; ')}), got ${breach.length}.`,
    fix:
      'Shorten it to the essentials; `' +
      deckCommand() +
      ' layouts --json` lists the limits of each ' +
      'variant.',
  }));
}

/**
 * Problems the layout's own cross-field checks find, such as a row with fewer values than there are
 * options, each prefixed with its field path.
 *
 * @param frontmatter - The decoded frontmatter.
 * @param layout - The slide's layout.
 */
function checkCrossFields(
  frontmatter: Readonly<Record<string, unknown>>,
  layout: CatalogLayout,
): Problem[] {
  const problems = layout.contract.checks?.(frontmatter) ?? [];
  return problems.map((problem) => ({
    message: `${problem.path}: ${problem.message}`,
    fix: problem.fix,
  }));
}

/**
 * Problems with a slide's title against its layout's title contract: missing where the layout needs
 * one, or longer than the layout sets.
 *
 * @param title - The decoded `title:`, if any.
 * @param layout - The slide's layout.
 */
function checkTitle(title: string | undefined, layout: CatalogLayout): Problem[] {
  const titleContract = layout.contract.title;
  const name = layout.contract.name;
  if (titleContract === undefined) {
    return [];
  }

  if (title === undefined || title.trim() === '') {
    return titleContract.required === true
      ? [
          {
            message: `title is required: the ${name} layout sets it as the slide's headline.`,
            fix: 'Write `title:` as the point of the slide in a short sentence.',
          },
        ]
      : [];
  }

  const max = titleContract.maxChars;
  if (max === undefined || title.length <= max) {
    return [];
  }

  return [
    {
      message: `title: The ${name} layout sets at most ${max} characters, got ${title.length}.`,
      fix: 'Shorten the title to the point itself and move detail into the body or the notes.',
    },
  ];
}

/**
 * The problem for a `layout:` that names no layout in the catalog.
 *
 * @param name - The layout name the slide gave.
 * @param catalog - Every layout.
 */
function unknownLayoutProblem(name: string, catalog: LayoutCatalogIndex): Problem {
  const names = [...catalog.keys()];
  const closest = suggest(name, names);
  const list = closest === undefined ? `Use one of: ${names.join(', ')}.` : `Use "${closest}".`;
  return {
    message: `layout: There is no "${name}" layout.`,
    fix: `${list} Run \`${deckCommand()} layouts\` to see what each layout is for.`,
  };
}

/**
 * The fix for a field the slide's layout does not have but other layouts do, or `undefined` when no
 * layout has it.
 *
 * @param key - The unknown field.
 * @param catalog - Every layout.
 */
function layoutsWithField(key: string, catalog: LayoutCatalogIndex): string | undefined {
  const owners = [...catalog.values()]
    .filter((layout) => Object.hasOwn(layout.contract.schema.fields, key))
    .map((layout) => layout.contract.name);
  if (owners.length === 0) {
    return undefined;
  }

  return `Remove it, or switch to a layout that has it: ${owners.join(', ')}.`;
}

/**
 * Parses the YAML between the fences. Any failure of the parser (a syntax error, an alias without
 * an anchor, an alias bomb) is a build error that names the file and, where the parser knows or the
 * alias can be found, the line. The input and the alias expansion are capped, and a `__proto__` key
 * is refused.
 *
 * @param yaml - The frontmatter lines, without the fences.
 * @param ref - The file, for error messages.
 */
function parseYaml(yaml: string, ref: FileRef): Effect.Effect<unknown, DeckBuildError> {
  if (yaml.length > MAX_FRONTMATTER_CHARS) {
    return Effect.fail(
      unreadableFile(ref, WHAT, {
        message: `The frontmatter is ${yaml.length} characters, more than the ${MAX_FRONTMATTER_CHARS} it may have.`,
        fix: 'Keep slide frontmatter to a few fields; move the content into the slide body.',
      }),
    );
  }

  return Effect.try({
    try: (): unknown => parse(yaml, { maxAliasCount: MAX_ALIAS_COUNT }),
    catch: (error) => error,
  }).pipe(
    Effect.catch((error) => Effect.fail(yamlProblem(error, yaml, ref))),
    Effect.flatMap((data) => {
      const bad = unsafeKey(data);
      return bad === undefined
        ? Effect.succeed(data)
        : Effect.fail(
            unreadableFile(ref, WHAT, {
              message: `The frontmatter has a "${bad}" key, which is not allowed.`,
              fix: `Rename the "${bad}" field.`,
            }),
          );
    }),
  );
}

/**
 * Turns what the YAML parser threw into a build error.
 *
 * @param error - What the parser threw.
 * @param yaml - The frontmatter lines, without the fences.
 * @param ref - The file, for error messages.
 */
function yamlProblem(error: unknown, yaml: string, ref: FileRef): DeckBuildError {
  const fix = 'Write one "key: value" field per line and quote values that contain a colon.';
  const reason = (error instanceof Error ? error.message : String(error)).split('\n')[0];
  if (error instanceof YAMLParseError) {
    // The YAML starts on the file's second line, after the opening ---.
    const line = (error.linePos?.[0].line ?? 0) + 1;
    return unreadableFile(ref, WHAT, { message: `Line ${line} is not valid YAML: ${reason}`, fix });
  }

  const alias = ALIAS_NAME_PATTERN.exec(reason ?? '')?.[1];
  const index =
    alias === undefined ? -1 : yaml.split('\n').findIndex((l) => l.includes(`*${alias}`));
  const where = index < 0 ? 'The frontmatter' : `Line ${index + 2}`;
  return unreadableFile(ref, WHAT, {
    message: `${where} is not valid YAML: ${reason}`,
    fix: 'Define each alias with an anchor (`&name`) before it is used, and avoid aliases of aliases.',
  });
}

/**
 * The first own key that must not appear in frontmatter, searching nested objects and arrays.
 *
 * @param value - Parsed YAML.
 * @param depth - How deep the search is.
 */
function unsafeKey(value: unknown, depth = 0): string | undefined {
  if (depth > MAX_NESTING || typeof value !== 'object' || value === null) {
    return undefined;
  }

  if (Object.hasOwn(value, '__proto__')) {
    return '__proto__';
  }

  for (const child of Object.values(value)) {
    const found = unsafeKey(child, depth + 1);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}
