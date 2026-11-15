import type {
  BrandContext,
  ElementSnapshot,
  RuleViolation,
  Severity,
  SlideRule,
  StepSnapshot,
} from '#lint/types.ts';

import { isBrandColor, isTokenSize } from '#lint/brand-context.ts';
import { TAILWIND_SPACING_UNIT_PX } from '#lint/limits.ts';
import { describeElement, round } from '#lint/rules/describe.ts';
import { visibleTextElements } from '#lint/rules/elements.ts';

/**
 * Elements whose monospace text is commonly set a little smaller than the text around it, so their
 * font size is not checked against the type scale.
 */
const MONOSPACE_TAGS = new Set(['code', 'kbd', 'samp']);

/**
 * The `data-*` attribute (without its prefix) the kit sets on text it scales to fit its box; such
 * text and everything inside it is not checked against the type scale.
 */
const FITTED_TEXT_ATTRIBUTE = 'fit';

/**
 * How close to a whole multiple of the Tailwind spacing unit a value must be to count as one.
 */
const MULTIPLE_TOLERANCE = 0.01;

/**
 * The text colors allowed over a photo whatever the brand: white on a dark scrim, black on a light
 * one.
 */
const PHOTO_TEXT_COLORS = new Set(['#ffffff', '#000000']);

/**
 * The kinds of off-brand value, each with its severity and its fix.
 */
type OffBrandKind = 'color' | 'family' | 'size' | 'spacing';

/**
 * One off-brand value and every element that uses it.
 */
type Occurrence = {
  /**
   * What kind of value it is.
   */
  kind: OffBrandKind;

  /**
   * The value as the message shows it, such as `#ff0000` or `16px`.
   */
  value: string;

  /**
   * Where it is used, such as `text color` or `padding`.
   */
  property: string;

  /**
   * The elements that use it, in document order.
   */
  elements: ElementSnapshot[];
};

/**
 * Records a use of an off-brand value.
 */
type Add = (kind: OffBrandKind, property: string, value: string, element: ElementSnapshot) => void;

/**
 * Colors, font families, font sizes and spacing that are not tokens of the brand for the slide's
 * surface: hard-coded colors and fonts in inline styles or arbitrary Tailwind values, type sizes
 * outside the scale (except text scaled to fit, marked `data-fit`), and Tailwind's default numeric
 * padding and gaps (`p-4`, `gap-6`) where they resolve to a length the brand's spacing scale does
 * not have. Arbitrary spacing such as `pb-[0.14em]` is not checked, and neither are margins: the
 * browser reports `auto` margins as lengths, so they cannot be told apart from `m-4`. Each value is
 * reported once per step, with the first element that uses it.
 */
export const offBrandRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'off-brand',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is visible changes with the step.
   */
  scope: 'step',

  /**
   * Off-brand colors and fonts fail the deck; sizes and spacing are warnings.
   */
  severity: 'error',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description:
    'Colors, font families, type sizes or Tailwind numeric spacing that are not brand tokens.',

  /**
   * Reports each off-brand value once, at the first element that uses it.
   */
  check: ({ snapshot, brand }) => {
    const occurrences = new Map<string, Occurrence>();

    /**
     * Records one use of an off-brand value.
     */
    const add = (kind: OffBrandKind, property: string, value: string, element: ElementSnapshot) => {
      const key = `${kind}|${property}|${value}`;
      const existing = occurrences.get(key);
      if (existing === undefined) {
        occurrences.set(key, { kind, property, value, elements: [element] });
      } else {
        existing.elements.push(element);
      }
    };
    for (const element of snapshot.elements) {
      checkPaint(element, brand, add);
      checkSpacing(element, brand, add);
    }

    const fitted = fittedElements(snapshot);
    for (const element of visibleTextElements(snapshot)) {
      checkText(element, brand, fitted.has(element.index), add);
    }

    return [...occurrences.values()].map((occurrence) => violation(occurrence, brand));
  },
};

/**
 * Checks the element's background, and its SVG fill and stroke.
 *
 * @param element - A measured element.
 * @param brand - The brand on the slide's surface.
 * @param add - Records an off-brand value.
 */
function checkPaint(element: ElementSnapshot, brand: BrandContext, add: Add): void {
  const colors = brand.allowed.colors;
  if (!isTransparent(element.backgroundColor) && !isBrandColor(element.backgroundColor, colors)) {
    add('color', 'background', rgbPart(element.backgroundColor), element);
  }

  for (const [property, color] of Object.entries(element.paint)) {
    if (color !== null && !isTransparent(color) && !isBrandColor(color, colors)) {
      add('color', property, rgbPart(color), element);
    }
  }
}

/**
 * Checks the color, family and size of an element's own text.
 *
 * @param element - A text element.
 * @param brand - The brand on the slide's surface.
 * @param isFitted - Whether a component scales the text to fit, so its size is not a token.
 * @param add - Records an off-brand value.
 */
function checkText(
  element: ElementSnapshot,
  brand: BrandContext,
  isFitted: boolean,
  add: Add,
): void {
  // Text over a photo is white on a scrim whatever the surface (the image layout), which no
  // surface's tokens describe; `contrast` checks it against the pixels under it instead.
  const isPhotoText =
    element.background.kind === 'media' && PHOTO_TEXT_COLORS.has(rgbPart(element.color));
  if (!isPhotoText && !isBrandColor(element.color, brand.allowed.colors)) {
    add('color', 'text color', rgbPart(element.color), element);
  }

  const family = element.fontFamily.toLowerCase();
  const families = brand.allowed.families.map((name) => name.toLowerCase());
  if (family !== '' && !families.includes(family)) {
    add('family', 'font family', element.fontFamily, element);
  }

  const isMonospace = MONOSPACE_TAGS.has(element.tag) || family === monoFamily(brand);
  const checksSize = !element.inSvg && !isMonospace && !isFitted;
  if (checksSize && !isTokenSize(element.fontSizePx, brand.allowed.fontSizes)) {
    add('size', 'font size', `${round(element.fontSizePx)}px`, element);
  }
}

/**
 * The elements scaled to fit (`data-fit`) and everything inside them.
 *
 * @param snapshot - The measured slide.
 */
function fittedElements(snapshot: StepSnapshot): ReadonlySet<number> {
  const fitted = new Set<number>();
  for (const element of snapshot.elements) {
    const inFitted = element.parent !== null && fitted.has(element.parent);
    if (inFitted || FITTED_TEXT_ATTRIBUTE in element.data) {
      fitted.add(element.index);
    }
  }

  return fitted;
}

/**
 * Checks padding and gap for Tailwind numeric spacing that is not a brand token.
 *
 * @param element - A measured element.
 * @param brand - The brand.
 * @param add - Records an off-brand value.
 */
function checkSpacing(element: ElementSnapshot, brand: BrandContext, add: Add): void {
  if (element.inSvg) {
    return;
  }

  const { padding, gap } = element.spacing;
  const values: [string, readonly number[]][] = [
    ['padding', padding],
    ['gap', gap],
  ];
  for (const [property, lengths] of values) {
    for (const length of new Set(lengths.map(Math.abs))) {
      if (isTailwindStep(length) && !isTokenSize(length, brand.allowed.spacing)) {
        add('spacing', property, `${round(length)}px`, element);
      }
    }
  }
}

/**
 * Whether a length is a step of Tailwind's default numeric spacing scale.
 *
 * @param length - A length in canvas pixels.
 */
function isTailwindStep(length: number): boolean {
  if (length === 0) {
    return false;
  }

  const steps = length / TAILWIND_SPACING_UNIT_PX;
  return Math.abs(steps - Math.round(steps)) < MULTIPLE_TOLERANCE;
}

/**
 * The violation for one off-brand value.
 *
 * @param occurrence - The value and where it is used.
 * @param brand - The brand, for the fix.
 */
function violation(occurrence: Occurrence, brand: BrandContext): RuleViolation {
  const [first] = occurrence.elements;
  const where = first === undefined ? 'An element' : describeElement(first);
  const more = occurrence.elements.length > 1 ? ' (and others)' : '';
  return {
    key: `${occurrence.property}|${occurrence.value}`,
    message:
      `${where}${more} uses the ${occurrence.property} ${occurrence.value}, which is not a ` +
      `${brand.name} brand token${surfaceNote(occurrence.kind, brand)}.`,
    fix: fixFor(occurrence.kind, brand),
    selector: first?.selector ?? null,
    severity: severityOf(occurrence.kind),
  };
}

/**
 * The part of a message that names the surface: colors are tokens of one surface, the other kinds
 * are not.
 *
 * @param kind - The kind of value.
 * @param brand - The brand, resolved for the slide's surface.
 */
function surfaceNote(kind: OffBrandKind, brand: BrandContext): string {
  return kind === 'color' ? ` on the "${brand.surface.name}" surface` : '';
}

/**
 * The severity of an off-brand value: colors and families are errors, sizes and spacing warnings.
 *
 * @param kind - The kind of value.
 */
function severityOf(kind: OffBrandKind): Severity {
  return kind === 'color' || kind === 'family' ? 'error' : 'warning';
}

/**
 * The fix for one kind of off-brand value, naming the brand's tokens.
 *
 * @param kind - The kind of value.
 * @param brand - The brand.
 */
function fixFor(kind: OffBrandKind, brand: BrandContext): string {
  switch (kind) {
    case 'color':
      return (
        'Use a role class such as `text-fg`, `text-muted`, `bg-surface` or `border-accent`, a ' +
        'palette step or a chart color instead of a hard-coded color. `pnpm deck brand --json` ' +
        'lists every color.'
      );
    case 'family':
      return (
        'Use `font-display`, `font-body` or `font-mono`, or a `type-*` step; the brand sets ' +
        `${brand.allowed.families.join(', ')}.`
      );
    case 'size':
      return (
        "Use a `type-*` step; the brand's sizes are " + `${brand.allowed.fontSizes.join(', ')}px.`
      );
    case 'spacing':
      return (
        "Use a brand spacing step (`p-sm`, `gap-lg`, `px-margin-x`, ...) instead of Tailwind's " +
        `numeric scale (\`p-4\` is 16px); ` +
        `the brand's steps are ${brand.allowed.spacing.join(', ')}px.`
      );
  }
}

/**
 * The brand's monospace family, lowercase.
 *
 * @param brand - The brand.
 */
function monoFamily(brand: BrandContext): string {
  return brand.tokens.typography.families.mono.family.toLowerCase();
}

/**
 * Whether a hex color is fully transparent.
 *
 * @param hex - `#rrggbb` or `#rrggbbaa`.
 */
function isTransparent(hex: string): boolean {
  return hex.length === '#rrggbbaa'.length && hex.endsWith('00');
}

/**
 * The `#rrggbb` part of a hex color, so translucent uses of one color group together.
 *
 * @param hex - `#rrggbb` or `#rrggbbaa`.
 */
function rgbPart(hex: string): string {
  return hex.slice(0, '#rrggbb'.length);
}
