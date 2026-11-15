import type { FontPlan } from '#fonts/font-plan.ts';

/**
 * CSS weights used by Office's style-linked regular and bold font faces.
 */
const REGULAR_FACE_WEIGHT = 400;

/**
 * CSS weight of a style-linked bold face.
 */
const BOLD_FACE_WEIGHT = 700;

/**
 * One instance as the page registers it.
 */
export type StaticFontFace = {
  /**
   * The instance's family name, which the page's `@font-face` rule declares.
   */
  familyName: string;

  /**
   * The brand family the instance replaces.
   */
  sourceFamily: string;

  /**
   * Whether it was cut from an italic file.
   */
  italic: boolean;

  /**
   * The CSS weight it draws.
   */
  weight: number;

  /**
   * The axes it was pinned at.
   */
  axes: Readonly<Record<string, number>>;

  /**
   * The `font-weight` its `@font-face` rule declares: 400 for a regular face, 700 for bold.
   */
  faceWeight: number;

  /**
   * The `font-style` its rule declares.
   */
  faceStyle: 'normal' | 'italic';

  /**
   * The TrueType file as base64.
   */
  base64: string;
};

/**
 * What {@link useStaticFonts} gets.
 */
export type StaticFontsArgs = {
  /**
   * The instances.
   */
  faces: StaticFontFace[];

  /**
   * The axes of each brand family's files, by family and style (`normal` or `italic`).
   */
  axes: Record<
    string,
    Record<string, Record<string, { min: number; default: number; max: number }>>
  >;
};

/**
 * What {@link useStaticFonts} did.
 */
export type StaticFontsResult = {
  /**
   * Elements now drawn in an instance.
   */
  replaced: number;

  /**
   * Brand-font text with no instance for its style, as `family|style|axes`.
   */
  unmatched: string[];
};

/**
 * The arguments of {@link useStaticFonts} for a plan.
 *
 * @param plan - The font plan.
 */
export function staticFontsArgs(plan: Pick<FontPlan, 'instances' | 'sources'>): StaticFontsArgs {
  const axes: StaticFontsArgs['axes'] = {};
  for (const source of plan.sources) {
    const family = (axes[source.family] ??= {});
    family[source.style] = { ...source.axes };
  }

  return {
    faces: plan.instances.map((instance) => ({
      familyName: instance.familyName,
      sourceFamily: instance.sourceFamily,
      italic: instance.italic,
      weight: instance.weight,
      axes: instance.axes,
      faceWeight:
        instance.slot === 'bold' || instance.slot === 'boldItalic'
          ? BOLD_FACE_WEIGHT
          : REGULAR_FACE_WEIGHT,
      faceStyle: instance.slot === 'italic' || instance.slot === 'boldItalic' ? 'italic' : 'normal',
      base64: Buffer.from(instance.data).toString('base64'),
    })),
    axes,
  };
}

/**
 * Makes Chromium draw the page's brand-font text in the static instances, so its PDF embeds
 * TrueType subsets (`CIDFontType2`) instead of the Type 3 fonts Skia writes for variable fonts.
 * Runs in the page (`page.evaluate(useStaticFonts, args)`), self-contained: it registers each
 * instance with `@font-face` under its own family name, works out for every element that sets text
 * (HTML text nodes and SVG `text`) the instance of its computed family, style, weight,
 * `font-variation-settings`, stretch and optical size (the font size, as `font-optical-sizing:
 * auto` picks it), and only then sets on each, inline and `!important`, that instance's family,
 * face weight and style, `font-variation-settings: normal`, `font-optical-sizing: none` and
 * `font-synthesis: none` (`style` where the browser slanted an upright file). The instances have
 * the variable font's advances at those axes, so lines break where they did. Waits for the fonts to
 * load.
 *
 * @param args - The instances and the brand files' axes.
 * @returns How many elements changed, and the styles no instance matched.
 */
export async function useStaticFonts(args: StaticFontsArgs): Promise<StaticFontsResult> {
  const AXIS_TOLERANCE = 0.5;
  const AXIS_ROUNDING_FACTOR = 100;
  const FAMILY_QUOTES_PATTERN = /^["']|["']$/g;
  const VARIATION_SETTINGS_PATTERN = /"([a-zA-Z]{4})"\s+(-?[\d.]+)/g;
  const style = document.createElement('style');
  style.setAttribute('data-deck-static-fonts', '');
  style.textContent = args.faces
    .map(
      (face) =>
        `@font-face { font-family: ${JSON.stringify(face.familyName)}; ` +
        `src: url(data:font/ttf;base64,${face.base64}) format("truetype"); ` +
        `font-weight: ${face.faceWeight}; font-style: ${face.faceStyle}; font-display: block; }`,
    )
    .join('\n');
  if (document.querySelector('style[data-deck-static-fonts]') === null) {
    document.head.append(style);
  }

  /**
   * The instance for an element's computed style, and whether the browser slanted an upright file.
   */
  const match = (element: Element): { face: StaticFontFace; slanted: boolean } | string | null => {
    const computed = getComputedStyle(element);
    const family = (computed.fontFamily.split(',')[0] ?? '')
      .trim()
      .replace(FAMILY_QUOTES_PATTERN, '');
    const files = args.axes[family];
    if (files === undefined) {
      return null;
    }

    const italic = computed.fontStyle !== 'normal';
    const fileStyle = italic && files['italic'] !== undefined ? 'italic' : 'normal';
    const ranges = files[fileStyle] ?? {};
    const weight = Number.parseFloat(computed.fontWeight);
    const set: Record<string, number> = {};
    for (const found of computed.fontVariationSettings.matchAll(VARIATION_SETTINGS_PATTERN)) {
      set[found[1] ?? ''] = Number(found[2]);
    }

    if (computed.fontStretch.endsWith('%') && set['wdth'] === undefined) {
      set['wdth'] = Number.parseFloat(computed.fontStretch);
    }

    const axes: Record<string, number> = {};
    for (const [tag, range] of Object.entries(ranges)) {
      const implied: Record<string, number> = {
        wght: weight,
        opsz: Number.parseFloat(computed.fontSize),
        ital: Number(italic),
      };
      const value = set[tag] ?? implied[tag] ?? range.default;
      axes[tag] =
        Math.round(Math.min(range.max, Math.max(range.min, value)) * AXIS_ROUNDING_FACTOR) /
        AXIS_ROUNDING_FACTOR;
    }

    const candidates = args.faces.filter(
      (face) => face.sourceFamily === family && face.italic === (fileStyle === 'italic'),
    );
    const tags = Object.keys(axes);
    const face =
      tags.length === 0
        ? candidates.find((candidate) => candidate.weight === weight)
        : candidates.find((candidate) =>
            tags.every(
              (tag) =>
                Math.abs((candidate.axes[tag] ?? Number.NaN) - (axes[tag] ?? 0)) <= AXIS_TOLERANCE,
            ),
          );
    if (face === undefined) {
      return `${family}|${italic ? 'italic' : 'normal'}|${JSON.stringify(axes)}`;
    }

    return { face, slanted: italic && fileStyle === 'normal' };
  };
  const elements = Array.from(document.querySelectorAll('body *')).filter(
    (element) =>
      element instanceof SVGTextElement ||
      Array.from(element.childNodes).some(
        (child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '',
      ),
  );
  const unmatched = new Set<string>();
  const changes: [Element, { face: StaticFontFace; slanted: boolean }][] = [];
  for (const element of elements) {
    const found = match(element);
    if (typeof found === 'string') {
      unmatched.add(found);
    } else if (found !== null) {
      changes.push([element, found]);
    }
  }

  for (const [element, { face, slanted }] of changes) {
    const target = element as HTMLElement | SVGElement;
    target.style.setProperty('font-family', JSON.stringify(face.familyName), 'important');
    target.style.setProperty('font-weight', String(face.faceWeight), 'important');
    target.style.setProperty('font-style', slanted ? 'italic' : face.faceStyle, 'important');
    target.style.setProperty('font-variation-settings', 'normal', 'important');
    target.style.setProperty('font-optical-sizing', 'none', 'important');
    target.style.setProperty('font-synthesis', slanted ? 'style' : 'none', 'important');
  }

  await document.fonts.ready;
  await Promise.all(
    args.faces.map((face) =>
      document.fonts.load(
        `${face.faceStyle} ${face.faceWeight} 16px ${JSON.stringify(face.familyName)}`,
      ),
    ),
  );
  return { replaced: changes.length, unmatched: [...unmatched] };
}
