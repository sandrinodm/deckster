/**
 * The two changes `deckster layouts eject` makes to a kit stylesheet it copies, both on the text:
 * renaming the classes a copied helper owns, and scoping a stylesheet a layout shares with other
 * kit layouts to the ejected layout.
 */

/**
 * The start of every class of the kit.
 */
const KIT_CLASS_PREFIX = 'kit-';

/**
 * Who a copy of the kit's helpers is ejected into: a brand's `layouts/_shared/` or a deck's.
 */
export type ClassOwner = 'brand' | 'deck';

/**
 * The start a copied helper's classes get instead of `kit-`, by who owns the copy, so the kit's own
 * copy of the helper's stylesheet, which stays loaded for the kit layouts that still use the
 * helper, does not style the copy, and an edit to the copy does not reach those layouts. A brand's
 * copy and a deck's copy get different starts because a deck's slides load both: a deck that ejects
 * the same helper as its brand must not restyle the brand's layouts. Both are as long as `kit-` on
 * purpose: a rename then moves no line break, so the copied files stay formatted. Neither starts
 * like the engine's `deck-…` classes.
 */
export const OWN_CLASS_PREFIX: Readonly<Record<ClassOwner, string>> = {
  /**
   * The start of a class in a brand's copy.
   */
  brand: 'own-',

  /**
   * The start of a class in a deck's copy.
   */
  deck: 'dck-',
};

/**
 * Matches a kit class name wherever it is written as a whole word: not part of a longer name, a
 * custom property (`--kit-…`) or an id built from one.
 */
const KIT_CLASS_TOKEN = /(?<![\w-])kit-[a-z0-9]+(?:-[a-z0-9]+)*(?![\w-])/gu;

/**
 * Matches a kit class in a selector, capturing the name.
 */
const CLASS_SELECTOR = /\.(kit-[a-z0-9]+(?:-[a-z0-9]+)*)(?![\w-])/gu;

/**
 * Matches a CSS comment.
 */
const CSS_COMMENT = /\/\*[\s\S]*?\*\//gu;

/**
 * Matches the frame class in a selector, as a whole class.
 */
const FRAME_CLASS = /\.kit-frame(?![\w-])/u;

/**
 * Matches every `[data-layout='…']` attribute selector, capturing the layout name.
 */
const LAYOUT_ATTRIBUTE = /\[data-layout=(['"])([^'"]+)\1\]/gu;

/**
 * Matches the start of a `:not()` pseudo-class, right after its opening parenthesis.
 */
const NOT_OPEN = /:not\(/gu;

/**
 * Matches a selector that starts at the document's root, which no rule under a frame can match.
 */
const ROOT_SELECTOR = /^(?::root|html)(?![\w-])/u;

/**
 * The at-rules whose blocks hold style rules, which are scoped in turn.
 */
const GROUPING_AT_RULES: ReadonlySet<string> = new Set([
  '@layer',
  '@media',
  '@supports',
  '@container',
]);

/**
 * The at-rules whose blocks hold no style rules to scope, which are copied as they are.
 */
const VERBATIM_AT_RULES: ReadonlySet<string> = new Set([
  '@keyframes',
  '@font-face',
  '@property',
  '@counter-style',
  '@page',
  '@font-palette-values',
  '@font-feature-values',
]);

/**
 * The widest line the formatter allows.
 */
const MAX_LINE_CHARS = 100;

/**
 * One step of indentation.
 */
const INDENT = '  ';

/**
 * The combinators that stay in front of the compound selector they lead to.
 */
const COMBINATORS: ReadonlySet<string> = new Set(['>', '+', '~']);

/**
 * The text that follows a rule's selector list on its last line.
 */
const RULE_OPEN = ' {';

/**
 * Matches the indent at the end of the text before a rule.
 */
const TRAILING_INDENT = /[ \t]*$/u;

/**
 * Matches a run of white space.
 */
const WHITE_SPACE_RUN = /\s+/gu;

/**
 * Matches one white-space character.
 */
const WHITE_SPACE = /\s/u;

/**
 * Matches the white space after an opening parenthesis.
 */
const SPACE_AFTER_PAREN = /\(\s+/gu;

/**
 * Matches the white space before a closing parenthesis.
 */
const SPACE_BEFORE_PAREN = /\s+\)/gu;

/**
 * Matches the name of an at-rule at the start of its prelude.
 */
const AT_RULE_NAME = /^@[a-z-]+/u;

/**
 * Matches three or more line breaks in a row, with any spaces between them.
 */
const EXTRA_BLANK_LINES = /\n(?:[ \t]*\n){2,}/gu;

/**
 * Matches an opening brace followed by a blank line.
 */
const BLANK_AFTER_BRACE = /\{\n(?:[ \t]*\n)+/gu;

/**
 * Matches a blank line before a closing brace.
 */
const BLANK_BEFORE_BRACE = /\n(?:[ \t]*\n)+([ \t]*\})/gu;

/**
 * One piece of a stylesheet block: a rule, an at-rule or a declaration, with the white space and
 * comments in front of it.
 */
type CssItem = {
  /**
   * The white space and comments before the item.
   */
  readonly leading: string;

  /**
   * Everything before the block's `{`, or the whole declaration with its `;`.
   */
  readonly prelude: string;

  /**
   * The text between the item's braces, or nothing for a declaration.
   */
  readonly body: string | undefined;
};

/**
 * A stylesheet scoped to one layout.
 */
export type ScopedStylesheet = {
  /**
   * The scoped stylesheet's text.
   */
  readonly css: string;

  /**
   * The rules the scoping could not keep to the layout, such as a `:root` rule or an `@scope`
   * block; empty when every rule is scoped.
   */
  readonly problems: readonly string[];
};

/**
 * Every kit class name in a text, as whole words: `kit-mark` in `className="kit-mark"` and
 * `.kit-mark`, but not in `kit-mark-mono` or `--kit-mark-aspect`.
 *
 * @param text - Source text of any kind.
 * @returns The distinct names, in the order first found.
 */
export function kitClassTokens(text: string): string[] {
  return [...new Set(text.match(KIT_CLASS_TOKEN))];
}

/**
 * The kit classes a stylesheet's rules select, comments left out.
 *
 * @param css - The stylesheet's text.
 * @returns The distinct class names, without the dot, in the order first found.
 */
export function selectorClasses(css: string): string[] {
  const code = css.replace(CSS_COMMENT, '');
  return [...new Set([...code.matchAll(CLASS_SELECTOR)].map((match) => match[1] ?? ''))];
}

/**
 * The name a copied helper's class gets: `kit-portrait` becomes `own-portrait` in a brand's copy
 * and `dck-portrait` in a deck's.
 *
 * @param name - A kit class name.
 * @param owner - Who owns the copy.
 */
export function ownClassName(name: string, owner: ClassOwner): string {
  return `${OWN_CLASS_PREFIX[owner]}${name.slice(KIT_CLASS_PREFIX.length)}`;
}

/**
 * Renames kit classes wherever they are written as whole words, in a stylesheet, a component or a
 * contract: selectors, `className` strings, PowerPoint selectors and comments alike.
 *
 * @param text - The source text.
 * @param classes - The kit class names to rename.
 * @param owner - Who owns the copy, which picks the new prefix (see {@link OWN_CLASS_PREFIX}).
 * @returns The text with each of them given the owner's prefix.
 */
export function renameClasses(
  text: string,
  classes: ReadonlySet<string>,
  owner: ClassOwner,
): string {
  if (classes.size === 0) {
    return text;
  }

  return text.replace(KIT_CLASS_TOKEN, (token) =>
    classes.has(token) ? ownClassName(token, owner) : token,
  );
}

/**
 * Scopes a stylesheet to one layout, without changing which rule wins inside that layout: a
 * selector that names the frame gets `:where([data-layout='<name>'])` on it, any other selector is
 * put under `:where(.kit-frame[data-layout='<name>'])`, and `:where` adds no specificity. A
 * selector keyed only on this layout is left alone; one keyed only on other layouts can never match
 * here and is removed, and a rule left with no selector is removed with the comment above it. A
 * selector keyed on this layout and others is kept, with `:where([data-layout='<name>'])` added to
 * the compound selector that names the first of them. Rules inside `@layer`, `@media`, `@supports`
 * and `@container` are scoped too; `@keyframes`, `@font-face` and the other at-rules without style
 * rules, and rules nested in a rule, are copied as they are. A selector that starts at `:root` or
 * `html`, and an at-rule such as `@scope` that may hold style rules eject cannot scope, are copied
 * as they are and reported as problems.
 *
 * @param css - The stylesheet's text.
 * @param layout - The layout to scope it to.
 * @returns The scoped stylesheet and what it could not scope.
 */
export function scopeStylesheet(css: string, layout: string): ScopedStylesheet {
  const problems: string[] = [];
  const scoped = scopeBlock(css, layout, problems)
    .replace(EXTRA_BLANK_LINES, '\n\n')
    .replace(BLANK_AFTER_BRACE, '{\n')
    .replace(BLANK_BEFORE_BRACE, '\n$1');
  return { css: scoped, problems: [...new Set(problems)] };
}

/**
 * Scopes the rules of one block's content, or of the whole stylesheet.
 */
function scopeBlock(content: string, layout: string, problems: string[]): string {
  const { items, trailing } = splitItems(content);
  const kept = items
    .map((item) => scopeItem(item, layout, problems))
    .filter((text) => text !== undefined);
  return `${kept.join('')}${trailing}`;
}

/**
 * Scopes one item, or drops it by returning nothing.
 */
function scopeItem(item: CssItem, layout: string, problems: string[]): string | undefined {
  if (item.body === undefined) {
    return `${item.leading}${item.prelude}`;
  }

  const atRule = AT_RULE_NAME.exec(item.prelude)?.[0];
  if (atRule !== undefined) {
    return `${item.leading}${item.prelude}{${scopeAtRuleBody(atRule, item.body, layout, problems)}}`;
  }

  const indent = TRAILING_INDENT.exec(item.leading)?.[0] ?? '';
  const prelude = scopeSelectors(item.prelude, layout, indent, problems);
  return prelude === undefined ? undefined : `${item.leading}${prelude}{${item.body}}`;
}

/**
 * The body of an at-rule: scoped for a grouping rule, as it is otherwise, with a problem for an
 * at-rule that may hold style rules eject does not scope.
 */
function scopeAtRuleBody(atRule: string, body: string, layout: string, problems: string[]): string {
  if (GROUPING_AT_RULES.has(atRule)) {
    return scopeBlock(body, layout, problems);
  }

  if (!VERBATIM_AT_RULES.has(atRule)) {
    problems.push(
      `Its ${atRule} block is copied unscoped, so its rules may style other layouts than ${layout}.`,
    );
  }

  return body;
}

/**
 * Scopes each selector of a rule's selector list, one selector per line at the rule's indent.
 *
 * @returns The new list with the space before the `{`, or nothing when no selector is left.
 */
function scopeSelectors(
  prelude: string,
  layout: string,
  indent: string,
  problems: string[],
): string | undefined {
  const selectors = splitTopLevel(prelude.trimEnd(), ',')
    .map((selector) => scopeSelector(selector.trim(), layout, problems))
    .filter((selector) => selector !== undefined)
    .map((selector) => wrapSelector(selector, indent));
  if (selectors.length === 0) {
    return undefined;
  }

  return `${selectors.join(`,\n${indent}`)} `;
}

/**
 * Scopes one selector, or returns nothing for one that is keyed only on other layouts.
 */
function scopeSelector(selector: string, layout: string, problems: string[]): string | undefined {
  if (ROOT_SELECTOR.test(selector)) {
    problems.push(
      `The selector ${selector} starts at the document's root, so it is copied unscoped and may ` +
        `style other layouts than ${layout}.`,
    );
    return selector;
  }

  if (layoutAttributeInNot(selector)) {
    problems.push(
      `The selector ${selector} names a data-layout inside :not(), which eject does not scope, so ` +
        `it is copied as it is and may style other layouts than ${layout}.`,
    );
    return selector;
  }

  const keyed = new Set([...selector.matchAll(LAYOUT_ATTRIBUTE)].map((match) => match[2]));
  if (keyed.size > 0) {
    return scopeKeyedSelector(selector, keyed, layout);
  }

  if (FRAME_CLASS.test(selector)) {
    return selector.replace(FRAME_CLASS, (frame) => `${frame}:where([data-layout='${layout}'])`);
  }

  return `:where(.kit-frame[data-layout='${layout}']) ${selector}`;
}

/**
 * Tells whether a selector has a `[data-layout=…]` attribute inside a `:not(…)`, however deep. The
 * attribute there excludes layouts instead of naming them, which the keyed scoping would read the
 * wrong way round.
 */
function layoutAttributeInNot(selector: string): boolean {
  return [...selector.matchAll(NOT_OPEN)].some((match) => {
    const start = match.index + match[0].length;
    let depth = 1;
    let position = start;
    while (position < selector.length && depth > 0) {
      const next = skipQuoted(selector, position);
      if (next !== position) {
        position = next;
        continue;
      }

      const char = selector[position];
      if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
      }

      position += 1;
    }

    return [...selector.slice(start, position).matchAll(LAYOUT_ATTRIBUTE)].length > 0;
  });
}

/**
 * Scopes a selector that names one or more layouts: kept as it is when it names only this one,
 * dropped when it does not name it, and narrowed to it when it names others too.
 */
function scopeKeyedSelector(
  selector: string,
  keyed: ReadonlySet<string | undefined>,
  layout: string,
): string | undefined {
  if (!keyed.has(layout)) {
    return undefined;
  }

  if (keyed.size === 1) {
    return selector;
  }

  const compounds = splitTopLevel(selector.replace(WHITE_SPACE_RUN, ' '), ' ');
  const at = compounds.findIndex((compound) => compound.match(LAYOUT_ATTRIBUTE) !== null);
  return compounds
    .map((compound, index) =>
      index === at ? `${compound}:where([data-layout='${layout}'])` : compound,
    )
    .join(' ');
}

/**
 * Lays a selector out as the formatter does: on one line when it fits, otherwise with each further
 * compound selector on a line of its own, one step in, and the arguments of a pseudo-class that is
 * still too wide one per line.
 */
function wrapSelector(selector: string, indent: string): string {
  const flat = selector
    .replace(WHITE_SPACE_RUN, ' ')
    .replace(SPACE_AFTER_PAREN, '(')
    .replace(SPACE_BEFORE_PAREN, ')');
  if (indent.length + flat.length + RULE_OPEN.length <= MAX_LINE_CHARS) {
    return flat;
  }

  const compounds: string[] = [];
  let lead = '';
  for (const token of splitTopLevel(flat, ' ')) {
    if (COMBINATORS.has(token)) {
      lead = `${token} `;
    } else {
      compounds.push(`${lead}${token}`);
      lead = '';
    }
  }

  const inner = `${indent}${INDENT}`;
  return compounds
    .map((compound, index) => {
      const lineIndent = index === 0 ? indent : inner;
      const after = index === compounds.length - 1 ? RULE_OPEN.length : 0;
      const fits = lineIndent.length + compound.length + after <= MAX_LINE_CHARS;
      return fits ? compound : wrapArguments(compound, lineIndent);
    })
    .join(`\n${inner}`);
}

/**
 * Puts the arguments of a compound selector's first pseudo-class one per line, one step in from the
 * line's indent; a compound without arguments is returned as it is.
 */
function wrapArguments(compound: string, indent: string): string {
  const open = compound.indexOf('(');
  const close = compound.lastIndexOf(')');
  if (open === -1 || close < open) {
    return compound;
  }

  const inner = `${indent}${INDENT}`;
  const parts = splitTopLevel(compound.slice(open + 1, close), ',').map((part) => part.trim());
  return [
    compound.slice(0, open + 1),
    parts.map((part) => `${inner}${part}`).join(',\n'),
    `${indent}${compound.slice(close)}`,
  ].join('\n');
}

/**
 * Splits a block's content into its items, with what follows the last one.
 */
function splitItems(content: string): { items: CssItem[]; trailing: string } {
  const items: CssItem[] = [];
  let position = 0;
  for (;;) {
    const start = skipBlank(content, position);
    const stop = findStop(content, start);
    if (stop === undefined) {
      return { items, trailing: content.slice(position) };
    }

    const leading = content.slice(position, start);
    if (content[stop] === ';') {
      items.push({ leading, prelude: content.slice(start, stop + 1), body: undefined });
      position = stop + 1;
      continue;
    }

    const close = matchingBrace(content, stop);
    items.push({
      leading,
      prelude: content.slice(start, stop),
      body: content.slice(stop + 1, close),
    });
    position = close + 1;
  }
}

/**
 * The position after the white space and comments that start at a position.
 */
function skipBlank(text: string, from: number): number {
  let position = from;
  for (;;) {
    if (text.startsWith('/*', position)) {
      position = endOfComment(text, position);
    } else if (WHITE_SPACE.test(text[position] ?? '')) {
      position += 1;
    } else {
      return position;
    }
  }
}

/**
 * The position of the `{` or `;` that ends the prelude starting at a position, or nothing when the
 * text ends first.
 */
function findStop(text: string, from: number): number | undefined {
  let position = from;
  while (position < text.length) {
    const next = skipQuoted(text, position);
    if (next !== position) {
      position = next;
    } else if (text[position] === '{' || text[position] === ';') {
      return position;
    } else {
      position += 1;
    }
  }

  return undefined;
}

/**
 * The position of the `}` that closes the `{` at a position, or the end of the text when it is
 * never closed.
 */
function matchingBrace(text: string, open: number): number {
  let depth = 0;
  let position = open;
  while (position < text.length) {
    const next = skipQuoted(text, position);
    if (next !== position) {
      position = next;
      continue;
    }

    if (text[position] === '{') {
      depth += 1;
    } else if (text[position] === '}') {
      depth -= 1;
      if (depth === 0) {
        return position;
      }
    }

    position += 1;
  }

  return text.length;
}

/**
 * The position after the comment or string that starts at a position, or the position itself when
 * neither starts there.
 */
function skipQuoted(text: string, position: number): number {
  if (text.startsWith('/*', position)) {
    return endOfComment(text, position);
  }

  const quote = text[position];
  if (quote !== '"' && quote !== "'") {
    return position;
  }

  let end = position + 1;
  while (end < text.length && text[end] !== quote) {
    end += text[end] === '\\' ? 2 : 1;
  }

  return end + 1;
}

/**
 * The position after the comment that starts at a position.
 */
function endOfComment(text: string, position: number): number {
  const end = text.indexOf('*/', position + 2);
  return end === -1 ? text.length : end + 2;
}

/**
 * Splits a text at a separator that is not inside brackets, a string or a comment.
 */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let position = 0;
  while (position < text.length) {
    const next = skipQuoted(text, position);
    if (next !== position) {
      position = next;
      continue;
    }

    const char = text[position];
    if (char === '(' || char === '[') {
      depth += 1;
    } else if (char === ')' || char === ']') {
      depth -= 1;
    } else if (char === separator && depth === 0) {
      parts.push(text.slice(start, position));
      start = position + 1;
    }

    position += 1;
  }

  return [...parts, text.slice(start)];
}
