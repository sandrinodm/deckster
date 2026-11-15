/**
 * The color roles an SVG shape can take, each a custom property of the slide's surface.
 */
export const SVG_ROLES = {
  /**
   * Painted with `--brand-color-fg`.
   */
  fg: '--brand-color-fg',

  /**
   * Painted with `--brand-color-heading`.
   */
  heading: '--brand-color-heading',

  /**
   * Painted with `--brand-color-muted`.
   */
  muted: '--brand-color-muted',

  /**
   * Painted with `--brand-color-accent`.
   */
  accent: '--brand-color-accent',

  /**
   * Painted with `--brand-color-positive`.
   */
  positive: '--brand-color-positive',

  /**
   * Painted with `--brand-color-negative`.
   */
  negative: '--brand-color-negative',

  /**
   * Painted with `--brand-color-bg`.
   */
  bg: '--brand-color-bg',

  /**
   * Painted with `--brand-color-surface`.
   */
  surface: '--brand-color-surface',

  /**
   * Painted with `--brand-color-border`.
   */
  border: '--brand-color-border',

  /**
   * Painted with `--brand-diagram-node`.
   */
  node: '--brand-diagram-node',

  /**
   * Painted with `--brand-diagram-node-border`.
   */
  'node-border': '--brand-diagram-node-border',

  /**
   * Painted with `--brand-diagram-node-text`.
   */
  'node-text': '--brand-diagram-node-text',

  /**
   * Painted with `--brand-diagram-group`.
   */
  group: '--brand-diagram-group',

  /**
   * Painted with `--brand-diagram-edge`.
   */
  edge: '--brand-diagram-edge',

  /**
   * Painted with `--brand-diagram-label`.
   */
  label: '--brand-diagram-label',

  /**
   * Painted with `--brand-diagram-highlight`.
   */
  highlight: '--brand-diagram-highlight',

  /**
   * Painted with `--brand-diagram-packet`.
   */
  packet: '--brand-diagram-packet',
} as const;

/**
 * A color role an SVG shape can take, such as `accent` or `edge`.
 */
export type SvgRole = keyof typeof SVG_ROLES;

/**
 * Every role name, in catalog order.
 */
export const SVG_ROLE_NAMES = Object.keys(SVG_ROLES) as SvgRole[];

/**
 * A `fill`, `stroke` or `stop-color` attribute, quoted either way, not part of a longer name such
 * as `data-fill`.
 */
const PAINT_ATTRIBUTE = /(?<![\w:-])(fill|stroke|stop-color)\s*=\s*("([^"]*)"|'([^']*)')/gi;

/**
 * A `style` attribute, quoted either way.
 */
const STYLE_ATTRIBUTE = /(?<![\w:-])(style\s*=\s*)("([^"]*)"|'([^']*)')/gi;

/**
 * A `<style>` element's content.
 */
const STYLE_BLOCK = /(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi;

/**
 * A color declaration in CSS: `fill`, `stroke`, `stop-color` or `color`, and its value.
 */
const COLOR_DECLARATION = /(^|[;{\s])(fill|stroke|stop-color|color)(\s*:\s*)([^;}!]+)/gi;

/**
 * A role named on a shape: `data-fill="accent"`, `data-stroke="edge"` or `data-stop="accent"`.
 */
const ROLE_ATTRIBUTE = /\bdata-(fill|stroke|stop)\s*=\s*["']([^"']*)["']/gi;

/**
 * An `id` attribute.
 */
const ID_ATTRIBUTE = /(?<![\w:-])id\s*=\s*["']([^"']+)["']/gi;

/**
 * Any color written in the markup: hex, `rgb()`/`rgba()` or a word that may be a color name.
 */
const COLOR_TOKEN = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\b[a-z]{3,20}\b/gi;

/**
 * The CSS named colors the recolor map and drawings may use, as `name:rrggbb` pairs.
 */
const NAMED_COLOR_LIST =
  'black:000000 white:ffffff red:ff0000 green:008000 blue:0000ff yellow:ffff00 orange:ffa500 ' +
  'purple:800080 pink:ffc0cb brown:a52a2a gray:808080 grey:808080 silver:c0c0c0 lightgray:d3d3d3 ' +
  'lightgrey:d3d3d3 darkgray:a9a9a9 darkgrey:a9a9a9 dimgray:696969 gainsboro:dcdcdc ' +
  'whitesmoke:f5f5f5 navy:000080 teal:008080 maroon:800000 olive:808000 lime:00ff00 aqua:00ffff ' +
  'cyan:00ffff fuchsia:ff00ff magenta:ff00ff crimson:dc143c tomato:ff6347 coral:ff7f50 ' +
  'gold:ffd700 indigo:4b0082 violet:ee82ee skyblue:87ceeb steelblue:4682b4 slategray:708090 ' +
  'darkblue:00008b darkgreen:006400 darkred:8b0000 firebrick:b22222 orangered:ff4500 ' +
  'royalblue:4169e1 seagreen:2e8b57 beige:f5f5dc ivory:fffff0 khaki:f0e68c salmon:fa8072 ' +
  'turquoise:40e0d0 ';

/**
 * A three-digit hex color, such as `#f60`.
 */
const SHORT_HEX_COLOR = /^#[0-9a-f]{3}$/;

/**
 * A hex color of three to eight digits, such as `#ff6600` or `#ff660080`.
 */
const HEX_COLOR = /^#([0-9a-f]{3,8})$/;

/**
 * An `rgb()` or `rgba()` color, with its channels as written.
 */
const RGB_COLOR = /^rgba?\(([^)]*)\)$/;

/**
 * What separates the channels of an `rgb()` color: spaces, commas or the slash before alpha.
 */
const CHANNEL_SEPARATOR = /[\s,/]+/;

/**
 * The largest value of a color channel.
 */
const MAX_CHANNEL = 255;

/**
 * The value of a percentage channel's 100%.
 */
const PERCENT_SCALE = 100;

/**
 * The CSS named colors, as `#rrggbb`.
 */
const NAMED_COLORS: ReadonlyMap<string, string> = new Map(
  NAMED_COLOR_LIST.trim()
    .split(' ')
    .map((pair) => {
      const [name = '', hex = ''] = pair.split(':');
      return [name, `#${hex}`];
    }),
);

/**
 * Gives shapes the color roles a map names for the colors the file uses, however a color is written
 * (`#F60`, `#ff6600`, `rgb(255 102 0)`, `orange`): `fill`, `stroke` and `stop-color` attributes get
 * `data-fill`, `data-stroke` or `data-stop` with the role, which the kit's stylesheet paints from
 * the slide's surface; colors in `style` attributes and `<style>` rules are replaced by the role's
 * custom property (`var(--brand-color-accent)`).
 *
 * @param markup - The SVG source.
 * @param recolor - Colors to roles.
 * @returns The markup with roles added; unchanged when the map is empty.
 */
export function recolorSvg(markup: string, recolor: Readonly<Record<string, SvgRole>>): string {
  const roles = new Map<string, SvgRole>();
  for (const [color, role] of Object.entries(recolor)) {
    const parsed = parseColor(color);
    if (parsed !== undefined && role in SVG_ROLES) {
      roles.set(parsed, role);
    }
  }

  if (roles.size === 0) {
    return markup;
  }

  /**
   * CSS with every mapped color in a color declaration replaced by its role's custom property.
   */
  const recolorCss = (css: string): string =>
    css.replace(
      COLOR_DECLARATION,
      (match, before: string, property: string, colon: string, value: string) => {
        const color = parseColor(value);
        const role = color === undefined ? undefined : roles.get(color);
        return role === undefined ? match : `${before}${property}${colon}var(${SVG_ROLES[role]})`;
      },
    );
  return markup
    .replace(
      STYLE_BLOCK,
      (_match, open: string, css: string, close: string) => `${open}${recolorCss(css)}${close}`,
    )
    .replace(
      STYLE_ATTRIBUTE,
      (_match, name: string, _quoted: string, double?: string, single?: string) => {
        const quote = double === undefined ? "'" : '"';
        return `${name}${quote}${recolorCss(double ?? single ?? '')}${quote}`;
      },
    )
    .replace(
      PAINT_ATTRIBUTE,
      (match, property: string, _quoted: string, double?: string, single?: string) => {
        const color = parseColor(double ?? single ?? '');
        const role = color === undefined ? undefined : roles.get(color);
        const lower = property.toLowerCase();
        const kind = lower === 'stop-color' ? 'stop' : lower;
        return role === undefined ? match : `${match} data-${kind}="${role}"`;
      },
    );
}

/**
 * A hex color in lowercase six-digit form; other strings unchanged but lowercase.
 *
 * @param color - A color as written.
 */
export function normalizeHex(color: string): string {
  const lower = color.trim().toLowerCase();
  if (SHORT_HEX_COLOR.test(lower)) {
    return `#${lower
      .slice(1)
      .split('')
      .map((digit) => digit + digit)
      .join('')}`;
  }

  return lower;
}

/**
 * A CSS color as `#rrggbb`: hex (3, 4, 6 or 8 digits, alpha dropped), `rgb()`/`rgba()` with commas
 * or spaces and numbers or percentages, or a CSS color name.
 *
 * @param value - The color as written.
 * @returns The color; `undefined` for `none`, `currentColor`, `url(#...)` or anything else that is
 *   not a plain color.
 */
export function parseColor(value: string): string | undefined {
  const text = value.trim().toLowerCase();
  const hex = HEX_COLOR.exec(text)?.[1];
  if (hex !== undefined) {
    if (hex.length === 3 || hex.length === 4) {
      return `#${hex.slice(0, 3).replace(/./g, (digit) => digit + digit)}`;
    }

    return hex.length === 6 || hex.length === 8 ? `#${hex.slice(0, 6)}` : undefined;
  }

  const rgb = RGB_COLOR.exec(text)?.[1];
  if (rgb !== undefined) {
    const channels = rgb
      .split(CHANNEL_SEPARATOR)
      .filter((part) => part !== '')
      .slice(0, 3)
      .map((part) =>
        part.endsWith('%')
          ? (Number.parseFloat(part) / PERCENT_SCALE) * MAX_CHANNEL
          : Number.parseFloat(part),
      );
    if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) {
      return undefined;
    }

    return `#${channels
      .map((channel) =>
        Math.round(Math.min(Math.max(channel, 0), MAX_CHANNEL))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`;
  }

  return NAMED_COLORS.get(text);
}

/**
 * The colors a drawing uses, as `#rrggbb`.
 *
 * @param markup - The SVG source.
 */
export function colorsInSvg(markup: string): Set<string> {
  const colors = new Set<string>();
  for (const [token] of markup.matchAll(COLOR_TOKEN)) {
    const color = parseColor(token);
    if (color !== undefined) {
      colors.add(color);
    }
  }

  return colors;
}

/**
 * The ids of a drawing's elements, in document order.
 *
 * @param markup - The SVG source.
 */
export function idsInSvg(markup: string): string[] {
  return [...new Set([...markup.matchAll(ID_ATTRIBUTE)].map((match) => match[1] ?? ''))];
}

/**
 * What {@link checkSvg} found: errors stop the drawing, warnings are printed.
 */
export type SvgCheck = {
  /**
   * Problems that make the props wrong, each a sentence with its fix.
   */
  errors: string[];

  /**
   * Problems worth a look, each a sentence with its fix.
   */
  warnings: string[];
};

/**
 * Checks an `<Svg>`'s `recolor` and `steps` against its markup: every color in `recolor` must be a
 * color and map to a role, every role a shape names itself (`data-fill`, `data-stroke`) must exist,
 * and every id in `steps` must be an element of the drawing. A color in `recolor` that the drawing
 * never uses is a warning.
 *
 * @param markup - The sanitised SVG source.
 * @param props - The `<Svg>`'s literal `recolor` and `steps`.
 * @param where - How the element is named in messages, such as `<Svg src="./floor.svg">`.
 */
export function checkSvg(
  markup: string,
  props: { recolor?: Readonly<Record<string, unknown>>; steps?: Readonly<Record<string, unknown>> },
  where: string,
): SvgCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const used = colorsInSvg(markup);
  for (const [color, role] of Object.entries(props.recolor ?? {})) {
    const parsed = parseColor(color);
    if (parsed === undefined) {
      errors.push(
        `${where} has recolor key "${color}", which is not a color. Write it as hex ` +
          '(#e4572e), rgb() or a CSS color name, as the file does.',
      );
    } else if (!used.has(parsed)) {
      warnings.push(
        `${where} recolors "${color}", which no shape in the drawing uses. Check the color ` +
          'in the file, or remove it from `recolor`.',
      );
    }

    if (typeof role !== 'string' || !(role in SVG_ROLES)) {
      errors.push(
        `${where} maps "${color}" to "${String(role)}", which is not a color role. Use one of: ` +
          `${byLikeness(String(role), SVG_ROLE_NAMES).join(', ')}.`,
      );
    }
  }

  for (const [, kind, role = ''] of markup.matchAll(ROLE_ATTRIBUTE)) {
    if (!(role in SVG_ROLES)) {
      errors.push(
        `${where} has a shape with data-${kind ?? 'fill'}="${role}", which is not a color role. ` +
          `Use one of: ${byLikeness(role, SVG_ROLE_NAMES).join(', ')}.`,
      );
    }
  }

  const ids = idsInSvg(markup);
  for (const [id, at] of Object.entries(props.steps ?? {})) {
    if (!ids.includes(id)) {
      errors.push(
        ids.length === 0
          ? `${where} reveals "${id}" in \`steps\`, but the drawing has no element with an id. ` +
              'Give the groups to reveal an `id` in the file.'
          : `${where} reveals "${id}" in \`steps\`, which is not an id in the drawing. Ids it ` +
              `has: ${byLikeness(id, ids).slice(0, 12).join(', ')}.`,
      );
    }

    if (typeof at !== 'number' || !Number.isInteger(at) || at < 0) {
      errors.push(
        `${where} reveals "${id}" at step ${JSON.stringify(at)}; a step is a whole number from 0.`,
      );
    }
  }

  return { errors, warnings };
}

/**
 * Names ordered by how close they are to a misspelt one: edit distance, then catalog order.
 *
 * @param written - The name as written.
 * @param names - The names that exist.
 */
export function byLikeness(written: string, names: readonly string[]): string[] {
  const target = written.toLowerCase();
  return names
    .map((name, index) => ({ name, index, distance: editDistance(target, name.toLowerCase()) }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .map((entry) => entry.name);
}

/**
 * The Levenshtein distance between two strings.
 *
 * @param a - A string.
 * @param b - Another string.
 */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(
        Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost),
      );
    }

    previous = current;
  }

  return previous[b.length] ?? 0;
}
