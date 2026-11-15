/**
 * Code points written as a hex escape inside a CSS string besides C0 controls and DEL (which CSSOM
 * escapes): `<` and `>` (so `</style>` cannot end the element the stylesheet sits in), and NEL and
 * the line and paragraph separators, which some tools treat as line ends.
 */
const ESCAPED_IN_STRING = new Set([0x3c, 0x3e, 0x85, 0x20_28, 0x20_29]);

/**
 * The last C0 control code point.
 */
const LAST_C0_CONTROL = 0x1f;

/**
 * DEL, the control code point after the printable ASCII range.
 */
const DELETE = 0x7f;

/**
 * A custom property or property name: `--brand-color-fg`, `font-family`, or a Tailwind theme
 * namespace reset such as `--color-*`.
 */
const PROPERTY_NAME_PATTERN = /^(?:--[A-Za-z0-9-]+(?:-\*)?|[a-z][a-z-]*)$/;

/**
 * A name that may stand as a CSS identifier inside a larger name: letters, digits and hyphens.
 */
const NAME_PART_PATTERN = /^[A-Za-z0-9-]+$/;

/**
 * One `unicode-range` item: `U+26`, `U+0-7F`, `U+0025-00FF` or a wildcard such as `U+4??`.
 */
const UNICODE_RANGE_ITEM = /^U\+(?:[0-9A-F]{1,6}(?:-[0-9A-F]{1,6})?|[0-9A-F]{0,5}\?{1,6})$/i;

/**
 * Spaces around a `unicode-range` item; nothing else may separate items.
 */
const EDGE_SPACES = /^ +| +$/g;

/**
 * The most items a `unicode-range` may list; Fontsource subsets use a few dozen.
 */
const MAX_UNICODE_RANGE_ITEMS = 512;

/**
 * The largest code point.
 */
const MAX_CODE_POINT = 0x10_ff_ff;

/**
 * The number base of the hex escapes and code points.
 */
const HEX = 16;

/**
 * A lowercase opaque or translucent hex color, the only colors tokens hold.
 */
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/;

/**
 * Characters that may never appear outside a string in a value, whatever their position: they end a
 * declaration or a block, start an at-rule, an escape or a comment, or end a `<style>` element.
 */
const FORBIDDEN_OUTSIDE_STRING = new Set([';', '{', '}', '@', '\\', '<', '>', '!']);

/**
 * Writes text as a double-quoted CSS string, escaped as CSSOM serializes strings: `"` and `\` get a
 * backslash, NUL becomes U+FFFD, and C0 controls, DEL and {@link ESCAPED_IN_STRING} become hex
 * escapes.
 *
 * @param text - Any text.
 */
export function cssString(text: string): string {
  let out = '"';
  for (const character of text) {
    if (character === '\0') {
      out += '\uFFFD';
    } else if (character === '"' || character === '\\') {
      out += `\\${character}`;
    } else if (isEscapedInString(character.codePointAt(0) ?? 0)) {
      out += `\\${(character.codePointAt(0) ?? 0).toString(HEX)} `;
    } else {
      out += character;
    }
  }

  return `${out}"`;
}

/**
 * Whether a code point is written as a hex escape in a CSS string: a C0 control, DEL, or one of
 * {@link ESCAPED_IN_STRING}.
 *
 * @param code - The code point.
 */
function isEscapedInString(code: number): boolean {
  return code <= LAST_C0_CONTROL || code === DELETE || ESCAPED_IN_STRING.has(code);
}

/**
 * Writes a URL as `url("…")`, its text escaped as a {@link cssString}.
 *
 * @param url - The URL or file path.
 */
export function cssUrl(url: string): string {
  return `url(${cssString(url)})`;
}

/**
 * A name part that goes into a property name, a selector or a Tailwind utility unchanged, such as a
 * palette or gradient name. Brand names are kebab-case, so nothing needs escaping.
 *
 * @param name - The name part.
 * @throws TypeError when the name holds anything but letters, digits and hyphens.
 */
export function cssName(name: string): string {
  if (!NAME_PART_PATTERN.test(name)) {
    throw new TypeError(`"${name}" cannot be part of a CSS name.`);
  }

  return name;
}

/**
 * Writes a finite number as CSS writes it.
 *
 * @param value - The number.
 * @throws TypeError for `NaN` or an infinity, which CSS cannot write.
 */
export function cssNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${value} is not a finite number.`);
  }

  return String(value);
}

/**
 * Writes a length in CSS pixels.
 *
 * @param value - The length.
 */
export function cssPx(value: number): string {
  return `${cssNumber(value)}px`;
}

/**
 * Checks a token color before it is written: lowercase `#rrggbb` or `#rrggbbaa`.
 *
 * @param color - The color.
 * @throws TypeError for anything else.
 */
export function cssColor(color: string): string {
  if (!HEX_COLOR_PATTERN.test(color)) {
    throw new TypeError(`"${color}" is not a hex color.`);
  }

  return color;
}

/**
 * Whether text is a `unicode-range` value: comma-separated `U+` items, each a code point, a range
 * of code points in order, or a wildcard, all within Unicode.
 *
 * @param text - The value as written.
 */
export function isUnicodeRange(text: string): boolean {
  const items = text.split(',').map((item) => item.replace(EDGE_SPACES, ''));
  if (items.length === 0 || items.length > MAX_UNICODE_RANGE_ITEMS) {
    return false;
  }

  return items.every((item) => {
    if (!UNICODE_RANGE_ITEM.test(item)) {
      return false;
    }

    const [from = '', to] = item.slice(2).replaceAll('?', 'F').split('-');
    const start = Number.parseInt(from, HEX);
    const end = to === undefined ? start : Number.parseInt(to, HEX);
    return start <= end && end <= MAX_CODE_POINT;
  });
}

/**
 * Checks a `unicode-range` value before it is written, and returns it as written.
 *
 * @param text - The value.
 * @throws TypeError when it is not a {@link isUnicodeRange} value.
 */
export function cssUnicodeRange(text: string): string {
  if (!isUnicodeRange(text)) {
    throw new TypeError(`"${text}" is not a unicode-range.`);
  }

  return text;
}

/**
 * Checks that a value is one declaration's value and nothing more. This is the last of three
 * layers: the schema rejects what does not belong in a brand value, the writers in this module
 * quote and escape what they write, and every rule the package writes goes through {@link cssRule}
 * or {@link cssAtRule}, which run this on each value, so no single layer has to be perfect. The
 * check: strings are closed on their line, parentheses balance, and outside strings there is no
 * comment, escape, line break, `;`, `{`, `}`, `@`, `!`, `<` or `>`, which could end the declaration
 * or the block, start a rule, or end the `<style>` element. Values built by this module's writers
 * always pass.
 *
 * @param value - The value as it will be written.
 * @throws TypeError when the value could do more than set its property.
 */
export function assertCssValue(value: string): string {
  let quote: string | undefined;
  let depth = 0;
  for (let index = 0; index < value.length; index++) {
    const character = value[index] ?? '';
    if (quote !== undefined) {
      if (character === '\\') {
        const next = value[index + 1];
        if (next === undefined || next === '\n' || next === '\r' || next === '\f') {
          throw unsafe(value);
        }

        index += 1;
      } else if (character === quote) {
        quote = undefined;
      } else if (character < ' ' || character === '<' || character === '>') {
        throw unsafe(value);
      }

      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
    } else if (
      depth < 0 ||
      FORBIDDEN_OUTSIDE_STRING.has(character) ||
      character < ' ' ||
      character === '\u007F' ||
      (character === '/' && value[index + 1] === '*')
    ) {
      throw unsafe(value);
    }
  }

  if (quote !== undefined || depth !== 0) {
    throw unsafe(value);
  }

  return value;
}

/**
 * A CSS rule: selectors, one per line, and one checked declaration per line.
 *
 * @param selectors - The selectors, built from {@link attributeSelector} and fixed text.
 * @param declarations - Property and value pairs.
 */
export function cssRule(
  selectors: readonly string[],
  declarations: readonly (readonly [string, string])[],
): string {
  return cssBlock(selectors.join(',\n'), declarations);
}

/**
 * An at-rule with a block of checked declarations, such as `@font-face` or Tailwind's `@utility`.
 *
 * @param prelude - The at-rule and its prelude, fixed text and {@link cssName} parts only.
 * @param declarations - Property and value pairs.
 */
export function cssAtRule(
  prelude: string,
  declarations: readonly (readonly [string, string])[],
): string {
  return cssBlock(prelude, declarations);
}

/**
 * An attribute selector matching a value exactly: `[data-brand="acme"]`.
 *
 * @param attribute - The attribute name, a fixed name of this package.
 * @param value - The value, quoted and escaped.
 */
export function attributeSelector(attribute: string, value: string): string {
  return `[${cssName(attribute)}=${cssString(value)}]`;
}

/**
 * A block with one declaration per line, each name and value checked.
 *
 * @param head - What comes before the block.
 * @param declarations - Property and value pairs.
 */
function cssBlock(head: string, declarations: readonly (readonly [string, string])[]): string {
  const body = declarations.map(([property, value]) => {
    if (!PROPERTY_NAME_PATTERN.test(property)) {
      throw new TypeError(`"${property}" is not a property name.`);
    }

    return `  ${property}: ${assertCssValue(value)};`;
  });
  return [`${head} {`, ...body, '}'].join('\n');
}

/**
 * The error for a value that could do more than set its property.
 *
 * @param value - The value.
 */
function unsafe(value: string): TypeError {
  return new TypeError(`${JSON.stringify(value)} is not a single CSS value.`);
}
