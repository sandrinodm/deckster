/**
 * The attributes and inner markup of an `<svg>` element.
 */
export type SvgParts = {
  /**
   * The attributes of the root element, by name.
   */
  attributes: Record<string, string>;

  /**
   * The markup inside the root element.
   */
  body: string;
};

/**
 * One attribute inside a tag: a name and a quoted value.
 */
const ATTRIBUTE_PATTERN = /([\w:-]+)\s*=\s*"([^"]*)"/g;

/**
 * The root `<svg>` element: its attributes and everything inside.
 */
const SVG_PATTERN = /^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/;

/**
 * Splits an SVG document into the root's attributes and its inner markup.
 *
 * @param svg - The SVG source Iconify produced for an icon.
 * @throws Error when the text is not one `<svg>` element.
 */
export function parseSvg(svg: string): SvgParts {
  const match = SVG_PATTERN.exec(svg);
  if (match === null) {
    throw new Error('The icon is not a single <svg> element.');
  }

  const attributes: Record<string, string> = {};
  for (const [, name, value] of (match[1] ?? '').matchAll(ATTRIBUTE_PATTERN)) {
    if (name !== undefined && value !== undefined && name !== 'xmlns') {
      attributes[name] = value;
    }
  }

  return { attributes, body: match[2] ?? '' };
}

/**
 * The module `unplugin-icons` serves for an icon: a React component that draws the SVG inline. The
 * kit compiles icons itself so a deck needs no SVG-to-React toolchain.
 *
 * @param svg - The SVG source Iconify produced for the icon.
 * @returns JavaScript whose default export is the component; props spread onto the `<svg>`.
 */
export function compileIcon(svg: string): string {
  const { attributes, body } = parseSvg(svg);
  return [
    "import { createElement } from 'react';",
    `const attributes = ${JSON.stringify(attributes)};`,
    `const markup = { __html: ${JSON.stringify(body)} };`,
    'export default function Icon(props) {',
    "  return createElement('svg', { ...attributes, ...props, dangerouslySetInnerHTML: markup });",
    '}',
    '',
  ].join('\n');
}
