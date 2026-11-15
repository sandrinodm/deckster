import type { LinkTarget } from '#pptx/text-xml.ts';
import type { SurfaceTheme } from '#pptx/theme.ts';
import type { BoxNode, SceneBorder, SceneRect, SceneShadow, VectorShape } from '#scene/scene.ts';
import type { PathCommand, Point } from '#vector/svg-path.ts';

import { el } from '#ooxml/xml.ts';
import { SVG_BLIP_EXTENSION, SVG_BLIP_NAMESPACE } from '#pptx/namespaces.ts';
import { colorXml, paintFill } from '#pptx/theme.ts';
import { degreesToDrawing, EMU_PER_PX, fractionToDrawing, pxToEmu } from '#units.ts';
import { pathBounds, readFormattedPath } from '#vector/svg-path.ts';

/**
 * The control distance of a cubic curve that approximates a quarter circle of radius 1.
 */
const KAPPA = 0.552_284_749_8;

/**
 * DrawingML's `roundRect` adjusts its corner radius as a share of the shorter side, up to half.
 */
const MAX_ROUND_RECT_ADJUST = 50_000;

/**
 * The full scale in DrawingML percentage units.
 */
const FULL_SCALE = 100_000;

/**
 * A box at most this thick, in canvas pixels, is a rule.
 */
const RULE_THICKNESS_PX = 8;

/**
 * Pixels per canvas pixel of a grain tile picture.
 */
const GRAIN_TILE_DENSITY = 1;

/**
 * EMU per pixel of a picture without a resolution, which PowerPoint reads at 96 dpi.
 */
const EMU_PER_IMAGE_PX = 9525;

/**
 * Radii closer than this many canvas pixels count as equal.
 */
const RADIUS_TOLERANCE_PX = 0.5;

/**
 * Degrees in a half turn, which turns radians into degrees.
 */
const HALF_TURN_DEGREES = 180;

/**
 * Degrees in a full turn, which a shadow's direction is kept within.
 */
const FULL_TURN_DEGREES = 360;

/**
 * The length of `#rrggbb`; a colour with an alpha byte is longer than this.
 */
const OPAQUE_HEX_LENGTH = 7;

/**
 * The largest value of one colour byte, which the alpha byte of `#rrggbbaa` is divided by.
 */
const MAX_COLOR_BYTE = 255;

/**
 * The smallest width or height, in canvas pixels, of a vector shape's box, so a straight line still
 * has a box to be drawn in.
 */
const MIN_VECTOR_BOX_PX = 0.01;

/**
 * The miter limit of a stroke join in DrawingML units, which are thousandths of a percent: 800 %.
 */
const MITER_LIMIT = 800_000;

/**
 * Hands out shape ids, unique within one slide; id 1 is the slide's shape tree.
 */
export type IdAllocator = () => number;

/**
 * A new id allocator starting after the shape tree's id.
 *
 * @returns The allocator.
 */
export function idAllocator(): IdAllocator {
  let next = 1;
  return () => {
    next += 1;
    return next;
  };
}

/**
 * `a:xfrm` for a rectangle in canvas pixels.
 *
 * @param rect - The rectangle.
 * @param tag - `a:xfrm`, or `p:xfrm` for a graphic frame.
 */
export function xfrm(rect: SceneRect, tag = 'a:xfrm'): string {
  return el(
    tag,
    {},
    el('a:off', { x: pxToEmu(rect.x), y: pxToEmu(rect.y) }),
    el('a:ext', { cx: Math.max(1, pxToEmu(rect.width)), cy: Math.max(1, pxToEmu(rect.height)) }),
  );
}

/**
 * The non-visual properties of a shape: id, name, description and a click link.
 *
 * @param id - The shape id.
 * @param name - The name the selection pane shows.
 * @param options - Alt text and a link.
 * @param options.descr - Alt text.
 * @param options.link - A click link.
 */
export function cNvPr(
  id: number,
  name: string,
  options: { descr?: string; link?: LinkTarget | null } = {},
): string {
  const link = options.link ?? null;
  return el(
    'p:cNvPr',
    { id, name, descr: options.descr === '' ? undefined : options.descr },
    link === null ? '' : el('a:hlinkClick', { 'r:id': link.id, action: link.action }),
  );
}

/**
 * The geometry of a box with corner radii: a rectangle, a rounded rectangle when the radii are
 * equal, or a custom path when they differ.
 *
 * @param rect - The box.
 * @param radii - Top-left, top-right, bottom-right and bottom-left radii.
 */
export function boxGeometry(rect: SceneRect, radii: readonly number[]): string {
  const [first = 0] = radii;
  const isUniform = radii.every((radius) => Math.abs(radius - first) < RADIUS_TOLERANCE_PX);
  if (isUniform && first <= RADIUS_TOLERANCE_PX) {
    return el('a:prstGeom', { prst: 'rect' }, el('a:avLst'));
  }

  if (isUniform) {
    const shorter = Math.max(1, Math.min(rect.width, rect.height));
    const adjust = Math.min(MAX_ROUND_RECT_ADJUST, Math.round((first / shorter) * FULL_SCALE));
    return el(
      'a:prstGeom',
      { prst: 'roundRect' },
      el('a:avLst', {}, el('a:gd', { name: 'adj', fmla: `val ${adjust}` })),
    );
  }

  return customGeometry(roundedRectPath({ ...rect, x: 0, y: 0 }, radii), rect, true);
}

/**
 * A rounded rectangle with one radius per corner, as path commands.
 *
 * @param rect - The rectangle.
 * @param radii - Top-left, top-right, bottom-right and bottom-left radii.
 */
export function roundedRectPath(rect: SceneRect, radii: readonly number[]): PathCommand[] {
  const limit = Math.min(rect.width, rect.height) / 2;
  const [tl = 0, tr = 0, br = 0, bl = 0] = radii.map((radius) => Math.min(radius, limit));
  const { x, y } = rect;
  const right = x + rect.width;
  const bottom = y + rect.height;
  /**
   * A straight edge to a corner and the curve around it.
   */
  const corner = (from: Point, control1: Point, control2: Point, to: Point): PathCommand[] => [
    { type: 'L', points: [from] },
    { type: 'C', points: [control1, control2, to] },
  ];
  return [
    { type: 'M', points: [{ x: x + tl, y }] },
    ...corner(
      { x: right - tr, y },
      { x: right - tr + tr * KAPPA, y },
      { x: right, y: y + tr - tr * KAPPA },
      { x: right, y: y + tr },
    ),
    ...corner(
      { x: right, y: bottom - br },
      { x: right, y: bottom - br + br * KAPPA },
      { x: right - br + br * KAPPA, y: bottom },
      { x: right - br, y: bottom },
    ),
    ...corner(
      { x: x + bl, y: bottom },
      { x: x + bl - bl * KAPPA, y: bottom },
      { x, y: bottom - bl + bl * KAPPA },
      { x, y: bottom - bl },
    ),
    ...corner(
      { x, y: y + tl },
      { x, y: y + tl - tl * KAPPA },
      { x: x + tl - tl * KAPPA, y },
      { x: x + tl, y },
    ),
    { type: 'Z', points: [] },
  ];
}

/**
 * `a:custGeom` for path commands in canvas pixels, relative to the shape's box.
 *
 * @param commands - The commands, in the same coordinates as `rect` (or relative to it when
 *   `relative`).
 * @param rect - The shape's box.
 * @param relative - Whether the commands are already relative to the box.
 * @param options - Whether the path is filled and stroked.
 * @param options.fill - Whether to fill it.
 * @param options.stroke - Whether to stroke it.
 */
export function customGeometry(
  commands: readonly PathCommand[],
  rect: SceneRect,
  relative = false,
  options: { fill?: boolean; stroke?: boolean } = {},
): string {
  const origin = relative ? { x: 0, y: 0 } : { x: rect.x, y: rect.y };
  const width = Math.max(1, pxToEmu(rect.width));
  const height = Math.max(1, pxToEmu(rect.height));
  const paths = subpathGroups(commands).map((group) =>
    el(
      'a:path',
      {
        w: width,
        h: height,
        fill: options.fill === false ? 'none' : undefined,
        stroke: options.stroke === false ? 0 : undefined,
      },
      ...group.map((command) => pathStep(command, origin)),
    ),
  );
  return el(
    'a:custGeom',
    {},
    el('a:avLst'),
    el('a:gdLst'),
    el('a:ahLst'),
    el('a:cxnLst'),
    el('a:rect', { l: 0, t: 0, r: 'r', b: 'b' }),
    el('a:pathLst', {}, ...paths),
  );
}

/**
 * One path command as a DrawingML path step, with its points in EMU relative to the shape's origin.
 *
 * @param command - The command.
 * @param origin - The shape's origin in canvas pixels.
 */
function pathStep(command: PathCommand, origin: Point): string {
  /**
   * A point relative to the shape's origin, in EMU.
   */
  const point = (value: Point): string =>
    el('a:pt', { x: pxToEmu(value.x - origin.x), y: pxToEmu(value.y - origin.y) });
  switch (command.type) {
    case 'M': {
      return el('a:moveTo', {}, point(command.points[0]));
    }

    case 'L': {
      return el('a:lnTo', {}, point(command.points[0]));
    }

    case 'C': {
      return el('a:cubicBezTo', {}, ...command.points.map(point));
    }

    case 'Z': {
      return el('a:close');
    }
  }
}

/**
 * How far two subpaths' boxes must overlap to count as overlapping, in canvas pixels: modules of a
 * QR code that only touch stay apart.
 */
const OVERLAP_EPSILON_PX = 0.001;

/**
 * Path commands split into groups of subpaths whose boxes overlap, in drawing order, each written
 * as its own `a:path`. Apple's Office renderer (Quick Look, Keynote) draws only the first subpath
 * of an `a:path`, so a QR code written as one path showed a single module. Subpaths that overlap
 * stay in one path, so a letter's counter still cuts its outline in PowerPoint and LibreOffice; the
 * groups do not overlap, so splitting them changes nothing for the fill rule.
 *
 * @param commands - Absolute commands.
 * @returns The groups; one group when nothing can be split.
 */
export function subpathGroups(commands: readonly PathCommand[]): PathCommand[][] {
  const subpaths = splitSubpaths(commands);
  if (subpaths.length <= 1) {
    return subpaths;
  }

  const parents = overlapParents(subpaths.map((subpath) => pathBounds(subpath)));
  const groups = new Map<number, PathCommand[]>();
  subpaths.forEach((subpath, index) => {
    const key = rootOf(parents, index);
    groups.set(key, [...(groups.get(key) ?? []), ...subpath]);
  });
  return [...groups.values()];
}

/**
 * Splits path commands at each move. A command that is not a move, and has no subpath to join yet,
 * starts one.
 *
 * @param commands - The commands.
 */
function splitSubpaths(commands: readonly PathCommand[]): PathCommand[][] {
  const subpaths: PathCommand[][] = [];
  for (const command of commands) {
    const current = subpaths.at(-1);
    if (command.type === 'M' || current === undefined) {
      subpaths.push([command]);
    } else {
      current.push(command);
    }
  }

  return subpaths;
}

/**
 * The union-find parents of subpaths whose boxes overlap. Each overlapping pair's groups are joined
 * with the higher-numbered group under the lower, so a group's root is its first subpath.
 *
 * @param boxes - Each subpath's box, or `null` when it has no points.
 */
function overlapParents(boxes: readonly (SceneRect | null)[]): number[] {
  const parents = boxes.map((_, index) => index);
  boxes.forEach((box, index) => {
    for (let other = 0; other < index; other += 1) {
      const otherBox = boxes[other];
      if (box !== null && otherBox != null && boxesOverlap(box, otherBox)) {
        const [low, high] = [rootOf(parents, other), rootOf(parents, index)].sort((a, b) => a - b);
        if (low !== undefined && high !== undefined) {
          parents[high] = low;
        }
      }
    }
  });
  return parents;
}

/**
 * The representative of a subpath's group: the subpath its parent chain ends at.
 *
 * @param parents - The union-find parents.
 * @param index - The subpath.
 */
function rootOf(parents: readonly number[], index: number): number {
  let at = index;
  while (parents[at] !== at) {
    at = parents[at] ?? at;
  }

  return at;
}

/**
 * Whether two boxes share more than an edge.
 *
 * @param a - A box.
 * @param b - Another.
 */
function boxesOverlap(a: SceneRect, b: SceneRect): boolean {
  return (
    a.x < b.x + b.width - OVERLAP_EPSILON_PX &&
    b.x < a.x + a.width - OVERLAP_EPSILON_PX &&
    a.y < b.y + b.height - OVERLAP_EPSILON_PX &&
    b.y < a.y + a.height - OVERLAP_EPSILON_PX
  );
}

/**
 * A painted box: its fill, a uniform border as the shape's outline (drawn inside the box, as CSS
 * does), its strongest shadow, and one thin rectangle per side for borders that differ by side.
 *
 * @param node - The box.
 * @param nextId - Allocates shape ids.
 * @param theme - The slide's surface theme.
 * @returns The shapes.
 */
export function boxXml(
  node: BoxNode,
  nextId: IdAllocator,
  theme: SurfaceTheme,
  grain: GrainFill | null = null,
): string {
  const uniform = uniformBorder(node.borders);
  const inset = uniform === null ? 0 : uniform.width / 2;
  const rect = {
    x: node.rect.x + inset,
    y: node.rect.y + inset,
    width: Math.max(0, node.rect.width - 2 * inset),
    height: Math.max(0, node.rect.height - 2 * inset),
  };
  const radii = node.radii.map((radius) => Math.max(0, radius - inset));
  const fill = node.fill === null ? el('a:noFill') : paintFill(node.fill, theme);
  const line = uniform === null ? el('a:ln', {}, el('a:noFill')) : lineXml(uniform, theme);
  const paintsMain = node.fill !== null || uniform !== null || node.shadows.length > 0;
  const main = paintsMain
    ? el(
        'p:sp',
        {},
        el('p:nvSpPr', {}, cNvPr(nextId(), boxName(node)), el('p:cNvSpPr'), el('p:nvPr')),
        el(
          'p:spPr',
          {},
          xfrm(rect),
          boxGeometry(rect, radii),
          fill,
          line,
          shadowXml(node.shadows, node.rect, theme),
        ),
      )
    : '';
  const grainShape =
    grain === null ? '' : grainXml(rect, nextId(), grain.imageId, grain.size, radii);
  const sides =
    uniform === null
      ? sideRects(node).map(([side, border]) => sideXml(side, border, nextId, theme))
      : [];
  return main + grainShape + sides.join('');
}

/**
 * The name the selection pane shows for a painted box, from its shape: a thin one is a rule, one
 * that covers the slide its background, others a panel.
 *
 * @param node - The box.
 */
export function boxName(node: BoxNode): string {
  if (node.fullBleed) {
    return 'Background';
  }

  return Math.min(node.rect.width, node.rect.height) <= RULE_THICKNESS_PX ? 'Rule' : 'Panel';
}

/**
 * The namespace of markup compatibility, for alternate content.
 */
const MC_NAMESPACE = 'http://schemas.openxmlformats.org/markup-compatibility/2006';

/**
 * The Office 2016 drawing namespace the background's alternate content choice requires. PowerPoint
 * understands it and takes the choice. Apple's renderer does not, and LibreOffice only takes
 * choices that require `a14`, `p14`, `p15`, `x12ac` or `v`, so both take the fallback.
 */
const A16_NAMESPACE = 'http://schemas.microsoft.com/office/drawing/2014/main';

/**
 * A picture of a gradient background for renderers that draw multi-stop gradients wrongly or not at
 * all, as alternate content whose choice, which PowerPoint takes, draws nothing over the native
 * gradient. Apple's Office renderer (Quick Look, Keynote) has no multi-stop gradients, and
 * LibreOffice before 7.6 keeps two of the stops (the brand's three-stop dusk loses its dark
 * corner), so both draw the picture.
 *
 * @param rect - The slide's box.
 * @param id - The shape id.
 * @param imageId - The relationship id of the picture.
 */
export function backdropFallbackXml(rect: SceneRect, id: number, imageId: string): string {
  const empty = el(
    'p:sp',
    {},
    el(
      'p:nvSpPr',
      {},
      cNvPr(id, 'Background'),
      el('p:cNvSpPr', {}, el('a:spLocks', { noGrp: 1, noSelect: 1 })),
      el('p:nvPr', { userDrawn: 1 }),
    ),
    el(
      'p:spPr',
      {},
      xfrm({ ...rect, width: 1, height: 1 }),
      el('a:prstGeom', { prst: 'rect' }, el('a:avLst')),
      el('a:noFill'),
      el('a:ln', {}, el('a:noFill')),
    ),
  );
  const picture = pictureXml(rect, id, {
    imageId,
    name: 'Background',
    descr: 'Background gradient',
  });
  return el(
    'mc:AlternateContent',
    { 'xmlns:mc': MC_NAMESPACE },
    el('mc:Choice', { 'xmlns:a16': A16_NAMESPACE, Requires: 'a16' }, empty),
    el('mc:Fallback', {}, picture),
  );
}

/**
 * The brand's grain tiled over a native fill: its tile picture's relationship and size.
 */
export type GrainFill = {
  /**
   * The relationship id of the tile picture.
   */
  imageId: string;

  /**
   * The tile's size in canvas pixels.
   */
  size: number;
};

/**
 * A shape tiled with the brand's grain, over a native fill: a small transparent picture repeated at
 * the size the browser repeats it.
 *
 * @param rect - The area.
 * @param id - The shape id.
 * @param imageId - The relationship id of the tile (one pixel per canvas pixel).
 * @param size - The tile's size in canvas pixels.
 * @param radii - The area's corner radii.
 */
export function grainXml(
  rect: SceneRect,
  id: number,
  imageId: string,
  size: number,
  radii: readonly number[] = [0, 0, 0, 0],
): string {
  const tilePixels = size * GRAIN_TILE_DENSITY;
  const scale = Math.round(((size * EMU_PER_PX) / (tilePixels * EMU_PER_IMAGE_PX)) * FULL_SCALE);
  return el(
    'p:sp',
    {},
    el(
      'p:nvSpPr',
      {},
      cNvPr(id, 'Grain', { descr: 'Background texture' }),
      el('p:cNvSpPr', {}, el('a:spLocks', { noGrp: 1, noSelect: 1 })),
      el('p:nvPr', { userDrawn: 1 }),
    ),
    el(
      'p:spPr',
      {},
      xfrm(rect),
      boxGeometry(rect, radii),
      el(
        'a:blipFill',
        { dpi: 0, rotWithShape: 1 },
        el('a:blip', { 'r:embed': imageId }),
        el('a:srcRect'),
        el('a:tile', { tx: 0, ty: 0, sx: scale, sy: scale, flip: 'none', algn: 'tl' }),
      ),
      el('a:ln', {}, el('a:noFill')),
    ),
  );
}

/**
 * The border all four sides share, or `null` when they differ or there is none.
 *
 * @param borders - Top, right, bottom and left.
 */
function uniformBorder(borders: BoxNode['borders']): SceneBorder | null {
  const [first] = borders;
  if (first === null || first === undefined) {
    return null;
  }

  const same = borders.every(
    (border) =>
      border !== null &&
      border.width === first.width &&
      border.color === first.color &&
      border.style === first.style,
  );
  return same ? first : null;
}

/**
 * The rectangle each painted side of a box with uneven borders occupies.
 *
 * @param node - The box.
 */
function sideRects(node: BoxNode): [SceneRect, SceneBorder][] {
  const { x, y, width, height } = node.rect;
  const [top, right, bottom, left] = node.borders;
  const result: [SceneRect, SceneBorder][] = [];
  if (top !== null) {
    result.push([{ x, y, width, height: top.width }, top]);
  }

  if (right !== null) {
    result.push([{ x: x + width - right.width, y, width: right.width, height }, right]);
  }

  if (bottom !== null) {
    result.push([{ x, y: y + height - bottom.width, width, height: bottom.width }, bottom]);
  }

  if (left !== null) {
    result.push([{ x, y, width: left.width, height }, left]);
  }

  return result;
}

/**
 * One side of a border as a filled rectangle.
 *
 * @param rect - Where the side is.
 * @param border - The side.
 * @param nextId - Allocates shape ids.
 * @param theme - The slide's surface theme.
 */
function sideXml(
  rect: SceneRect,
  border: SceneBorder,
  nextId: IdAllocator,
  theme: SurfaceTheme,
): string {
  return el(
    'p:sp',
    {},
    el('p:nvSpPr', {}, cNvPr(nextId(), 'Border'), el('p:cNvSpPr'), el('p:nvPr')),
    el(
      'p:spPr',
      {},
      xfrm(rect),
      el('a:prstGeom', { prst: 'rect' }, el('a:avLst')),
      el('a:solidFill', {}, colorXml(border.color, theme)),
      el('a:ln', {}, el('a:noFill')),
    ),
  );
}

/**
 * An outline.
 *
 * @param border - Its width, color and style.
 * @param theme - The slide's surface theme.
 */
export function lineXml(border: SceneBorder, theme: SurfaceTheme | null): string {
  const dash = { solid: 'solid', dashed: 'dash', dotted: 'sysDot' }[border.style];
  return el(
    'a:ln',
    { w: pxToEmu(border.width) },
    el('a:solidFill', {}, colorXml(border.color, theme)),
    el('a:prstDash', { val: dash }),
  );
}

/**
 * `a:effectLst` with the most visible shadow layer: PowerPoint draws one outer shadow per shape.
 * Spread becomes a scale of the shadow.
 *
 * @param shadows - The `box-shadow` layers.
 * @param rect - The box, for the spread scale.
 * @param theme - The slide's surface theme.
 */
export function shadowXml(
  shadows: readonly SceneShadow[],
  rect: SceneRect,
  theme: SurfaceTheme | null,
): string {
  const strongest = [...shadows].sort((a, b) => weight(b) - weight(a))[0];
  if (strongest === undefined) {
    return '';
  }

  return strongest.inset
    ? innerShadowXml(strongest, theme)
    : outerShadowXml(strongest, rect, theme);
}

/**
 * An inset shadow layer as `a:innerShdw`.
 *
 * @param shadow - The layer.
 * @param theme - The slide's surface theme.
 */
function innerShadowXml(shadow: SceneShadow, theme: SurfaceTheme | null): string {
  return el(
    'a:effectLst',
    {},
    el(
      'a:innerShdw',
      {
        blurRad: pxToEmu(shadow.blur),
        dist: pxToEmu(Math.hypot(shadow.x, shadow.y)),
        dir: shadowDirection(shadow),
      },
      colorXml(shadow.color, theme),
    ),
  );
}

/**
 * An outer shadow layer as `a:outerShdw`, its spread scaled into the box.
 *
 * @param shadow - The layer.
 * @param rect - The box the shadow belongs to.
 * @param theme - The slide's surface theme.
 */
function outerShadowXml(shadow: SceneShadow, rect: SceneRect, theme: SurfaceTheme | null): string {
  const scaleX = Math.max(0, (rect.width + 2 * shadow.spread) / Math.max(1, rect.width));
  const scaleY = Math.max(0, (rect.height + 2 * shadow.spread) / Math.max(1, rect.height));
  return el(
    'a:effectLst',
    {},
    el(
      'a:outerShdw',
      {
        blurRad: pxToEmu(shadow.blur),
        dist: pxToEmu(Math.hypot(shadow.x, shadow.y)),
        dir: shadowDirection(shadow),
        sx: Math.round(scaleX * FULL_SCALE),
        sy: Math.round(scaleY * FULL_SCALE),
        algn: 'ctr',
        rotWithShape: 0,
      },
      colorXml(shadow.color, theme),
    ),
  );
}

/**
 * A shadow's direction as a DrawingML angle, kept within one turn.
 *
 * @param shadow - The layer.
 */
function shadowDirection(shadow: SceneShadow): number {
  const degrees = (Math.atan2(shadow.y, shadow.x) * HALF_TURN_DEGREES) / Math.PI;
  return degreesToDrawing((degrees + FULL_TURN_DEGREES) % FULL_TURN_DEGREES);
}

/**
 * How visible a shadow layer is, to pick one.
 *
 * @param shadow - A layer.
 */
function weight(shadow: SceneShadow): number {
  const alpha =
    shadow.color.length > OPAQUE_HEX_LENGTH
      ? Number.parseInt(shadow.color.slice(OPAQUE_HEX_LENGTH), 16) / MAX_COLOR_BYTE
      : 1;
  return alpha * (shadow.blur + Math.abs(shadow.y) + shadow.spread);
}

/**
 * What a picture shows and how.
 */
export type PictureOptions = {
  /**
   * The relationship id of the PNG, JPEG or GIF.
   */
  imageId: string;

  /**
   * The relationship id of the SVG original, for PowerPoint versions that draw SVG.
   */
  svgId?: string;

  /**
   * The name the selection pane shows.
   */
  name: string;

  /**
   * Alt text.
   */
  descr: string;

  /**
   * Fractions cut off each side.
   */
  crop?: { left: number; top: number; right: number; bottom: number };

  /**
   * Corner radii in canvas pixels.
   */
  radii?: readonly number[];

  /**
   * How opaque it is drawn, 0 to 1; left out or 1 draws it as it is.
   */
  opacity?: number;

  /**
   * Whether it cannot be selected, moved or resized, as a slide's background layers are.
   */
  locked?: boolean;

  /**
   * Whether PowerPoint draws it in grayscale.
   */
  grayscale?: boolean;

  /**
   * A click link.
   */
  link?: LinkTarget | null;

  /**
   * Extra `p:nvPr` content, such as a video file reference.
   */
  nvPr?: string;
};

/**
 * A picture.
 *
 * @param rect - Where it goes.
 * @param id - The shape id.
 * @param options - What it shows and how.
 */
export function pictureXml(rect: SceneRect, id: number, options: PictureOptions): string {
  return el(
    'p:pic',
    {},
    el(
      'p:nvPicPr',
      {},
      cNvPr(id, options.name, { descr: options.descr, link: options.link ?? null }),
      el('p:cNvPicPr', {}, el('a:picLocks', pictureLocks(options.locked === true))),
      el('p:nvPr', {}, options.nvPr ?? ''),
    ),
    el(
      'p:blipFill',
      {},
      el(
        'a:blip',
        { 'r:embed': options.imageId },
        opacityXml(options.opacity),
        options.grayscale === true ? el('a:grayscl') : '',
        svgBlipXml(options.svgId),
      ),
      cropXml(options.crop),
      el('a:stretch', {}, el('a:fillRect')),
    ),
    el('p:spPr', {}, xfrm(rect), boxGeometry(rect, options.radii ?? [0, 0, 0, 0])),
  );
}

/**
 * A picture's locks: its aspect ratio always, and for a background layer selection, moving and
 * resizing too, so it stays behind the slide's content as a background does.
 *
 * @param locked - Whether the picture is a background layer.
 */
function pictureLocks(locked: boolean): Record<string, number> {
  return locked
    ? { noGrp: 1, noSelect: 1, noRot: 1, noChangeAspect: 1, noMove: 1, noResize: 1 }
    : { noChangeAspect: 1 };
}

/**
 * The `a:alphaModFix` that draws a picture at an opacity, or nothing when it is opaque.
 *
 * @param opacity - From 0 to 1, if set.
 */
function opacityXml(opacity: number | undefined): string {
  return opacity === undefined || opacity >= 1
    ? ''
    : el('a:alphaModFix', { amt: fractionToDrawing(opacity) });
}

/**
 * The extension that points a picture at its SVG original, for PowerPoint versions that draw SVG.
 *
 * @param svgId - The SVG's relationship id, when the picture has one.
 */
function svgBlipXml(svgId: string | undefined): string {
  if (svgId === undefined) {
    return '';
  }

  return el(
    'a:extLst',
    {},
    el(
      'a:ext',
      { uri: SVG_BLIP_EXTENSION },
      el('asvg:svgBlip', { 'xmlns:asvg': SVG_BLIP_NAMESPACE, 'r:embed': svgId }),
    ),
  );
}

/**
 * The `a:srcRect` of a cropped picture, or nothing when no side is cut.
 *
 * @param crop - The fractions cut off each side.
 */
function cropXml(crop: PictureOptions['crop']): string {
  if (crop === undefined) {
    return '';
  }

  const cropped = crop.left > 0 || crop.top > 0 || crop.right > 0 || crop.bottom > 0;
  if (!cropped) {
    return '';
  }

  return el('a:srcRect', {
    l: fractionToDrawing(crop.left) || undefined,
    t: fractionToDrawing(crop.top) || undefined,
    r: fractionToDrawing(crop.right) || undefined,
    b: fractionToDrawing(crop.bottom) || undefined,
  });
}

/**
 * An invisible rectangle that opens a link when clicked, over a picture that contains the link.
 *
 * @param rect - The link's area.
 * @param id - The shape id.
 * @param link - The link.
 */
export function hotspotXml(rect: SceneRect, id: number, link: LinkTarget): string {
  return el(
    'p:sp',
    {},
    el('p:nvSpPr', {}, cNvPr(id, 'Link', { link }), el('p:cNvSpPr'), el('p:nvPr')),
    el(
      'p:spPr',
      {},
      xfrm(rect),
      el('a:prstGeom', { prst: 'rect' }, el('a:avLst')),
      el('a:noFill'),
      el('a:ln', {}, el('a:noFill')),
    ),
  );
}

/**
 * The shapes of an inline SVG as one group of custom-geometry shapes, each in its own box.
 *
 * @param shapes - The shapes in canvas pixels.
 * @param _rect - The SVG's box (unused: the shapes stay flat).
 * @param name - The group's name.
 * @param nextId - Allocates shape ids.
 * @param theme - The slide's surface theme.
 * @param link - A click link for every shape, if the SVG is inside a link.
 */
export function vectorGroupXml(
  shapes: readonly VectorShape[],
  _rect: SceneRect,
  name: string,
  nextId: IdAllocator,
  theme: SurfaceTheme,
  link: LinkTarget | null,
): string {
  const children = shapes.flatMap((shape) => {
    const markup = vectorShapeXml(shape, name, nextId, theme, link);
    return markup === null ? [] : [markup];
  });
  // Apple's Office renderer (Quick Look, Keynote) draws no custom geometry inside a group, so the
  // shapes stay flat on the slide.
  return children.join('');
}

/**
 * One inline SVG shape as a custom-geometry shape in its own box.
 *
 * @param shape - The shape in canvas pixels.
 * @param name - The shape's name.
 * @param nextId - Allocates shape ids.
 * @param theme - The slide's surface theme.
 * @param link - A click link, if the SVG is inside a link.
 * @returns The shape's markup, or `null` when the shape has no points.
 */
function vectorShapeXml(
  shape: VectorShape,
  name: string,
  nextId: IdAllocator,
  theme: SurfaceTheme,
  link: LinkTarget | null,
): string | null {
  const commands = readFormattedPath(shape.path);
  const bounds = pathBounds(commands);
  if (bounds === null) {
    return null;
  }

  const box = {
    ...bounds,
    width: Math.max(bounds.width, MIN_VECTOR_BOX_PX),
    height: Math.max(bounds.height, MIN_VECTOR_BOX_PX),
  };
  const fill =
    shape.fill === null ? el('a:noFill') : el('a:solidFill', {}, colorXml(shape.fill, theme));
  return el(
    'p:sp',
    {},
    el('p:nvSpPr', {}, cNvPr(nextId(), name, { link }), el('p:cNvSpPr'), el('p:nvPr')),
    el(
      'p:spPr',
      {},
      xfrm(box),
      customGeometry(commands, box, false, { fill: shape.fill !== null }),
      fill,
      vectorLineXml(shape, theme),
    ),
  );
}

/**
 * The outline of an inline SVG shape: none when it has no stroke or a zero width.
 *
 * @param shape - The shape.
 * @param theme - The slide's surface theme.
 */
function vectorLineXml(shape: VectorShape, theme: SurfaceTheme): string {
  if (shape.stroke === null || shape.strokeWidth === 0) {
    return el('a:ln', {}, el('a:noFill'));
  }

  return el(
    'a:ln',
    {
      w: pxToEmu(shape.strokeWidth),
      cap: { butt: 'flat', round: 'rnd', square: 'sq' }[shape.cap],
    },
    el('a:solidFill', {}, colorXml(shape.stroke, theme)),
    el('a:prstDash', { val: 'solid' }),
    { miter: el('a:miter', { lim: MITER_LIMIT }), round: el('a:round'), bevel: el('a:bevel') }[
      shape.join
    ],
  );
}

/**
 * A group of shapes whose child coordinates equal slide coordinates.
 *
 * @param children - The shapes' markup.
 * @param rect - The group's box.
 * @param name - The group's name.
 * @param nextId - Allocates shape ids.
 */
export function groupXml(
  children: readonly string[],
  rect: SceneRect,
  name: string,
  nextId: IdAllocator,
): string {
  const off = el('a:off', { x: pxToEmu(rect.x), y: pxToEmu(rect.y) });
  const ext = el('a:ext', {
    cx: Math.max(1, pxToEmu(rect.width)),
    cy: Math.max(1, pxToEmu(rect.height)),
  });
  const chOff = el('a:chOff', { x: pxToEmu(rect.x), y: pxToEmu(rect.y) });
  const chExt = el('a:chExt', {
    cx: Math.max(1, pxToEmu(rect.width)),
    cy: Math.max(1, pxToEmu(rect.height)),
  });
  return el(
    'p:grpSp',
    {},
    el('p:nvGrpSpPr', {}, cNvPr(nextId(), name), el('p:cNvGrpSpPr'), el('p:nvPr')),
    el('p:grpSpPr', {}, el('a:xfrm', {}, off, ext, chOff, chExt)),
    ...children,
  );
}
