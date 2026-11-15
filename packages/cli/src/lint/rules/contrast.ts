import type { Rgba, Role, SurfaceTokens } from '@deckster/brand';

import {
  contrastRatio,
  GRAPHIC_CONTRAST,
  isLargeText,
  parseColorLiteral,
  TEXT_CONTRAST,
} from '@deckster/brand';

import type { ElementSnapshot, SlideRule, SlideRuleInput } from '#lint/types.ts';

import { describeElement } from '#lint/rules/describe.ts';
import { visibleTextElements } from '#lint/rules/elements.ts';

/**
 * The colors meant for text, in the order the fix suggests them: the text roles, then the accent
 * held to 4.5:1 for small text (`text-accent-text`).
 */
const TEXT_COLORS: readonly { name: string; color: (surface: SurfaceTokens) => string }[] = [
  ...(['fg', 'heading', 'muted', 'accent'] as const satisfies readonly Role[]).map((role) => ({
    name: role,
    color: (surface: SurfaceTokens) => surface.roles[role],
  })),
  { name: 'accent-text', color: (surface) => surface.text.accent },
];

/**
 * Text whose color does not stand out enough from what it sits on, under WCAG 2.x AA: 4.5:1, or 3:1
 * for large text (24px, or 18.66px bold, at its rendered size). The text color includes its own
 * alpha and the opacity of everything above it; on a gradient every color of the gradient must
 * pass. Text over a photo, video or picture is checked against the pixels under its glyph boxes
 * (sampled with the text hidden, scrims included): the darkest and lightest of them must both pass.
 * Text on a CSS background image that could not be sampled is not checked.
 */
export const contrastRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'contrast',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is visible changes with the step.
   */
  scope: 'step',

  /**
   * Unreadable text fails the deck.
   */
  severity: 'error',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description:
    'Text contrast against its background is below WCAG AA (4.5:1, or 3:1 for large text).',

  /**
   * Reports every text element below its contrast threshold.
   */
  check: ({ snapshot, brand, layout }) =>
    visibleTextElements(snapshot).flatMap((element) => {
      const measured = measure(element);
      if (measured === undefined || measured.ratio >= measured.required) {
        return [];
      }

      const size = isLargeText(element.renderedFontSizePx, element.fontWeight) ? 'large' : 'normal';
      return [
        {
          message:
            `${describeElement(element)} has ${format(measured.ratio)}:1 contrast with ` +
            `${element.background.kind === 'media' ? 'the picture under it' : 'its background'}` +
            `; ${size} text needs ${measured.required}:1.`,
          fix:
            element.background.kind === 'media'
              ? mediaFix(layout, element.background.backdrop === true)
              : fixFor(brand.surface, measured.backgrounds, measured.required),
          selector: element.selector,
        },
      ];
    }),
};

/**
 * The element's worst contrast over every background color it may sit on, and what it needs.
 *
 * @param element - A text element.
 * @returns The measurement, or `undefined` for text on an image or with unreadable colors.
 */
function measure(
  element: ElementSnapshot,
): { ratio: number; required: number; backgrounds: Rgba[] } | undefined {
  const color = parseColorLiteral(element.color);
  if (element.background.kind === 'image' || color === undefined) {
    return undefined;
  }

  const backgrounds = element.background.colors
    .map((hex) => parseColorLiteral(hex))
    .filter((background) => background !== undefined);
  const foreground = { ...color, alpha: color.alpha * element.opacity };
  const ratio = Math.min(...backgrounds.map((background) => contrastRatio(foreground, background)));
  const required = isLargeText(element.renderedFontSizePx, element.fontWeight)
    ? GRAPHIC_CONTRAST
    : TEXT_CONTRAST;
  return Number.isFinite(ratio) ? { ratio, required, backgrounds } : undefined;
}

/**
 * The layout contract a slide rule gets, if the slide's layout is known.
 */
type SlideRuleLayout = SlideRuleInput['layout'];

/**
 * The layout fields that move text over a photo or change what is under it, with what to write.
 */
const MEDIA_FIELD_ADVICE: ReadonlyMap<string, string> = new Map([
  ['text', '`text: left`, `right`, `bottom` or `none` to put the text where the photo is calm'],
  ['focal', '`focal` to crop the photo so its busy part is away from the text'],
  ['treatment', '`treatment` for a darker or flatter treatment of the photo'],
]);

/**
 * The fix for text over a layout's background layers: the surface's image or pattern, or the
 * slide's own `background:` image.
 */
const BACKDROP_FIX =
  'The background under this text is too busy or too close to its color. Put the slide on ' +
  "another surface or write `background: none`; for the slide's own `background:` image, raise " +
  "its `tint` (`tint: { role: bg, opacity: 0.7 }`); for the surface's layers, raise their " +
  '`tint` in the brand or move a placed image away from the text.';

/**
 * The fix for text over a picture: for a layout's background layers, their tint or the slide's
 * `background:`; else the slide layout's options that move the text or change the picture under it,
 * else a layout made for text over a photo.
 *
 * @param layout - The slide's layout contract, if known.
 * @param backdrop - Whether the pictures under the text are the layout's background layers.
 */
function mediaFix(layout: SlideRuleLayout, backdrop: boolean): string {
  if (backdrop) {
    return BACKDROP_FIX;
  }

  const fields = Object.keys(layout?.schema.fields ?? {});
  const options = [...MEDIA_FIELD_ADVICE]
    .filter(([field]) => fields.includes(field))
    .map(([, advice]) => advice);
  if (options.length > 0) {
    return (
      `Text over the photo needs a backing it does not have here. Use the ${layout?.name ?? ''} ` +
      `layout's options: ${options.join('; ')}; or set the photo and the text side by side ` +
      '(split).'
    );
  }

  return (
    'Text over a photo or picture needs a scrim or a calm area behind it. Use the image layout, ' +
    'which sets text over a photo on a scrim, or split to set them side by side, rather than ' +
    'placing text over the picture by hand.'
  );
}

/**
 * The fix: the surface's text roles that pass on these backgrounds, or advice when none does.
 *
 * @param surface - The slide's surface.
 * @param backgrounds - The colors the text sits on.
 * @param required - The ratio to reach.
 */
function fixFor(surface: SurfaceTokens, backgrounds: readonly Rgba[], required: number): string {
  const passing = TEXT_COLORS.flatMap(({ name, color: of }) => {
    const color = parseColorLiteral(of(surface));
    if (color === undefined) {
      return [];
    }

    const ratio = Math.min(...backgrounds.map((background) => contrastRatio(color, background)));
    return ratio >= required ? [`\`text-${name}\` (${format(ratio)}:1)`] : [];
  });
  if (passing.length === 0) {
    return (
      'Put the text on the surface itself rather than a custom background, or switch the ' +
      'slide to a surface made for it (`surface:` frontmatter).'
    );
  }

  return (
    `Use a text role of the "${surface.name}" surface: ${passing.join(', ')}; remove opacity ` +
    'and custom colors on the text and its background.'
  );
}

/**
 * A contrast ratio with two decimals.
 *
 * @param ratio - A contrast ratio.
 */
function format(ratio: number): string {
  return ratio.toFixed(2);
}
