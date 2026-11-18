import type { BrandTokens, SurfaceTokens, TypeScaleFacts } from '@deckster/brand';
import type { AnyLayoutContract } from '@deckster/engine/layout';

import { Schema } from 'effect';

/**
 * How serious a finding is. Errors make `deck lint` exit non-zero.
 */
export const Severity = Schema.Literals(['error', 'warning']);

/**
 * How serious a finding is. Errors make `deck lint` exit non-zero.
 */
export type Severity = typeof Severity.Type;

/**
 * One problem found in a deck, with where it is and how to fix it. `deck lint --json` prints these.
 */
export const LintFinding = Schema.Struct({
  /**
   * The slide id, or `null` for a problem with the deck as a whole.
   */
  slide: Schema.NullOr(Schema.String),

  /**
   * The source file at fault, relative to the workspace root.
   */
  file: Schema.String,

  /**
   * The step the problem shows at, or `null` when it does not depend on a step.
   */
  step: Schema.NullOr(Schema.Number),

  /**
   * The id of the rule that found it; `schema` for build pipeline and brand problems.
   */
  rule: Schema.String,

  /**
   * Whether the finding fails the deck.
   */
  severity: Severity,

  /**
   * What is wrong, as a sentence.
   */
  message: Schema.String,

  /**
   * What to change to fix it, as a sentence.
   */
  fix: Schema.String,

  /**
   * A CSS-like path to the element at fault inside the slide, or `null` for non-visual rules.
   */
  selector: Schema.NullOr(Schema.String),
});

/**
 * One problem found in a deck, with where it is and how to fix it.
 */
export type LintFinding = typeof LintFinding.Type;

/**
 * A rectangle in canvas pixels, relative to the canvas's top-left corner.
 */
export type Box = {
  /**
   * The left edge.
   */
  x: number;

  /**
   * The top edge.
   */
  y: number;

  /**
   * The width.
   */
  width: number;

  /**
   * The height.
   */
  height: number;
};

/**
 * What is painted behind an element's text, found by walking up its ancestors to the canvas and
 * painting each background over the one below: the set of opaque colors the text may sit on (one
 * for a solid background, several for a gradient), or `image` when a picture is part of it and the
 * colors cannot be known. Translucent noise layers (a gradient's grain) are ignored.
 */
export type EffectiveBackground =
  | {
      /**
       * Solid colors and gradients only.
       */
      kind: 'colors';

      /**
       * Every opaque color the text may sit on, as `#rrggbb`.
       */
      colors: readonly string[];
    }
  | {
      /**
       * An image is painted behind the text.
       */
      kind: 'image';
    }
  | {
      /**
       * A photo, video or picture that is not an ancestor is painted under the text (text over a
       * full-bleed photo): its colors are sampled from a screenshot of the slide with its text
       * hidden, scrims and overlays included.
       */
      kind: 'media';

      /**
       * The darkest and lightest colors under the text's glyph boxes (2nd and 98th percentile of
       * luminance, so a stray pixel does not decide), as `#rrggbb`; empty when they could not be
       * sampled.
       */
      colors: readonly string[];

      /**
       * Set when every picture under the text is one of the layout's background layers (the
       * surface's `background` in the brand, or the slide's own `background:`), so the fix names
       * those rather than the image layout.
       */
      backdrop?: true;
    };

/**
 * An `<img>` element's source and its intrinsic size.
 */
export type ImageSnapshot = {
  /**
   * The URL the image loaded from.
   */
  src: string;

  /**
   * The intrinsic width in image pixels; 0 when the image failed to load.
   */
  naturalWidth: number;

  /**
   * The intrinsic height in image pixels; 0 when the image failed to load.
   */
  naturalHeight: number;

  /**
   * Whether the image is an SVG, which has no fixed resolution.
   */
  vector: boolean;
};

/**
 * Padding, margin and gap of an element in canvas pixels, in CSS order (top, right, bottom, left).
 */
export type SpacingSnapshot = {
  /**
   * Padding: top, right, bottom, left.
   */
  padding: readonly [number, number, number, number];

  /**
   * Margin: top, right, bottom, left; negative margins are kept.
   */
  margin: readonly [number, number, number, number];

  /**
   * Row gap and column gap; 0 for `normal`.
   */
  gap: readonly [number, number];
};

/**
 * An element on the slide on screen, measured in canvas pixels. Colors are hex: `#rrggbb`, or
 * `#rrggbbaa` when translucent.
 */
export type ElementSnapshot = {
  /**
   * Position in {@link StepSnapshot.elements}; elements are in document order.
   */
  index: number;

  /**
   * The `index` of the nearest recorded ancestor, or `null` for a top-level element.
   */
  parent: number | null;

  /**
   * A CSS-like path to the element inside the slide, such as `div.layout > h1`.
   */
  selector: string;

  /**
   * The tag name in lowercase.
   */
  tag: string;

  /**
   * The element's own text (not its children's), collapsed to single spaces.
   */
  text: string;

  /**
   * Words in the element's own text: whitespace-separated runs that contain a letter or digit.
   */
  words: number;

  /**
   * Rendered lines of the element's own text; 0 without text.
   */
  lines: number;

  /**
   * The boxes of the element's own text, one per line fragment, as the browser lays them out (the
   * font's full height, which can be taller than the line box).
   */
  textLines: readonly Box[];

  /**
   * The bounding box, after transforms.
   */
  rect: Box;

  /**
   * The padding box (inside the borders), which content must stay in.
   */
  innerRect: Box;

  /**
   * The first family of the computed `font-family`, unquoted, such as `Inter Variable`.
   */
  fontFamily: string;

  /**
   * The computed font size in CSS pixels, before transforms.
   */
  fontSizePx: number;

  /**
   * The size the text appears at on the 1920x1080 canvas: the font size times every CSS transform,
   * `scale` and `zoom` on the way up to the canvas and, inside an SVG, the viewBox scaling.
   */
  renderedFontSizePx: number;

  /**
   * The computed line height in CSS pixels, or `null` for `normal`.
   */
  lineHeightPx: number | null;

  /**
   * The computed font weight, such as `400`.
   */
  fontWeight: number;

  /**
   * The computed text color.
   */
  color: string;

  /**
   * The element's own background color; `#00000000` when transparent.
   */
  backgroundColor: string;

  /**
   * The SVG `fill` and `stroke` colors, or `null` outside SVG or for `none` and URL paints.
   */
  paint: { fill: string | null; stroke: string | null };

  /**
   * What the element's text sits on.
   */
  background: EffectiveBackground;

  /**
   * The effective opacity: the product of the element's `opacity` and its ancestors' up to the
   * slide.
   */
  opacity: number;

  /**
   * The computed `position`, such as `static` or `absolute`.
   */
  position: string;

  /**
   * The computed `display`, such as `block` or `inline`.
   */
  display: string;

  /**
   * The computed horizontal `overflow` value, such as `visible` or `hidden`.
   */
  overflowX: string;

  /**
   * The computed vertical `overflow` value.
   */
  overflowY: string;

  /**
   * The inner width of the box in CSS pixels; 0 for inline elements.
   */
  clientWidth: number;

  /**
   * The inner height of the box in CSS pixels; 0 for inline elements.
   */
  clientHeight: number;

  /**
   * The width of the box's content in CSS pixels.
   */
  scrollWidth: number;

  /**
   * The height of the box's content in CSS pixels.
   */
  scrollHeight: number;

  /**
   * Padding, margin and gap.
   */
  spacing: SpacingSnapshot;

  /**
   * The element's own `data-*` attributes, by name without the `data-` prefix.
   */
  data: Readonly<Record<string, string>>;

  /**
   * Whether the author marked the element or an ancestor inside the slide as decoration with
   * `aria-hidden="true"` or `data-decorative`. Overflow and text rules skip it.
   */
  decorative: boolean;

  /**
   * Whether the element is an image, video, canvas or inline SVG.
   */
  isMedia: boolean;

  /**
   * Whether the element is inside an inline SVG (the `<svg>` itself excluded).
   */
  inSvg: boolean;

  /**
   * The source and intrinsic size of an `<img>`; `null` for other elements.
   */
  image: ImageSnapshot | null;

  /**
   * How CSS cuts the element's text short right now: `ellipsis` (`text-overflow: ellipsis` with
   * content wider than the box), `clamp` (`line-clamp` with more lines than it shows), or `null`.
   */
  truncation: 'ellipsis' | 'clamp' | null;
};

/**
 * What one filled layout slot on the slide holds, counted over all its content, hidden steps
 * included, so the count is the same at every step.
 */
export type SlotSnapshot = {
  /**
   * The slot name, such as `body` or `left`.
   */
  name: string;

  /**
   * Words: whitespace-separated runs that contain a letter or digit.
   */
  words: number;

  /**
   * List items (`<li>`).
   */
  bullets: number;

  /**
   * Lines: the lines of code each code block or terminal holds (`data-code-lines`, blank lines
   * included, its title bar and line numbers left out), plus the distinct line positions of the
   * slot's other text.
   */
  lines: number;

  /**
   * The blocks of content the slot holds by kind (the layout contract's content kinds: `text`,
   * `heading`, `bullets`, `quote`, `number`, `table`, `chart`, `diagram`, `code`, `image`,
   * `video`), counted over every step; a kind the slot does not hold is absent. Missing in
   * snapshots made before it was measured.
   */
  kinds?: Readonly<Record<string, number>>;
};

/**
 * A slide that threw while rendering: the engine shows the error in its place, marked with
 * `data-slide-error`.
 */
export type RenderErrorSnapshot = {
  /**
   * The slide file the engine names.
   */
  file: string;

  /**
   * What the slide threw.
   */
  message: string;
};

/**
 * Everything measured on one slide at one step. Hidden elements (display none, `visibility:
 * hidden`, such as steps not yet revealed) are not recorded.
 */
export type StepSnapshot = {
  /**
   * The step shown, from 0.
   */
  step: number;

  /**
   * The canvas size in canvas pixels; 1920x1080 unless the page failed to lay out.
   */
  canvas: { width: number; height: number };

  /**
   * The brand surface the slide is painted with, from its `data-surface`.
   */
  surface: string;

  /**
   * The visible elements, in document order.
   */
  elements: readonly ElementSnapshot[];

  /**
   * The filled slots of the slide's layout, in document order.
   */
  slots: readonly SlotSnapshot[];

  /**
   * The error the slide shows instead of its content, or `null` when it rendered.
   */
  renderError: RenderErrorSnapshot | null;

  /**
   * Uncaught errors the page threw while this step was shown.
   */
  pageErrors: readonly string[];
};

/**
 * One slide as the rules see it.
 */
export type SlideContext = {
  /**
   * The zero-based position in the deck.
   */
  index: number;

  /**
   * The slide id.
   */
  id: string;

  /**
   * The slide file relative to the workspace, as findings show it.
   */
  file: string;

  /**
   * The frontmatter title, else the first heading, else the id.
   */
  title: string;

  /**
   * The layout the slide names.
   */
  layout: string;

  /**
   * The brand surface the slide names, `default` when it names none.
   */
  surface: string;

  /**
   * The slide's validated frontmatter.
   */
  frontmatter: Readonly<Record<string, unknown>>;

  /**
   * The speaker notes; empty when the slide has none.
   */
  notes: string;

  /**
   * The speaking budget in seconds, or `undefined` when the slide sets none.
   */
  budgetSeconds: number | undefined;

  /**
   * Whether the slide is hidden (`hidden: true`). Slide rules still check it; the deck rules that
   * describe the talk leave it out.
   */
  hidden: boolean;

  /**
   * The number of steps, step 0 included.
   */
  stepCount: number;
};

/**
 * The deck as the rules see it.
 */
export type DeckContext = {
  /**
   * The deck folder name.
   */
  id: string;

  /**
   * The deck title.
   */
  title: string;

  /**
   * The deck config file relative to the workspace, for deck-wide findings.
   */
  configFile: string;

  /**
   * Every slide, in order.
   */
  slides: readonly SlideContext[];

  /**
   * How long the talk may take, in seconds, from the deck config's `duration`; `undefined` when the
   * config has none, and then `time-budget` checks nothing.
   */
  durationSeconds: number | undefined;

  /**
   * Uncaught errors the page threw while it loaded, before any slide was shown.
   */
  pageErrors: readonly string[];

  /**
   * Open review comments by slide id, from `decks/<deck>/.feedback`; slides without any are left
   * out.
   */
  openComments: Readonly<Record<string, number>>;
};

/**
 * The values a brand allows on one surface, prepared for fast lookups.
 */
export type BrandValues = {
  /**
   * Every color token usable on the surface as `#rrggbb`: its roles, code, diagram, data and chart
   * colors, its chart plate, backdrop and shadow colors, plus the brand's palette and gradient
   * colors.
   */
  colors: readonly string[];

  /**
   * The colors the brand's diagram cards paint on the surface, as `#rrggbb`: fills, outlines,
   * accent stripes, shadow colors, and title, subtitle and icon colors, which the brand derives to
   * read on each fill and so may match no role. Allowed only inside a diagram part drawn with a
   * card.
   */
  cardColors: readonly string[];

  /**
   * The brand's font family names (display, body, mono), as the brand writes them.
   */
  families: readonly string[];

  /**
   * Every type step size in canvas pixels, smallest first.
   */
  fontSizes: readonly number[];

  /**
   * Every spacing token in canvas pixels: the scale, the slide margins and the grid gutter.
   */
  spacing: readonly number[];
};

/**
 * The brand the deck renders with, resolved for the surface of the slide being checked.
 */
export type BrandContext = {
  /**
   * The brand folder name.
   */
  name: string;

  /**
   * Every resolved token, as `deck brand --json` prints them.
   */
  tokens: BrandTokens;

  /**
   * The minimum type size, WCAG's large-text sizes and the brand's type scale.
   */
  typeScale: TypeScaleFacts;

  /**
   * The slide's surface, resolved; the default surface for deck-wide rules.
   */
  surface: SurfaceTokens;

  /**
   * The values the brand allows on that surface.
   */
  allowed: BrandValues;
};

/**
 * What a slide rule checks: the measured slide, the slide's own data and neighbours, the deck, the
 * brand for the slide's surface, and the contract of the slide's layout.
 */
export type SlideRuleInput = {
  /**
   * The slide measured at one step; for a slide-scope rule, at its last step.
   */
  snapshot: StepSnapshot;

  /**
   * The slide's frontmatter, notes, budget and position.
   */
  slide: SlideContext;

  /**
   * The slides before and after it, `undefined` at either end.
   */
  neighbours: { previous: SlideContext | undefined; next: SlideContext | undefined };

  /**
   * The deck the slide belongs to.
   */
  deck: DeckContext;

  /**
   * The brand, resolved for the slide's surface.
   */
  brand: BrandContext;

  /**
   * The contract of the slide's layout (slots, content budget, example); `undefined` when the
   * layout is not in the catalog.
   */
  layout: AnyLayoutContract | undefined;
};

/**
 * What a deck rule checks: every slide and the brand on its default surface.
 */
export type DeckRuleInput = {
  /**
   * The deck and all its slides.
   */
  deck: DeckContext;

  /**
   * The brand, resolved for the default surface.
   */
  brand: BrandContext;
};

/**
 * What a rule reports; the runner adds the file, step and rule id.
 */
export type RuleViolation = {
  /**
   * What is wrong, as a sentence.
   */
  message: string;

  /**
   * What to change to fix it, as a sentence.
   */
  fix: string;

  /**
   * The element at fault, or `null` when the violation is not about one element.
   */
  selector: string | null;

  /**
   * Overrides the rule's own severity for this violation.
   */
  severity?: Severity;

  /**
   * What makes the violation the same one at another step, so it is reported once per slide.
   * Defaults to the selector, else the message.
   */
  key?: string;
};

/**
 * What a deck rule reports: a violation, and the slide it is about (`null` for the whole deck).
 */
export type DeckViolation = RuleViolation & {
  /**
   * The id of the slide the violation points at, or `null` for the deck as a whole.
   */
  slide: string | null;
};

/**
 * The fields every rule has.
 */
type RuleCommon = {
  /**
   * A unique kebab-case id, shown in output and used to match findings.
   */
  id: string;

  /**
   * The severity of its violations unless a violation overrides it.
   */
  severity: Severity;

  /**
   * One sentence for documentation and `--help`.
   */
  description: string;
};

/**
 * A check of one slide. A `step` rule runs on every step of the slide (what is visible changes
 * between steps); a `slide` rule runs once, on the slide's last step, for checks that do not depend
 * on the step.
 */
export type SlideRule = RuleCommon & {
  /**
   * Tells slide rules from deck rules.
   */
  kind: 'slide';

  /**
   * Whether the rule runs on every step or once per slide.
   */
  scope: 'step' | 'slide';

  /**
   * Finds the rule's violations; an empty list when the slide passes.
   */
  check: (input: SlideRuleInput) => RuleViolation[];
};

/**
 * A check of the deck as a whole, such as the order of layouts or the total speaking time. It runs
 * once, after every slide has been measured.
 */
export type DeckRule = RuleCommon & {
  /**
   * Tells deck rules from slide rules.
   */
  kind: 'deck';

  /**
   * Finds the rule's violations; an empty list when the deck passes.
   */
  check: (input: DeckRuleInput) => DeckViolation[];
};

/**
 * One rendered check. Add a rule by creating a file under `lint/rules/` and listing it in
 * `LINT_RULES`; the runner needs no change.
 */
export type LintRule = SlideRule | DeckRule;
