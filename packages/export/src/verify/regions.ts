import type { ScenePlan } from '#plan/plan-scene.ts';
import type { SceneNode, SceneParagraph, SceneRect, SlideScene, TextNode } from '#scene/scene.ts';

import { groupText } from '#plan/group-text.ts';
import { linePitch } from '#pptx/text-xml.ts';
import { maxOf, minOf } from '#units.ts';

/**
 * What a region of a slide holds.
 */
export type RegionKind = 'text' | 'chart' | 'diagram' | 'picture' | 'image' | 'table' | 'media';

/**
 * A part of a slide the verifier finds in a rendered picture and compares with the web: a text
 * block, a chart, a diagram, a picture or a table, where the web drew it.
 */
export type VerifyRegion = {
  /**
   * A short id, unique on the slide, such as `r4`.
   */
  id: string;

  /**
   * What it holds.
   */
  kind: RegionKind;

  /**
   * A name for reports, from its role and content, such as `text "Revenue grew 18%…"`.
   */
  label: string;

  /**
   * Where the web drew it, in canvas pixels; for text, the box of its lines' glyphs.
   */
  rect: SceneRect;

  /**
   * For text, the number of lines the web set; else `null`.
   */
  lines: number | null;

  /**
   * For text, the distance between baselines in canvas pixels; else `null`.
   */
  linePitch: number | null;

  /**
   * How far from its web position the region is searched for, in canvas pixels.
   */
  margin: number;

  /**
   * How far the content may grow past its web box on each side before it meets other content, in
   * canvas pixels: a line more, a wider line.
   */
  extend: { x: number; y: number };

  /**
   * Which edge stays put when the content changes width: text keeps its alignment edge, figures
   * their centre.
   */
  anchor: 'left' | 'center' | 'right';
};

/**
 * Where a region landed in a rendered picture, as measured by the comparison page; canvas pixels.
 */
export type RegionMeasurement = {
  /**
   * The region's id.
   */
  id: string;

  /**
   * Whether the web picture has (almost) nothing drawn in the region, so it cannot be compared.
   */
  blank: boolean;

  /**
   * The share of the web region's edges found at the best offset in the render, 0 to 1.
   */
  match: number;

  /**
   * The offset at which the region's content matches best: render minus web.
   */
  offset: { x: number; y: number };

  /**
   * The box of the drawn content in the web picture, or `null` when blank.
   */
  reference: SceneRect | null;

  /**
   * The box of the drawn content in the render around the shifted region, or `null` when the render
   * draws nothing there.
   */
  candidate: SceneRect | null;

  /**
   * Edge pixels of the web region (at the comparison scale).
   */
  referenceInk: number;

  /**
   * Edge pixels of the render in the shifted region.
   */
  candidateInk: number;
};

/**
 * What the verifier concluded about one region in one render.
 */
export type RegionVerdict = {
  /**
   * The region's id.
   */
  id: string;

  /**
   * What it holds.
   */
  kind: RegionKind;

  /**
   * Its name for reports.
   */
  label: string;

  /**
   * Where the web drew it.
   */
  rect: SceneRect;

  /**
   * For text, the lines the web set; else `null`.
   */
  lines: number | null;

  /**
   * For text, the lines the render appears to set (estimated from the height of its ink and the
   * line pitch); else `null`.
   */
  renderedLines: number | null;

  /**
   * The share of the web region's edges found in the render, 0 to 1.
   */
  match: number;

  /**
   * The render's offset from the web position, in canvas pixels.
   */
  offset: { x: number; y: number };

  /**
   * The render's content width relative to the web's, such as `0.06` for 6% wider.
   */
  widthChange: number;

  /**
   * The render's content height relative to the web's.
   */
  heightChange: number;

  /**
   * For text, how far other content reaches into the block from above in the render, in canvas
   * pixels (0 when nothing does): the block above has grown into it.
   */
  overlapAbove: number;

  /**
   * What differs, as short phrases such as `3 lines vs 2` or `shifted 14px down`; empty when the
   * web and the render agree.
   */
  problems: string[];

  /**
   * How bad the worst problem is, 0 (passes) to about 1 (missing), for ordering.
   */
  severity: number;
};

/**
 * One difference a verdict reports, with how bad it is.
 */
type Problem = {
  /**
   * The short phrase the report shows.
   */
  text: string;

  /**
   * How bad it is, 0 to about 1, for ordering.
   */
  severity: number;
};

/**
 * The canvas size every slide is laid out on.
 */
const CANVAS = {
  /**
   * The width in canvas pixels.
   */
  width: 1920,

  /**
   * The height in canvas pixels.
   */
  height: 1080,
} as const;

/**
 * The thresholds a region is judged by.
 */
export const REGION_THRESHOLDS = {
  /**
   * A shift is flagged beyond this share of the slide (2%), or of the region when that is smaller.
   */
  slideShift: 0.02,

  /**
   * The share of the region's own size a shift may reach when that is less than the slide share.
   */
  regionShift: 0.05,

  /**
   * Shifts up to this many canvas pixels always pass (anti-aliasing and rounding).
   */
  minShiftPx: 6,

  /**
   * A width or height change beyond this share of the web's is flagged.
   */
  sizeChange: 0.04,

  /**
   * Size changes up to this many canvas pixels always pass.
   */
  minSizePx: 6,

  /**
   * A text block whose ink grows or shrinks by this share of a line pitch has gained or lost a
   * line.
   */
  lineShare: 0.6,

  /**
   * Below this share of matching edges a chart, diagram, picture or table is drawn differently.
   */
  figureMatch: 0.55,

  /**
   * Below this share of matching edges text is set differently (another face or wrapping).
   */
  textMatch: 0.2,

  /**
   * Below this share of the web's edges the region counts as missing in the render.
   */
  missingInk: 0.2,
} as const;

/**
 * How bad each kind of difference is, on the 0 to 1 scale of a verdict's severity.
 */
const SEVERITY = {
  /**
   * A region with nothing drawn in the render.
   */
  missing: 1,

  /**
   * Content from above drawn into a text block.
   */
  overlap: 0.55,

  /**
   * A text block that sets a different number of lines: the base, before each line it is off by.
   */
  lineCountBase: 0.6,

  /**
   * The extra severity for each line a text block is off by.
   */
  lineCountStep: 0.1,

  /**
   * A shift: the base, plus the shift in pixels divided by `shiftPerPx`, capped.
   */
  shiftBase: 0.15,

  /**
   * How many pixels of shift add a full unit of severity.
   */
  shiftPerPx: 200,

  /**
   * The most a shift adds to the severity.
   */
  shiftMax: 0.5,

  /**
   * A size change: the base, plus the change as a share, capped.
   */
  sizeBase: 0.1,

  /**
   * The most a size change adds to the severity.
   */
  sizeMax: 0.55,

  /**
   * Drawn differently: the base, plus the shortfall below the floor times `drawnPerShare`.
   */
  drawnBase: 0.3,

  /**
   * How much each share of edges below the floor adds to the severity.
   */
  drawnPerShare: 0.5,

  /**
   * The severity a region that another block runs into has at least.
   */
  blameFloor: 0.6,

  /**
   * What each further problem of a region adds to its severity.
   */
  extraProblem: 0.05,
} as const;

/**
 * The smallest region compared, in canvas pixels per side.
 */
const MIN_REGION_PX = 8;

/**
 * Characters of a text region's content its label shows.
 */
const LABEL_CHARACTERS = 36;

/**
 * How far a text block may grow sideways, in canvas pixels at least, and as a share of its width.
 */
const TEXT_EXTEND_X_MIN_PX = 24;

/**
 * The share of a text block's width it may grow sideways by.
 */
const TEXT_EXTEND_X_SHARE = 0.25;

/**
 * How far a text block may grow downwards or upwards, in canvas pixels at least.
 */
const TEXT_EXTEND_Y_MIN_PX = 12;

/**
 * How many line pitches a text block may grow vertically by.
 */
const TEXT_EXTEND_Y_PITCHES = 1.5;

/**
 * How far a chart, diagram, picture or table may grow on each side, in canvas pixels at least.
 */
const FIGURE_EXTEND_MIN_PX = 12;

/**
 * The share of a figure's size it may grow on each side by.
 */
const FIGURE_EXTEND_SHARE = 0.1;

/**
 * The smallest search margin around a region, in canvas pixels.
 */
const SEARCH_MARGIN_MIN_PX = 24;

/**
 * The largest search margin around a region, in canvas pixels.
 */
const SEARCH_MARGIN_MAX_PX = 96;

/**
 * The share of a region's smaller side added to its search margin.
 */
const SEARCH_MARGIN_SHARE = 0.3;

/**
 * The fixed part added to a region's search margin, in canvas pixels.
 */
const SEARCH_MARGIN_PAD_PX = 24;

/**
 * How far past the reference's ink top an overlap may fall before it is ignored, in canvas pixels.
 */
const OVERLAP_SLACK_PX = 4;

/**
 * The scale that rounds a share to three decimal places.
 */
const ROUND_SCALE = 1000;

/**
 * Multiplies a share into percent.
 */
const PERCENT = 100;

/**
 * A run of white space, collapsed when text is put on one line.
 */
const WHITESPACE_RUN = /\s+/g;

/**
 * The separator between the parts of a CSS selector.
 */
const SELECTOR_SEPARATOR = /\s*>\s*/;

/**
 * The regions of a slide to find in a render: every native text frame as the writer groups it,
 * every chart, diagram, table, image and video, and every element drawn as a picture. Nodes inside
 * a picture are covered by it.
 *
 * @param scene - The slide's scene.
 * @param plan - What the writer draws, and how.
 * @returns The regions, in paint order.
 */
export function slideRegions(
  scene: Pick<SlideScene, 'canvas'>,
  plan: Pick<ScenePlan, 'items'>,
): VerifyRegion[] {
  const canvas = scene.canvas.width > 0 ? scene.canvas : CANVAS;
  const regions: VerifyRegion[] = [];
  for (const item of groupText(plan.items)) {
    const region =
      item.kind === 'picture'
        ? figureRegion(item.node, 'picture', `picture ${describeNode(item.node)}`)
        : nativeRegion(item.node);
    if (region === null) {
      continue;
    }

    const rect = clip(region.rect, canvas);
    if (rect.width < MIN_REGION_PX || rect.height < MIN_REGION_PX) {
      continue;
    }

    regions.push({ ...region, rect, id: `r${regions.length + 1}` });
  }

  return regions;
}

/**
 * The region of a natively drawn node, or `null` for nodes the verifier does not compare (boxes).
 *
 * @param node - The node.
 */
function nativeRegion(node: SceneNode): VerifyRegion | null {
  switch (node.kind) {
    case 'text': {
      return textRegion(node);
    }

    case 'chart': {
      return figureRegion(node, 'chart', `chart "${shorten(node.chart.name)}"`);
    }

    case 'diagram': {
      return figureRegion(node, 'diagram', `diagram ${describeNode(node)}`);
    }

    case 'image': {
      return figureRegion(
        node,
        'image',
        node.alt === '' ? `image ${describeNode(node)}` : `image "${shorten(node.alt)}"`,
      );
    }

    case 'table': {
      return figureRegion(node, 'table', `table, ${node.rows.length} rows`);
    }

    case 'media': {
      return figureRegion(node, 'media', `${node.media} poster`);
    }

    case 'box':
    case 'svg': {
      return null;
    }
  }
}

/**
 * The region of a text frame: the box of its glyphs, its line count and pitch.
 *
 * @param node - The frame.
 */
function textRegion(node: TextNode): VerifyRegion | null {
  const lines = node.paragraphs.flatMap((paragraph) => paragraph.lines);
  const text = node.paragraphs
    .map((paragraph) =>
      paragraph.lines.map((line) => line.runs.map((run) => run.text).join('')).join(' '),
    )
    .join(' ')
    .replace(WHITESPACE_RUN, ' ')
    .trim();
  if (lines.length === 0 || text === '') {
    return null;
  }

  const left = minOf(lines.map((line) => line.left));
  const right = maxOf(lines.map((line) => line.right));
  const top = minOf(lines.map((line) => line.baseline - line.ascent));
  const bottom = maxOf(lines.map((line) => line.baseline + line.descent));
  const rect = { x: left, y: top, width: right - left, height: bottom - top };
  const pitch = median(node.paragraphs.map((paragraph) => pitchOf(paragraph)));
  return {
    id: '',
    kind: 'text',
    label: `text "${shorten(text)}"`,
    rect,
    lines: lines.length,
    linePitch: pitch,
    margin: searchMargin(rect),
    extend: {
      x: Math.max(TEXT_EXTEND_X_MIN_PX, rect.width * TEXT_EXTEND_X_SHARE),
      y: Math.max(TEXT_EXTEND_Y_MIN_PX, pitch * TEXT_EXTEND_Y_PITCHES),
    },
    anchor: anchorOf(node.paragraphs[0]),
  };
}

/**
 * The region of a chart, diagram, picture, table or video.
 *
 * @param node - The node.
 * @param kind - What it holds.
 * @param label - Its name.
 */
function figureRegion(node: SceneNode, kind: RegionKind, label: string): VerifyRegion {
  return {
    id: '',
    kind,
    label,
    rect: node.rect,
    lines: null,
    linePitch: null,
    margin: searchMargin(node.rect),
    extend: {
      x: Math.max(FIGURE_EXTEND_MIN_PX, node.rect.width * FIGURE_EXTEND_SHARE),
      y: Math.max(FIGURE_EXTEND_MIN_PX, node.rect.height * FIGURE_EXTEND_SHARE),
    },
    anchor: 'center',
  };
}

/**
 * The edge a paragraph's lines hang from.
 *
 * @param paragraph - The paragraph.
 */
function anchorOf(paragraph: SceneParagraph | undefined): VerifyRegion['anchor'] {
  if (paragraph?.align === 'center' || paragraph?.align === 'right') {
    return paragraph.align;
  }

  return 'left';
}

/**
 * How far around its web position a region is searched: a share of its smaller side plus a fixed
 * pad, kept between the smallest and largest margin.
 *
 * @param rect - The region.
 */
function searchMargin(rect: SceneRect): number {
  const grown = Math.min(rect.width, rect.height) * SEARCH_MARGIN_SHARE + SEARCH_MARGIN_PAD_PX;
  return Math.round(Math.min(SEARCH_MARGIN_MAX_PX, Math.max(SEARCH_MARGIN_MIN_PX, grown)));
}

/**
 * The line pitch of a paragraph, never below 1.
 *
 * @param paragraph - The paragraph.
 */
function pitchOf(paragraph: SceneParagraph): number {
  return Math.max(1, linePitch(paragraph));
}

/**
 * Judges one region of one render: is it there, where the web drew it, the same size, with the same
 * number of lines, drawn the same?
 *
 * @param region - The region.
 * @param measurement - Where the comparison page found it.
 * @returns The verdict; `problems` is empty when the region passes.
 */
export function judgeRegion(region: VerifyRegion, measurement: RegionMeasurement): RegionVerdict {
  const verdict = initialVerdict(region, measurement);
  const { reference, candidate } = measurement;
  if (measurement.blank || reference === null) {
    return verdict;
  }

  if (
    candidate === null ||
    measurement.candidateInk < measurement.referenceInk * REGION_THRESHOLDS.missingInk
  ) {
    return {
      ...verdict,
      renderedLines: region.lines === null ? null : 0,
      problems: ['missing in the render'],
      severity: SEVERITY.missing,
    };
  }

  const lines =
    region.kind === 'text' && region.linePitch !== null && region.lines !== null
      ? judgeTextLines(region.lines, region.linePitch, reference, candidate, measurement.offset.y)
      : null;
  const heightProblem =
    lines === null
      ? sizeProblem(candidate.height - reference.height, reference.height, 'taller', 'shorter')
      : null;
  const problems: Problem[] = [
    ...shiftProblems(region, verdict.offset),
    ...optionalProblem(
      sizeProblem(candidate.width - reference.width, reference.width, 'wider', 'narrower'),
    ),
    ...(lines === null ? optionalProblem(heightProblem) : lines.problems),
    ...drawnProblems(region, measurement.match),
  ];
  problems.sort((a, b) => b.severity - a.severity);
  return {
    ...verdict,
    renderedLines: lines === null ? region.lines : lines.renderedLines,
    widthChange: round((candidate.width - reference.width) / Math.max(1, reference.width)),
    heightChange: round((candidate.height - reference.height) / Math.max(1, reference.height)),
    overlapAbove: lines?.overlapAbove ?? 0,
    problems: problems.map((problem) => problem.text),
    severity: round(severityOf(problems)),
  };
}

/**
 * A problem as a list: none when the check passed, otherwise just that one problem.
 *
 * @param problem - The problem, or `null` when there is none.
 */
function optionalProblem(problem: Problem | null): Problem[] {
  return problem === null ? [] : [problem];
}

/**
 * The problem of a region drawn differently in the render: when fewer of its edges match than the
 * floor for its kind, and none otherwise.
 *
 * @param region - The region.
 * @param match - The share of its edges found in the render.
 */
function drawnProblems(region: VerifyRegion, match: number): Problem[] {
  const floor =
    region.kind === 'text' ? REGION_THRESHOLDS.textMatch : REGION_THRESHOLDS.figureMatch;
  if (match >= floor) {
    return [];
  }

  return [
    {
      text: `drawn differently (${Math.round(match * PERCENT)}% of edges match)`,
      severity: SEVERITY.drawnBase + SEVERITY.drawnPerShare * (floor - match),
    },
  ];
}

/**
 * How bad a verdict is, from its problems sorted worst first: the worst one, plus a little for each
 * other problem.
 *
 * @param problems - The problems, worst first.
 */
function severityOf(problems: readonly Problem[]): number {
  return problems.length === 0
    ? 0
    : (problems[0]?.severity ?? 0) + SEVERITY.extraProblem * (problems.length - 1);
}

/**
 * The verdict before any check: what the web drew and what was measured, with no problems yet.
 *
 * @param region - The region.
 * @param measurement - Where the comparison page found it.
 */
function initialVerdict(region: VerifyRegion, measurement: RegionMeasurement): RegionVerdict {
  return {
    id: region.id,
    kind: region.kind,
    label: region.label,
    rect: region.rect,
    lines: region.lines,
    renderedLines: region.lines,
    match: round(measurement.match),
    offset: { x: Math.round(measurement.offset.x), y: Math.round(measurement.offset.y) },
    widthChange: 0,
    heightChange: 0,
    overlapAbove: 0,
    problems: [],
    severity: 0,
  };
}

/**
 * The line problems of a text block: content from above drawn into it, and a line count that
 * differs from the web's. The line count is estimated from how much its ink grew, in line pitches.
 *
 * @param lines - The lines the web set.
 * @param linePitch - The distance between the web's baselines, in canvas pixels.
 * @param reference - The web's ink box.
 * @param candidate - The render's ink box around the shifted block.
 * @param offsetY - The render's vertical offset from the web position.
 * @returns What the render shows: the overlap above, the lines it sets and the problems.
 */
function judgeTextLines(
  lines: number,
  linePitch: number,
  reference: SceneRect,
  candidate: SceneRect,
  offsetY: number,
): { overlapAbove: number; renderedLines: number; problems: Problem[] } {
  const problems: Problem[] = [];
  const above = reference.y + offsetY - candidate.y;
  const overlapped = above > linePitch * REGION_THRESHOLDS.lineShare;
  if (overlapped) {
    problems.push({
      text: `overlapped by content above (${Math.round(above)}px)`,
      severity: SEVERITY.overlap,
    });
  }

  const growth = overlapped
    ? candidate.y + candidate.height - (reference.y + reference.height + offsetY)
    : candidate.height - reference.height;
  const extra =
    Math.abs(growth) >= linePitch * REGION_THRESHOLDS.lineShare
      ? Math.round(growth / linePitch) || Math.sign(growth)
      : 0;
  const renderedLines = Math.max(1, lines + extra);
  if (renderedLines !== lines) {
    problems.push({
      text: `${renderedLines} ${renderedLines === 1 ? 'line' : 'lines'} vs ${lines}`,
      severity: SEVERITY.lineCountBase + SEVERITY.lineCountStep * Math.abs(renderedLines - lines),
    });
  }

  return {
    overlapAbove: overlapped ? Math.round(above) : 0,
    renderedLines,
    problems,
  };
}

/**
 * The shift problems of a region: beyond 2% of the slide, or 5% of the region when that is less,
 * and never for a few pixels.
 *
 * @param region - The region.
 * @param offset - Its offset in the render.
 * @param offset.x - Rightwards.
 * @param offset.y - Downwards.
 */
function shiftProblems(region: VerifyRegion, offset: { x: number; y: number }): Problem[] {
  /**
   * The largest shift that passes along an axis.
   */
  const tolerance = (slide: number, size: number): number =>
    Math.max(
      REGION_THRESHOLDS.minShiftPx,
      Math.min(slide * REGION_THRESHOLDS.slideShift, size * REGION_THRESHOLDS.regionShift),
    );
  /**
   * How bad a shift along one axis is.
   */
  const severity = (shift: number): number =>
    Math.min(SEVERITY.shiftMax, SEVERITY.shiftBase + Math.abs(shift) / SEVERITY.shiftPerPx);
  const problems: Problem[] = [];
  if (Math.abs(offset.x) > tolerance(CANVAS.width, region.rect.width)) {
    problems.push({
      text: `shifted ${Math.abs(offset.x)}px ${offset.x > 0 ? 'right' : 'left'}`,
      severity: severity(offset.x),
    });
  }

  if (Math.abs(offset.y) > tolerance(CANVAS.height, region.rect.height)) {
    problems.push({
      text: `shifted ${Math.abs(offset.y)}px ${offset.y > 0 ? 'down' : 'up'}`,
      severity: severity(offset.y),
    });
  }

  return problems;
}

/**
 * A width or height problem, or `null` when the change is within a few percent.
 *
 * @param change - The render's size minus the web's, in canvas pixels.
 * @param size - The web's size.
 * @param more - The word for a larger render, such as `wider`.
 * @param less - The word for a smaller render.
 */
function sizeProblem(change: number, size: number, more: string, less: string): Problem | null {
  const share = change / Math.max(1, size);
  if (
    Math.abs(change) <= REGION_THRESHOLDS.minSizePx ||
    Math.abs(share) <= REGION_THRESHOLDS.sizeChange
  ) {
    return null;
  }

  return {
    text: `${Math.round(Math.abs(share) * PERCENT)}% ${share > 0 ? more : less}`,
    severity: Math.min(SEVERITY.sizeMax, SEVERITY.sizeBase + Math.abs(share)),
  };
}

/**
 * Blames the region that grew: when the render draws content over the top of a text block, the
 * nearest region above it (overlapping it horizontally) has most likely wrapped to more lines or
 * grown taller, which its own box cannot show because the block below stops it. That region gets a
 * problem naming the block it runs into.
 *
 * @param regions - The slide's regions.
 * @param verdicts - Their verdicts for one render.
 * @returns The verdicts, with the problems added.
 */
export function attributeOverlaps(
  regions: readonly VerifyRegion[],
  verdicts: readonly RegionVerdict[],
): RegionVerdict[] {
  const result = verdicts.map((verdict) => ({ ...verdict, problems: [...verdict.problems] }));
  for (const below of result) {
    if (below.overlapAbove <= 0) {
      continue;
    }

    const candidates = regions.filter(
      (region) =>
        region.id !== below.id &&
        region.rect.y + region.rect.height <= below.rect.y + OVERLAP_SLACK_PX &&
        Math.min(region.rect.x + region.rect.width, below.rect.x + below.rect.width) >
          Math.max(region.rect.x, below.rect.x),
    );
    const nearest = candidates.sort(
      (a, b) => b.rect.y + b.rect.height - (a.rect.y + a.rect.height),
    )[0];
    const above = result.find((verdict) => verdict.id === nearest?.id);
    if (above === undefined) {
      continue;
    }

    above.problems.push(`runs into ${below.label} below (more lines or taller)`);
    above.severity = round(
      Math.max(above.severity, SEVERITY.blameFloor) +
        SEVERITY.extraProblem * (above.problems.length - 1),
    );
  }

  return result;
}

/**
 * The failing verdicts, worst first.
 *
 * @param verdicts - Verdicts of one or more renders.
 * @param count - How many to keep.
 */
export function worstRegions<T extends Pick<RegionVerdict, 'problems' | 'severity'>>(
  verdicts: readonly T[],
  count: number,
): T[] {
  return verdicts
    .filter((verdict) => verdict.problems.length > 0)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, count);
}

/**
 * A verdict as one line of a report, such as `text "Revenue grew…": 3 lines vs 2, shifted 14px
 * down`.
 *
 * @param verdict - The verdict.
 */
export function formatVerdict(verdict: Pick<RegionVerdict, 'label' | 'problems'>): string {
  return `${verdict.label}: ${verdict.problems.length === 0 ? 'ok' : verdict.problems.join(', ')}`;
}

/**
 * A node for a label: the last part of its selector.
 *
 * @param node - The node.
 */
function describeNode(node: SceneNode): string {
  const tail = node.selector.split(SELECTOR_SEPARATOR).at(-1) ?? node.kind;
  return tail === '' ? node.kind : tail;
}

/**
 * Text cut to {@link LABEL_CHARACTERS} with an ellipsis.
 *
 * @param text - The text.
 */
function shorten(text: string): string {
  const flat = text.replace(WHITESPACE_RUN, ' ').trim();
  return flat.length <= LABEL_CHARACTERS ? flat : `${flat.slice(0, LABEL_CHARACTERS - 1)}…`;
}

/**
 * A rectangle clipped to the canvas.
 *
 * @param rect - The rectangle.
 * @param canvas - The canvas.
 * @param canvas.width - Its width.
 * @param canvas.height - Its height.
 */
function clip(rect: SceneRect, canvas: { width: number; height: number }): SceneRect {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  return {
    x,
    y,
    width: Math.min(canvas.width, rect.x + rect.width) - x,
    height: Math.min(canvas.height, rect.y + rect.height) - y,
  };
}

/**
 * The median of some numbers, or 0 for none.
 *
 * @param values - The numbers.
 */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * A share rounded to three decimals.
 *
 * @param value - The share.
 */
function round(value: number): number {
  return Math.round(value * ROUND_SCALE) / ROUND_SCALE;
}
