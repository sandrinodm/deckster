/**
 * The numbers a diagram is held to, in one place: the renderer wraps and truncates text by them,
 * `deckster lint` reports diagrams over them and `deckster diagrams --json` prints them. Node-safe:
 * no DOM or React.
 */

/**
 * The most nodes a diagram shows at once before it reads as a wall of boxes; `deckster lint` warns
 * above it (`diagram-too-dense`).
 */
export const DIAGRAM_NODE_BUDGET = 12;

/**
 * The most edges a diagram shows at once; `deckster lint` warns above it (`diagram-too-dense`).
 */
export const DIAGRAM_EDGE_BUDGET = 16;

/**
 * The characters an edge label takes on one line; a longer label wraps.
 */
export const LABEL_MAX_CHARS = 18;

/**
 * The lines an edge label wraps to at most; beyond them it is truncated with an ellipsis, and the
 * full text stays in the accessible summary and the export description.
 */
export const LABEL_MAX_LINES = 2;

/**
 * The lines a node title wraps to (at word boundaries) before the node grows taller than its row.
 */
export const TITLE_MAX_LINES = 3;

/**
 * The fewest characters a word broken across lines leaves on either line.
 */
export const MIN_BREAK_CHARS = 3;

/**
 * Grid columns and rows that fit the `diagram` layout's region (about 1664 by 600 canvas pixels),
 * measured with the default brand: a node is between 7 and 14 caption widths (168 to 336 pixels)
 * and a gutter at least the brand's `space.xl` (64 pixels), wider when edge labels sit in it.
 */
export const DIAGRAM_GRID_LIMITS = {
  /**
   * Columns that keep titles of about 20 characters on one or two lines: 1664 / 5 = 333 pixels a
   * column, a 270-pixel node and a 64-pixel gutter.
   */
  columns: 5,

  /**
   * Columns before nodes get narrower than their minimum (168 + 64 = 232 pixels a column) and `deck
   * lint` reports the diagram as cramped.
   */
  maxColumns: 7,

  /**
   * Rows of two-line nodes (about 100 pixels each with a 64-pixel gutter) that fit with room for
   * edge labels between them.
   */
  rows: 3,

  /**
   * Rows before the gutters between them get too tight for edges (`deckster lint` reports cramped).
   */
  maxRows: 4,
} as const;

/**
 * The hard limits of a diagram: past them the build fails (a diagram would otherwise take seconds
 * to route, or a number would ask the renderer for millions of tracks or particles). They sit far
 * above the budgets `deckster lint` warns about.
 */
export const DIAGRAM_HARD_LIMITS = {
  /**
   * The most nodes one diagram has; edge routing time grows steeply with the size of the diagram.
   */
  maxNodes: 60,

  /**
   * The most edges one diagram has.
   */
  maxEdges: 120,

  /**
   * The most particles one packet or one edge's flow sends together.
   */
  maxParticles: 24,

  /**
   * The highest grid column, row, span or minimum size a node, group or flow may name.
   */
  maxGridIndex: 64,

  /**
   * The highest step an `at` or `until` may name.
   */
  maxStep: 999,

  /**
   * The tallest fixed `height`, in canvas pixels.
   */
  maxHeight: 8192,
} as const;
