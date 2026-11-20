import type { ChartPlan } from '#pptx/chart-model.ts';
import type {
  BoxNode,
  ChartNode,
  ImageNode,
  RasterHint,
  SceneNode,
  ScenePaint,
  SlideScene,
  SvgNode,
} from '#scene/scene.ts';

import { isDrawableDiagram } from '#diagram/decode-diagram.ts';
import { diagramPlanNote } from '#diagram/diagram-plan.ts';
import { planChart, plotSvg } from '#plan/chart-policy.ts';

/**
 * How a PPTX export draws slides: `hybrid` (default) uses native objects where they are faithful
 * and pictures where they are not; `native` never rasterises and reports what it dropped; `image`
 * places one full-slide picture per slide with notes and link hotspots.
 */
export type ExportMode = 'native' | 'hybrid' | 'image';

/**
 * Every {@link ExportMode}, for flag parsing.
 */
export const EXPORT_MODES: readonly ExportMode[] = ['native', 'hybrid', 'image'];

/**
 * Two paints closer than this per channel count as the same color.
 */
const SAME_COLOR_TOLERANCE = 2;

/**
 * Two gradients whose angles differ by less than this many degrees count as the same angle.
 */
const SAME_ANGLE_TOLERANCE_DEG = 1;

/**
 * The dry-run note for an SVG that is dropped or drawn as a picture because of its text, gradients,
 * filters or masks.
 */
const SVG_PICTURE_REASON = 'SVG uses text, gradients, filters or masks';

/**
 * Hex digits per channel in `#rrggbb`.
 */
const HEX_CHANNEL_DIGITS = 2;

/**
 * Hex channels of a color with an alpha: red, green, blue and alpha.
 */
const RGBA_CHANNELS = 4;

/**
 * Hex digits of an opaque `#rrggbb` color, `#` excluded.
 */
const OPAQUE_HEX_DIGITS = 6;

/**
 * Hex digits of a `#rrggbbaa` color, `#` excluded.
 */
const RGBA_HEX_DIGITS = HEX_CHANNEL_DIGITS * RGBA_CHANNELS;

/**
 * The alpha of an opaque color, as an 8-bit channel.
 */
const OPAQUE_ALPHA = 255;

/**
 * One thing the writer draws.
 */
export type PlanItem =
  | {
      /**
       * Drawn with native PowerPoint objects.
       */
      kind: 'native';

      /**
       * The node.
       */
      node: SceneNode;

      /**
       * Image icons and picture fallbacks placed within the diagram's native shapes.
       */
      diagramIcons?: readonly PlanItem[];
    }
  | {
      /**
       * Drawn as a picture of the element as rendered, at 2x.
       */
      kind: 'picture';

      /**
       * The node whose element is captured.
       */
      node: SceneNode;

      /**
       * `subtree` captures the element and everything inside it; `paint` captures only what the
       * element paints itself, and its content stays native.
       */
      scope: 'subtree' | 'paint';

      /**
       * Why it is a picture.
       */
      reasons: RasterHint[];

      /**
       * The name the selection pane shows, when the picture stands for something with a name
       * (`Chart: Tickets per month`).
       */
      name?: string;

      /**
       * Alt text, such as a chart's text summary with its data.
       */
      alt?: string;
    };

/**
 * What happens to one element, for the dry-run report.
 */
export type PlanNote = {
  /**
   * The element, as a CSS-like path.
   */
  selector: string;

  /**
   * What the element is: `text`, `box`, `image`, `svg`, `chart`, and so on.
   */
  what: string;

  /**
   * `native`, `picture` (rasterised at 2x), `simplified` (native with a visible difference) or
   * `dropped` (left out).
   */
  outcome: 'native' | 'picture' | 'simplified' | 'dropped';

  /**
   * Why, as a short phrase.
   */
  why: string;
};

/**
 * Where the slide background comes from: the slide master of its surface, a paint of its own, or a
 * picture of the element that paints it.
 */
export type PlanBackground =
  | {
      /**
       * Inherited from the surface's slide master.
       */
      kind: 'master';
    }
  | {
      /**
       * A fill of the slide's own.
       */
      kind: 'paint';

      /**
       * The fill.
       */
      paint: ScenePaint;

      /**
       * Whether the brand's grain is tiled over it.
       */
      grain: boolean;
    }
  | {
      /**
       * A picture of the element that paints the background.
       */
      kind: 'picture';

      /**
       * The node that paints it.
       */
      node: BoxNode;
    };

/**
 * The plan for one slide: what is drawn, how, and why.
 */
export type ScenePlan = {
  /**
   * The items, in paint order; nodes inside a picture are not listed.
   */
  items: PlanItem[];

  /**
   * The slide background.
   */
  background: PlanBackground;

  /**
   * One note per element that is not plainly native, and one per native text frame or picture, for
   * the dry-run report.
   */
  notes: PlanNote[];
};

/**
 * What the planner knows about the slide master of the slide's surface.
 */
export type MasterBackground = {
  /**
   * The master's own background paint (for a grain texture, the gradient under the grain); a
   * picture texture is a mesh gradient in hybrid mode.
   */
  paint: ScenePaint;

  /**
   * The master's texture: `grain` tiled over its native paint, `picture` when the whole background
   * is a picture (a mesh gradient), else `null`.
   */
  texture: 'grain' | 'picture' | null;
};

/**
 * Decides, for every node of a scene, whether the writer draws it natively, as a picture or not at
 * all. In `hybrid` mode a node with a subtree hint (filter, blend mode, mask, clip path, rotation,
 * text effect, canvas, iframe, unreadable figure) becomes one picture with everything inside it, a
 * box whose own paint is a texture becomes a picture of that paint with its content native, a
 * complex SVG becomes a picture, a chart with a native type becomes a native chart in place of its
 * plot, and a described diagram becomes native shapes. In `native` mode nothing is rasterised:
 * effects are dropped and noted. `image` mode needs no plan; it returns the scene's nodes as native
 * items so callers can still list links.
 *
 * @param scene - The slide's scene.
 * @param mode - The export mode.
 * @param master - The background of the slide master the slide uses.
 * @returns The plan; never fails.
 */
export function planScene(
  scene: SlideScene,
  mode: ExportMode,
  master: MasterBackground,
): ScenePlan {
  const byId = parentLookup(scene);
  const notes: PlanNote[] = [];
  const covered = new Set<number>();
  const items: PlanItem[] = [];
  const background = planBackground(scene, mode, master, notes);
  const rasterRoots = mode === 'hybrid' ? subtreeRasterRoots(scene.nodes, byId) : new Set<number>();
  const charts = chartPlans(scene, mode);
  const figureCovers = figureCoveredIds(scene.nodes, byId, charts);
  for (const node of scene.nodes) {
    if (covered.has(node.id) || isInside(node, rasterRoots, byId) || figureCovers.has(node.id)) {
      covered.add(node.id);
      continue;
    }

    if (node.kind === 'box' && node.fullBleed && isBackgroundBox(node)) {
      continue;
    }

    if (rasterRoots.has(node.id)) {
      const reasons = node.hints.filter((hint) => hint.scope === 'subtree');
      items.push({ kind: 'picture', node, scope: 'subtree', reasons });
      notes.push(note(node, 'picture', reasons.map((hint) => hint.detail).join('; ')));
      continue;
    }

    const icons = node.kind === 'diagram' ? diagramAssets(node.id, scene.nodes, byId) : [];
    items.push(...planNode(node, mode, notes, charts, icons));
  }

  return { items, background, notes };
}

/**
 * The items and notes for one node that is not inside a picture.
 *
 * @param node - The node.
 * @param mode - The export mode.
 * @param notes - Collects notes.
 * @param charts - How each chart is drawn.
 * @param icons - Any icons in this diagram needing image assets.
 */
function planNode(
  node: SceneNode,
  mode: ExportMode,
  notes: PlanNote[],
  charts: ChartPlans,
  icons: readonly (ImageNode | SvgNode)[] = [],
): PlanItem[] {
  const dropped = node.hints.filter((hint) => hint.scope === 'subtree');
  if (dropped.length > 0) {
    notes.push(
      note(node, 'simplified', `effect dropped: ${dropped.map((hint) => hint.detail).join('; ')}`),
    );
  }

  switch (node.kind) {
    case 'box': {
      return planBox(node, mode, notes);
    }

    case 'svg': {
      return planSvg(node, mode, notes, charts);
    }

    case 'chart': {
      return planChartNode(node, mode, notes, charts);
    }

    case 'text': {
      notes.push(note(node, 'native', `text box, ${node.paragraphs.length} paragraph(s)`));
      return [{ kind: 'native', node }];
    }

    case 'image': {
      notes.push(note(node, 'native', node.grayscale ? 'picture with grayscale' : 'picture'));
      return [{ kind: 'native', node }];
    }

    case 'diagram': {
      const planned = diagramPlanNote(node.diagram);
      notes.push(note(node, planned.outcome, planned.why));
      if (!isDrawableDiagram(node.diagram)) {
        return [];
      }

      const diagramIcons = icons.flatMap((icon) => planNode(icon, mode, notes, charts));
      return [{ kind: 'native', node, ...(diagramIcons.length === 0 ? {} : { diagramIcons }) }];
    }

    case 'media': {
      notes.push(note(node, 'native', `${node.media} shown as its poster`));
      return [{ kind: 'native', node }];
    }

    case 'table': {
      notes.push(note(node, 'native', `table, ${node.rows.length} rows`));
      return [{ kind: 'native', node }];
    }
  }
}

/**
 * Finds marked artwork the native diagram writer needs the image pipeline for.
 *
 * @param diagramId - The id of the diagram's scene node.
 * @param nodes - The scene's nodes.
 * @param byId - Finds an element's parent.
 */
function diagramAssets(
  diagramId: number,
  nodes: readonly SceneNode[],
  byId: ParentOf,
): (ImageNode | SvgNode)[] {
  const diagram = new Set([Math.floor(diagramId)]);
  return nodes.filter(
    (node): node is ImageNode | SvgNode =>
      (node.kind === 'image' || (node.kind === 'svg' && node.shapes === null)) &&
      node.diagramIcon === true &&
      isInside(node, diagram, byId),
  );
}

/**
 * The items for an SVG: its vector shapes stay native, and anything else is a picture unless the
 * export is `native`, which drops it.
 *
 * @param node - The SVG.
 * @param mode - The export mode.
 * @param notes - Collects notes.
 * @param charts - How each chart is drawn; a chart's plot is a picture with its name and alt text.
 */
function planSvg(
  node: SvgNode,
  mode: ExportMode,
  notes: PlanNote[],
  charts: ChartPlans,
): PlanItem[] {
  if (node.shapes !== null) {
    notes.push(note(node, 'native', `${node.shapes.length} vector shape(s)`));
    return [{ kind: 'native', node }];
  }

  if (mode === 'native') {
    notes.push(note(node, 'dropped', SVG_PICTURE_REASON));
    return [];
  }

  const chart = charts.pictures.get(node.id);
  if (chart !== undefined) {
    return [{ kind: 'picture', node, scope: 'subtree', reasons: [svgHint()], ...chart }];
  }

  notes.push(note(node, 'picture', SVG_PICTURE_REASON));
  return [{ kind: 'picture', node, scope: 'subtree', reasons: [svgHint()] }];
}

/**
 * The items for a chart: one native chart when its plan has a model. A chart whose parts stay
 * native, or that has no model, adds no item; its note says what happens to it.
 *
 * @param node - The chart.
 * @param mode - The export mode.
 * @param notes - Collects notes.
 * @param charts - How each chart is drawn.
 */
function planChartNode(
  node: ChartNode,
  mode: ExportMode,
  notes: PlanNote[],
  charts: ChartPlans,
): PlanItem[] {
  const plan = charts.plans.get(node.id);
  if (plan?.outcome === 'parts') {
    notes.push(note(node, 'native', `${node.chart.kind}: ${plan.reasons.join('; ')}`));
    return [];
  }

  if (plan?.model == null) {
    const why = plan?.reasons.join('; ') ?? 'no plan';
    notes.push(note(node, mode === 'native' ? 'dropped' : 'picture', `${node.chart.kind}: ${why}`));
    return [];
  }

  const why = [
    `native ${plan.model.groups.map((group) => group.type).join(' and ')} chart`,
    ...plan.changes,
    ...plan.reasons,
  ];
  notes.push(note(node, plan.outcome === 'native' ? 'native' : 'simplified', why.join('; ')));
  return [{ kind: 'native', node }];
}

/**
 * The items for a painted box.
 *
 * @param node - The box.
 * @param mode - The export mode.
 * @param notes - Collects notes.
 */
function planBox(node: BoxNode, mode: ExportMode, notes: PlanNote[]): PlanItem[] {
  const translucent = node.fill !== null && isTranslucentGradient(node.fill);
  if (hasGrainOnly(node) && !translucent) {
    notes.push(note(node, 'native', 'native fill with the grain tiled as a small picture'));
    return [{ kind: 'native', node }];
  }

  const textures = node.hints.filter((hint) => hint.scope === 'paint');
  const paintHints = translucent ? [...textures, translucentGradientHint()] : textures;
  if (paintHints.length > 0 && mode === 'hybrid') {
    notes.push(note(node, 'picture', paintHints.map((hint) => hint.detail).join('; ')));
    return [{ kind: 'picture', node, scope: 'paint', reasons: paintHints }];
  }

  if (translucent) {
    notes.push(
      note(
        node,
        'simplified',
        'gradient with alpha stops: opaque in Apple apps, uneven in LibreOffice',
      ),
    );
  }

  if (textures.length > 0) {
    notes.push(
      note(
        node,
        'simplified',
        `texture dropped: ${textures.map((hint) => hint.detail).join('; ')}`,
      ),
    );
  }

  const paints =
    node.fill !== null || node.borders.some((border) => border !== null) || node.shadows.length > 0;
  if (!paints) {
    return [];
  }

  if (node.shadows.length > 1 || node.shadows.some((shadow) => shadow.spread !== 0)) {
    notes.push(note(node, 'simplified', 'box-shadow reduced to one PowerPoint shadow'));
  }

  return [{ kind: 'native', node }];
}

/**
 * Whether a paint is a gradient with a translucent stop, such as a scrim that fades a photo into
 * the text over it. PowerPoint draws per-stop alpha, but Apple's renderer (Quick Look, Keynote)
 * draws the stops opaque and LibreOffice before 7.6 keeps one alpha ramp between two of the stops
 * and drops the rest, so the fade turns into a hard-edged block. A picture of the paint with its
 * alpha looks the same everywhere.
 *
 * @param paint - A paint.
 */
export function isTranslucentGradient(paint: ScenePaint): boolean {
  return paint.kind !== 'solid' && paint.stops.some((stop) => hexAlpha(stop.color) < OPAQUE_ALPHA);
}

/**
 * The alpha of a hex color, 0 to 255.
 *
 * @param hex - `#rrggbb` or `#rrggbbaa`.
 */
function hexAlpha(hex: string): number {
  const digits = hex.replace('#', '');
  return digits.length > OPAQUE_HEX_DIGITS
    ? Number.parseInt(digits.slice(OPAQUE_HEX_DIGITS), 16)
    : OPAQUE_ALPHA;
}

/**
 * The hint of a box whose gradient has translucent stops (see {@link isTranslucentGradient}).
 */
function translucentGradientHint(): RasterHint {
  return {
    reason: 'translucent-gradient',
    scope: 'paint',
    detail: 'gradient with translucent stops',
  };
}

/**
 * The slide background: inherited from the master when the box that covers the canvas paints what
 * the master paints, else the slide's own paint or a picture.
 *
 * @param scene - The scene.
 * @param mode - The export mode.
 * @param master - The master's background.
 * @param notes - Collects notes.
 */
function planBackground(
  scene: SlideScene,
  mode: ExportMode,
  master: MasterBackground,
  notes: PlanNote[],
): PlanBackground {
  const backdrop = scene.nodes.find(
    (candidate): candidate is BoxNode => candidate.kind === 'box' && candidate.fullBleed,
  );
  if (scene.backgroundIsImage && backdrop !== undefined && hasGrainOnly(backdrop)) {
    const paint = backdrop.fill ?? master.paint;
    if (master.texture === 'grain' && samePaint(paint, master.paint)) {
      return { kind: 'master' };
    }

    return { kind: 'paint', paint, grain: mode !== 'native' };
  }

  if (scene.backgroundIsImage) {
    if (master.texture === 'picture' || mode === 'native') {
      return { kind: 'master' };
    }

    if (backdrop !== undefined) {
      notes.push(note(backdrop, 'picture', 'slide background texture'));
      return { kind: 'picture', node: backdrop };
    }

    return { kind: 'master' };
  }

  if (scene.background === null || samePaint(scene.background, master.paint)) {
    return { kind: 'master' };
  }

  return { kind: 'paint', paint: scene.background, grain: false };
}

/**
 * The detail the page gives the hint of the brand's grain layer (`collectScene` writes the same
 * text).
 */
export const GRAIN_DETAIL = 'background-image: grain texture';

/**
 * Whether a box paints a fill PowerPoint can draw with the brand's grain over it and nothing else
 * it cannot draw: the grain becomes a small tiled picture over the native fill.
 *
 * @param node - The box.
 */
export function hasGrainOnly(node: BoxNode): boolean {
  const paintHints = node.hints.filter((hint) => hint.scope === 'paint');
  return (
    node.fill !== null &&
    paintHints.length > 0 &&
    paintHints.every((hint) => hint.detail === GRAIN_DETAIL)
  );
}

/**
 * Whether a full-bleed box only paints a background, so the slide or master background replaces it.
 *
 * @param node - A full-bleed box.
 */
function isBackgroundBox(node: BoxNode): boolean {
  return node.borders.every((border) => border === null) && node.shadows.length === 0;
}

/**
 * The nodes rasterised with everything inside them: those with a subtree hint, outermost first.
 *
 * @param nodes - The scene's nodes.
 * @param byId - Finds parents.
 */
function subtreeRasterRoots(nodes: readonly SceneNode[], byId: ParentOf): Set<number> {
  const roots = new Set<number>();
  for (const node of nodes) {
    const hasSubtreeHint = node.hints.some((hint) => hint.scope === 'subtree');
    if (hasSubtreeHint && !isInside(node, roots, byId)) {
      roots.add(node.id);
    }
  }

  return roots;
}

/**
 * How each chart of a scene is drawn, and the names and alt text of chart plots drawn as pictures.
 */
type ChartPlans = {
  /**
   * The plan of each chart, by node id.
   */
  plans: ReadonlyMap<number, ChartPlan>;

  /**
   * The name and alt text of each chart plot SVG that is a picture, by SVG node id.
   */
  pictures: ReadonlyMap<number, { name: string; alt: string }>;
};

/**
 * Plans every chart of a scene (see `planChart`).
 *
 * @param scene - The scene.
 * @param mode - The export mode.
 */
function chartPlans(scene: SlideScene, mode: ExportMode): ChartPlans {
  const plans = new Map<number, ChartPlan>();
  const pictures = new Map<number, { name: string; alt: string }>();
  for (const node of scene.nodes) {
    if (node.kind !== 'chart' || mode === 'image') {
      continue;
    }

    const plan = planChart(node, scene, mode);
    plans.set(node.id, plan);
    const plot = plotSvg(node, scene);
    if (plan.model === null && plot !== null) {
      pictures.set(plot.id, {
        name: node.chart.name === '' ? `Chart ${node.id}` : `Chart: ${node.chart.name}`,
        alt: node.chart.summary || node.chart.name,
      });
    }
  }

  return { plans, pictures };
}

/**
 * The nodes a native chart or diagram replaces: a native chart's plot SVG, and everything inside a
 * described diagram.
 *
 * @param nodes - The scene's nodes.
 * @param byId - Finds parents.
 * @param charts - How each chart is drawn.
 */
function figureCoveredIds(
  nodes: readonly SceneNode[],
  byId: ParentOf,
  charts: ChartPlans,
): Set<number> {
  const plots = new Set(
    [...charts.plans.values()].flatMap((plan) =>
      plan.model === null || plan.plotId === null ? [] : [plan.plotId],
    ),
  );
  const diagrams = new Set(
    nodes
      .filter((node) => node.kind === 'diagram' && isDrawableDiagram(node.diagram))
      .map((node) => node.id),
  );
  const covered = new Set<number>();
  for (const node of nodes) {
    if (isInside(node, diagrams, byId)) {
      covered.add(node.id);
    } else if (plots.has(node.id)) {
      covered.add(node.id);
    }
  }

  return covered;
}

/**
 * Finds the parent of an element or node id.
 */
export type ParentOf = (id: number) => number | null;

/**
 * The parent lookup of a scene: the walk's element tree, then the nodes' own parent links.
 *
 * @param scene - The scene.
 */
export function parentLookup(scene: Pick<SlideScene, 'nodes' | 'tree'>): ParentOf {
  const nodes = new Map(scene.nodes.map((node) => [node.id, node]));
  return (id) => {
    const fromTree = scene.tree[String(id)];
    return fromTree === undefined ? (nodes.get(id)?.parent ?? null) : fromTree;
  };
}

/**
 * Whether a node is strictly inside one of the given nodes, following parent links.
 *
 * @param node - The node.
 * @param ids - The candidate ancestors.
 * @param byId - Finds parents.
 */
function isInside(node: SceneNode, ids: ReadonlySet<number>, byId: ParentOf): boolean {
  for (let parent = node.parent; parent !== null;) {
    if (ids.has(parent)) {
      return true;
    }

    parent = byId(parent);
  }

  return false;
}

/**
 * Whether two paints draw the same thing, within a rounding tolerance for colors.
 *
 * @param a - A paint.
 * @param b - Another paint.
 */
export function samePaint(a: ScenePaint, b: ScenePaint): boolean {
  if (a.kind === 'solid' && b.kind === 'solid') {
    return sameColor(a.color, b.color);
  }

  if (a.kind === 'linear' && b.kind === 'linear') {
    const sameStops =
      a.stops.length === b.stops.length &&
      a.stops.every((stop, index) => sameColor(stop.color, b.stops[index]?.color ?? ''));
    return sameStops && Math.abs(a.angle - b.angle) < SAME_ANGLE_TOLERANCE_DEG;
  }

  return false;
}

/**
 * Whether two hex colors are the same within {@link SAME_COLOR_TOLERANCE} per channel.
 *
 * @param a - `#rrggbb` or `#rrggbbaa`.
 * @param b - Another.
 */
function sameColor(a: string, b: string): boolean {
  /**
   * The four channels of a hex color; opaque when it has no alpha.
   */
  const channels = (hex: string): number[] => {
    const digits = hex.replace('#', '').padEnd(RGBA_HEX_DIGITS, 'f');
    return Array.from({ length: RGBA_CHANNELS }, (_channel, index) =>
      Number.parseInt(
        digits.slice(index * HEX_CHANNEL_DIGITS, (index + 1) * HEX_CHANNEL_DIGITS),
        16,
      ),
    );
  };
  const left = channels(a);
  const right = channels(b);
  return left.every(
    (value, index) => Math.abs(value - (right[index] ?? 0)) <= SAME_COLOR_TOLERANCE,
  );
}

/**
 * A note for a node.
 *
 * @param node - The node.
 * @param outcome - What happens to it.
 * @param why - Why.
 */
function note(node: SceneNode, outcome: PlanNote['outcome'], why: string): PlanNote {
  return { selector: node.selector, what: node.kind, outcome, why };
}

/**
 * The hint for an SVG that needs a picture.
 */
function svgHint(): RasterHint {
  return {
    reason: 'complex-svg',
    scope: 'subtree',
    detail: 'SVG with text, gradients, filters or masks',
  };
}
