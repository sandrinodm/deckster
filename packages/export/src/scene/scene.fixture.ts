import type {
  BoxNode,
  RunStyle,
  SceneLine,
  SceneParagraph,
  SceneRun,
  SlideScene,
  TextNode,
} from '#scene/scene.ts';

/**
 * A run style with overrides: 36px Inter, black, upright.
 *
 * @param overrides - Fields that differ.
 */
export function runStyle(overrides: Partial<RunStyle> = {}): RunStyle {
  return {
    family: 'Inter',
    stack: 'Inter, sans-serif',
    size: 36,
    weight: 400,
    italic: false,
    color: '#161920',
    letterSpacing: 0,
    caps: 'none',
    underline: false,
    strike: false,
    shift: 'none',
    axes: { wght: 400 },
    ascent: 34.9,
    descent: 8.7,
    ...overrides,
  };
}

/**
 * A run.
 *
 * @param text - Its text.
 * @param overrides - Fields that differ.
 */
export function run(text: string, overrides: Partial<SceneRun> = {}): SceneRun {
  return {
    text,
    style: runStyle(),
    href: null,
    rect: { x: 128, y: 100, width: text.length * 18, height: 43.6 },
    ...overrides,
  };
}

/**
 * A line with one run.
 *
 * @param text - Its text.
 * @param baseline - Its baseline.
 * @param overrides - Fields that differ.
 */
export function line(
  text: string,
  baseline: number,
  overrides: Partial<SceneLine> = {},
): SceneLine {
  return {
    runs: [run(text)],
    baseline,
    left: 128,
    right: 128 + text.length * 18,
    ascent: 34.9,
    descent: 8.7,
    authored: false,
    ...overrides,
  };
}

/**
 * A left-aligned paragraph.
 *
 * @param lines - Its lines.
 * @param overrides - Fields that differ.
 */
export function paragraph(
  lines: SceneLine[],
  overrides: Partial<SceneParagraph> = {},
): SceneParagraph {
  const first = lines[0]?.baseline ?? 0;
  return {
    lines,
    step: null,
    replacedAt: null,
    align: 'left',
    box: { x: 128, y: first - 34, width: 800, height: lines.length * 50.4 },
    lineHeight: 50.4,
    bullet: null,
    level: 0,
    wrapWidth: 800,
    keepBreaks: false,
    ...overrides,
  };
}

/**
 * A text node with one paragraph.
 *
 * @param id - Its id.
 * @param body - Its paragraph.
 * @param overrides - Fields that differ.
 */
export function textNode(
  id: number,
  body: SceneParagraph,
  overrides: Partial<TextNode> = {},
): TextNode {
  return {
    id,
    parent: null,
    rect: body.box,
    selector: `p:nth-of-type(${id})`,
    order: id,
    opacity: 1,
    hints: [],
    slot: 'body',
    step: null,
    replacedAt: null,
    kind: 'text',
    paragraphs: [body],
    container: null,
    matches: [],
    ...overrides,
  };
}

/**
 * A painted box.
 *
 * @param id - Its id.
 * @param overrides - Fields that differ.
 */
export function boxNode(id: number, overrides: Partial<BoxNode> = {}): BoxNode {
  return {
    id,
    parent: null,
    rect: { x: 100, y: 100, width: 400, height: 200 },
    selector: `div:nth-of-type(${id})`,
    order: id,
    opacity: 1,
    hints: [],
    slot: null,
    step: null,
    replacedAt: null,
    kind: 'box',
    fill: { kind: 'solid', color: '#f4f5f8' },
    borders: [null, null, null, null],
    radii: [0, 0, 0, 0],
    shadows: [],
    fullBleed: false,
    ...overrides,
  };
}

/**
 * A scene on the default surface.
 *
 * @param overrides - Fields that differ.
 */
export function scene(overrides: Partial<SlideScene> = {}): SlideScene {
  return {
    canvas: { width: 1920, height: 1080 },
    surface: 'default',
    layout: 'content',
    background: { kind: 'solid', color: '#fcfcfd' },
    backgroundIsImage: false,
    nodes: [],
    links: [],
    fieldText: {},
    warnings: [],
    tree: {},
    ...overrides,
  };
}
