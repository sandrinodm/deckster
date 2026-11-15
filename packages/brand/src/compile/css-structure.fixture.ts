import { transform } from 'lightningcss';

/**
 * What a blanked string or URL reads as in a {@link cssStructure}.
 */
const BLANK = '<blank>';

/**
 * The shape of a stylesheet as a real CSS parser (lightningcss, with error recovery off) reads it:
 * every rule, selector, at-rule prelude, property name and value token, with the content of string
 * and URL tokens and of `@font-face` family names replaced by a placeholder, and source locations
 * dropped. Two stylesheets with the same structure differ only inside strings and URLs, so a value
 * that changes nothing else cannot have added a rule, a declaration or a token.
 *
 * @param css - The stylesheet.
 * @returns The structure as JSON.
 * @throws Error when the stylesheet does not parse.
 */
export function cssStructure(css: string): string {
  let sheet: unknown;
  transform({
    filename: 'brand.css',
    code: Buffer.from(css),
    errorRecovery: false,
    visitor: {
      /**
       * Captures the parsed stylesheet.
       */
      StyleSheet(parsed) {
        sheet = parsed;
        return undefined;
      },
    },
  });
  return JSON.stringify(blank(sheet));
}

/**
 * A parsed node with string and URL contents blanked and locations dropped.
 *
 * @param node - Any node of the parsed stylesheet.
 */
function blank(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(blank);
  }

  if (typeof node !== 'object' || node === null) {
    return node;
  }

  const entries = Object.entries(node).filter(([key]) => key !== 'loc');
  const type = Reflect.get(node, 'type');
  return Object.fromEntries(
    entries.map(([key, value]) => {
      const isText =
        (type === 'string' && key === 'value') ||
        (type === 'font-family' && key === 'value') ||
        key === 'url';
      return [key, isText && typeof value === 'string' ? BLANK : blank(value)];
    }),
  );
}
