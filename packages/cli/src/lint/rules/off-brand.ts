import { deckCommand } from '@deckster/engine/command';

import type {
  BrandContext,
  ElementSnapshot,
  RuleViolation,
  Severity,
  SlideRule,
  StepSnapshot,
} from '#lint/types.ts';

import { brandContext, isBrandColor, isTokenSize } from '#lint/brand-context.ts';
import { TAILWIND_SPACING_UNIT_PX } from '#lint/limits.ts';
import { describeElement, round } from '#lint/rules/describe.ts';
import { visibleTextElements } from '#lint/rules/elements.ts';

/**
 * The `data-diagram-part` values of the parts a diagram card paints.
 */
const CARD_PARTS = new Set(['node', 'node-shape', 'layer', 'item']);

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
 * The SVG elements whose `fill` reaches the slide: the shapes with an inside, the text elements,
 * and `use`, whose copy of the shape it references (not in the snapshot) inherits its paint. Every
 * other SVG element (`g`, `image`, `svg`, `line`, ...) still has a computed `fill` (black when
 * nothing sets one, since that is the SVG default), but draws nothing with it.
 */
const FILL_PAINTING_TAGS = new Set([
  'circle',
  'ellipse',
  'path',
  'polygon',
  'polyline',
  'rect',
  'text',
  'textpath',
  'tspan',
  'use',
]);

/**
 * The SVG elements that paint their own `stroke`: the fill-painting ones and `line`.
 */
const STROKE_PAINTING_TAGS = new Set([...FILL_PAINTING_TAGS, 'line']);

/**
 * The fill an SVG shape gets when neither it nor an ancestor sets one.
 */
const SVG_DEFAULT_FILL = '#000000';

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
 * not have. Inside a diagram part drawn with a card, the card's colors count as brand colors too.
 * Arbitrary spacing such as `pb-[0.14em]` is not checked, and neither are margins: the browser
 * reports `auto` margins as lengths, so they cannot be told apart from `m-4`. Each value is
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
   * The sentence `deckster lint --help` lists for the rule.
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
    const carded = cardedElements(snapshot);
    const surfaces = surfaceBrands(snapshot, brand);
    /**
     * The brand values for an element: card colors are allowed only inside a part drawn with a
     * card.
     */
    const brandFor = (element: ElementSnapshot) => {
      const current = surfaces.get(element.index) ?? brand;
      return carded.has(element.index)
        ? {
            ...current,
            allowed: {
              ...current.allowed,
              colors: [...current.allowed.colors, ...current.allowed.cardColors],
            },
          }
        : current;
    };
    for (const element of snapshot.elements) {
      checkPaint(element, brandFor(element), add);
      checkSpacing(element, brand, add);
    }

    const fitted = fittedElements(snapshot);
    for (const element of visibleTextElements(snapshot)) {
      checkText(element, brandFor(element), fitted.has(element.index), add);
    }

    return [...occurrences.values()].map((occurrence) => {
      const first = occurrence.elements[0];
      return violation(occurrence, first === undefined ? brand : brandFor(first));
    });
  },
};

/**
 * Resolves each element's nearest surface, including nested panels whose derived colors differ from
 * the slide's. Snapshot elements precede their descendants in document order.
 *
 * @param snapshot - The measured elements and their surface attributes.
 * @param brand - The brand on the slide's surface.
 */
function surfaceBrands(
  snapshot: StepSnapshot,
  brand: BrandContext,
): ReadonlyMap<number, BrandContext> {
  const surfaces = new Map<string, BrandContext>([[brand.surface.name, brand]]);
  const elements = new Map<number, BrandContext>();
  for (const element of snapshot.elements) {
    const inherited = element.parent === null ? brand : (elements.get(element.parent) ?? brand);
    const name = element.data['surface'] ?? inherited.surface.name;
    let current = surfaces.get(name);
    if (current === undefined) {
      current = brandContext(brand.name, brand.tokens, name);
      surfaces.set(name, current);
    }

    elements.set(element.index, current);
  }

  return elements;
}

/**
 * Checks the element's background, and the SVG fill and stroke it paints itself.
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

  const painted: [string, string | null, boolean][] = [
    ['fill', element.paint.fill, FILL_PAINTING_TAGS.has(element.tag)],
    ['stroke', element.paint.stroke, STROKE_PAINTING_TAGS.has(element.tag)],
  ];
  for (const [property, color, paints] of painted) {
    if (paints && isOffBrandPaint(color, colors)) {
      add('color', property, rgbPart(color), element);
    }
  }
}

/**
 * Whether an SVG paint is a visible color the brand does not have; `none` and URL paints are not.
 *
 * @param color - The paint as hex, or `null` for `none` and URL paints.
 * @param colors - The brand's colors on the surface.
 */
function isOffBrandPaint(
  color: string | null,
  colors: BrandContext['allowed']['colors'],
): color is string {
  return color !== null && !isTransparent(color) && !isBrandColor(color, colors);
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
 * The diagram parts drawn with a card (a node, its shape, a `<Layers>` band or item) and everything
 * inside them: the elements a card's colors may paint.
 *
 * @param snapshot - The measured slide.
 */
function cardedElements(snapshot: StepSnapshot): ReadonlySet<number> {
  const carded = new Set<number>();
  for (const element of snapshot.elements) {
    const inCard = element.parent !== null && carded.has(element.parent);
    if (inCard || CARD_PARTS.has(element.data['diagram-part'] ?? '')) {
      carded.add(element.index);
    }
  }

  return carded;
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
      `${brand.name} brand token${surfaceNote(occurrence.kind, brand)}.` +
      defaultFillNote(occurrence),
    fix: isSvgPaint(occurrence.property) ? svgPaintFix() : fixFor(occurrence.kind, brand),
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
 * For a black SVG fill, the reminder that black is what a shape without a fill draws, so the color
 * may come from no attribute at all.
 *
 * @param occurrence - The value and where it is used.
 */
function defaultFillNote(occurrence: Occurrence): string {
  if (occurrence.property !== 'fill' || occurrence.value !== SVG_DEFAULT_FILL) {
    return '';
  }

  return ' Black is the SVG default for a shape that sets no fill, and the slide draws it.';
}

/**
 * Whether the property is an SVG paint, whose fix is an SVG attribute rather than a class.
 *
 * @param property - The property as the message names it.
 */
function isSvgPaint(property: string): boolean {
  return property === 'fill' || property === 'stroke';
}

/**
 * The fix for an off-brand SVG fill or stroke: give the shape a color role, or no paint.
 */
function svgPaintFix(): string {
  return (
    'In an `<Svg>` drawing, give the shape a color role of the surface (`data-fill="fg"`, ' +
    '`data-stroke="edge"`) or map its color to one with `recolor`; in your own SVG markup, use ' +
    '`currentColor` under a role class such as `text-fg`. Set `fill="none"` on a shape that ' +
    'should not be filled. `' +
    deckCommand() +
    ' brand --json` lists every color.'
  );
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
        'palette step or a chart color instead of a hard-coded color. `' +
        deckCommand() +
        ' brand --json` ' +
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
