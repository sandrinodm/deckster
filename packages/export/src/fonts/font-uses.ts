import type { RunStyle, SceneLine, SceneNode, SceneParagraph, SlideScene } from '#scene/scene.ts';

/**
 * Hundredths preserve the axis and size precision used to identify font instances.
 */
const STYLE_ROUNDING_FACTOR = 100;

/**
 * The parts of a run style that pick a font instance.
 */
export type FontStyleKey = Pick<RunStyle, 'family' | 'weight' | 'italic' | 'axes' | 'size'>;

/**
 * Text set in one font style somewhere in the deck.
 */
export type FontUse = {
  /**
   * The family the run asked for: the first family of its computed `font-family`.
   */
  family: string;

  /**
   * The CSS weight.
   */
  weight: number;

  /**
   * Whether the run is italic or oblique.
   */
  italic: boolean;

  /**
   * The variation axes the run set (`font-variation-settings`, weight and stretch).
   */
  axes: Readonly<Record<string, number>>;

  /**
   * The font size in canvas pixels, which picks the optical size of fonts with an `opsz` axis when
   * the run does not set one (`font-optical-sizing: auto`).
   */
  size: number;

  /**
   * Every character set in the style, once each, in first-seen order.
   */
  text: string;
};

/**
 * A run of text outside the scenes' text frames, such as a diagram label, with its style.
 */
export type StyledText = {
  /**
   * The style.
   */
  style: FontStyleKey;

  /**
   * The text.
   */
  text: string;
};

/**
 * Collects every font style the exported slides set text in, with the characters each sets: runs
 * and text markers of text frames and table cells, plus any other styled text the caller passes
 * (diagram and chart labels). Families that are not the brand's are kept; the font plan leaves them
 * to their substitutes.
 *
 * @param scenes - The exported slides' scenes.
 * @param extra - More styled text, such as diagram labels.
 * @returns One use per distinct style, in first-seen order.
 */
export function fontUses(
  scenes: readonly SlideScene[],
  extra: readonly StyledText[] = [],
): FontUse[] {
  const uses = new Map<string, FontUse>();
  for (const scene of scenes) {
    for (const node of scene.nodes) {
      addNode(uses, node);
    }
  }

  for (const entry of extra) {
    addRun(uses, entry.style, entry.text);
  }

  return [...uses.values()];
}

/**
 * Adds the text frames and table cells of one scene node in reading order.
 *
 * @param uses - Font uses collected so far.
 * @param node - A scene node; non-text nodes add no font uses.
 */
function addNode(uses: Map<string, FontUse>, node: SceneNode): void {
  if (node.kind === 'text') {
    addParagraphs(uses, node.paragraphs);
    return;
  }

  if (node.kind !== 'table') {
    return;
  }

  for (const row of node.rows) {
    for (const cell of row.cells) {
      addParagraphs(uses, cell.paragraphs);
    }
  }
}

/**
 * Adds a run of text in a style to the uses, creating the use for a new style. Blank text and runs
 * without a family add nothing.
 *
 * @param uses - The uses so far, by style key.
 * @param style - The style.
 * @param text - The text.
 */
function addRun(uses: Map<string, FontUse>, style: FontStyleKey, text: string): void {
  if (text.trim() === '' || style.family === '') {
    return;
  }

  const key = useKey(style);
  const use = uses.get(key) ?? {
    family: style.family,
    weight: style.weight,
    italic: style.italic,
    axes: style.axes,
    size: style.size,
    text: '',
  };
  use.text = mergeCharacters(use.text, text);
  uses.set(key, use);
}

/**
 * Adds the runs and markers of paragraphs: each bullet, and each run as written and, when the run
 * is capitalised by its style, in capitals too.
 *
 * @param uses - The uses so far, by style key.
 * @param paragraphs - The paragraphs.
 */
function addParagraphs(uses: Map<string, FontUse>, paragraphs: readonly SceneParagraph[]): void {
  for (const paragraph of paragraphs) {
    if (paragraph.bullet?.kind === 'text') {
      addRun(uses, paragraph.bullet.style, paragraph.bullet.text);
    }

    for (const line of paragraph.lines) {
      addLine(uses, line);
    }
  }
}

/**
 * Adds each line's written and capitalised forms so both retain their glyphs in a subset font.
 *
 * @param uses - Font uses collected so far.
 * @param line - The rendered line's runs in reading order.
 */
function addLine(uses: Map<string, FontUse>, line: SceneLine): void {
  for (const run of line.runs) {
    addRun(uses, run.style, run.text);
    if (run.style.caps !== 'none') {
      addRun(uses, run.style, run.text.toUpperCase());
    }
  }
}

/**
 * The key of a style: family, italics, weight, size and axes rounded to a hundredth.
 *
 * @param style - The style.
 */
export function useKey(style: FontStyleKey): string {
  const axes = Object.entries(style.axes)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([tag, value]) => `${tag}=${round(value)}`)
    .join(',');
  const head = [style.family, style.italic ? 'i' : 'n', round(style.weight), round(style.size)];
  return [...head, axes].join('|');
}

/**
 * Characters of two strings, each once, in first-seen order.
 *
 * @param seen - The characters so far.
 * @param text - More text.
 */
export function mergeCharacters(seen: string, text: string): string {
  const characters = new Set(seen);
  for (const character of text) {
    characters.add(character);
  }

  return [...characters].join('');
}

/**
 * A number rounded to a hundredth.
 *
 * @param value - The number.
 */
function round(value: number): number {
  return Math.round(value * STYLE_ROUNDING_FACTOR) / STYLE_ROUNDING_FACTOR;
}
