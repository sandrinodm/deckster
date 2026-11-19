import type { SurfaceTheme } from '#pptx/theme.ts';
import type {
  RunStyle,
  SceneBullet,
  SceneLine,
  SceneParagraph,
  SceneRect,
  SceneRun,
} from '#scene/scene.ts';

import { el, escapeXml } from '#ooxml/xml.ts';
import { colorXml } from '#pptx/theme.ts';
import {
  exactSpacingBaseline,
  fontSizeHundredths,
  fractionToDrawing,
  maxOf,
  minOf,
  pointsHundredths,
  pxToEmu,
} from '#units.ts';

/**
 * The weight from which PowerPoint's bold is used when the brand's fonts are not embedded: it has
 * no other weights.
 */
const BOLD_FROM_WEIGHT = 600;

/**
 * The bullet characters for drawn markers, and the font they are set in: a round marker stays
 * round, a square one square.
 */
const BULLETS = {
  /**
   * A black square, for square or slightly rounded markers.
   */
  square: '■',

  /**
   * A black circle, for round markers.
   */
  round: '●',

  /**
   * A font every PowerPoint has, with both characters.
   */
  font: 'Arial',
} as const;

/**
 * The description of {@link BULLETS.font} that PowerPoint matches a bullet's font by: its PANOSE
 * classification, pitch family (34, variable pitch in the Swiss family) and character set.
 */
const BULLET_FONT_FACE = {
  /**
   * The PANOSE classification of Arial.
   */
  panose: '020B0604020202020204',

  /**
   * The pitch family byte: variable pitch in the Swiss family.
   */
  pitchFamily: 34,

  /**
   * The ANSI character set.
   */
  charset: 0,
} as const;

/**
 * The size of {@link BULLETS}' characters in Arial, as a share of the font size.
 */
const BULLET_EM = 0.6;

/**
 * How far a drawn marker's corner radius may fall short of half its smaller side, in canvas pixels,
 * and still count as a round marker.
 */
const ROUND_MARKER_SLACK_PX = 0.5;

/**
 * The range DrawingML accepts for a bullet's size, as a fraction of the text size.
 */
const BULLET_SIZE_RANGE = {
  /**
   * The smallest size.
   */
  min: 0.25,

  /**
   * The largest size.
   */
  max: 4,
} as const;

/**
 * Superscript and subscript offsets, in DrawingML percentage units.
 */
const BASELINE_SHIFT = {
  /**
   * Raised.
   */
  super: 30_000,

  /**
   * Lowered.
   */
  sub: -25_000,
} as const;

/**
 * DrawingML lists at most nine levels.
 */
const MAX_LEVEL = 8;

/**
 * How much wider than its longest line a text that does not wrap gets: Apple's renderer wraps text
 * that outgrows its box even with `wrap="none"`, as it does when it sets the text in a wider
 * substitute font. The box grows away from the text's alignment edge, so the text stays in place.
 */
const NO_WRAP_SLACK = 1.3;

/**
 * Extra room for a text that does not wrap, in canvas pixels.
 */
const NO_WRAP_SLACK_PX = 4;

/**
 * Extra height under a frame's last line, as a share of its line pitch, so a renderer whose lines
 * are a little taller does not overflow or shrink the text.
 */
const BOTTOM_SLACK = 0.25;

/**
 * Characters after which a wrapped line continues without a space (the browser broke after them).
 */
const NO_SPACE_AFTER = /[-‐–—/­]$/;

/**
 * Two line pitches closer than this, in canvas pixels, count as the same.
 */
const SAME_PITCH_PX = 0.5;

/**
 * A paragraph positioned in its text frame.
 */
export type ParagraphLayout = {
  /**
   * The paragraph.
   */
  paragraph: SceneParagraph;

  /**
   * The line pitch in canvas pixels: the computed line height, or the measured distance between
   * baselines when the paragraph has several lines.
   */
  lineSpacing: number;

  /**
   * Space before the paragraph in canvas pixels; 0 for the first.
   */
  spaceBefore: number;

  /**
   * The left margin of the text from the frame's left edge.
   */
  marginLeft: number;

  /**
   * The right margin from the frame's right edge.
   */
  marginRight: number;

  /**
   * Where the first line (or the marker) starts relative to the left margin; negative for a hanging
   * marker.
   */
  indent: number;

  /**
   * Whether margins, alignment and spacing are written even where they are the default: in a frame
   * of several paragraphs, since LibreOffice carries a paragraph's properties over to the next one
   * that leaves them out.
   */
  explicitMargins?: boolean;
};

/**
 * Where a text frame goes and how its paragraphs sit in it.
 */
export type FrameLayout = {
  /**
   * The frame in canvas pixels.
   */
  rect: SceneRect;

  /**
   * The paragraphs.
   */
  paragraphs: ParagraphLayout[];

  /**
   * Whether the frame wraps its text (`wrap="square"`); `false` when no paragraph wraps.
   */
  wraps: boolean;
};

/**
 * Lays out a text frame so PowerPoint's lines land where the browser's did and wrap where they
 * wrapped. Each paragraph gets the area its text wraps in: the width the page found reproduces the
 * browser's line breaks (the CSS column, or the longest line for balanced text), placed at the
 * text's start, centred in its box or against its right edge. The frame spans every paragraph's
 * area and its marker; margins put each paragraph in its own area. PowerPoint and LibreOffice set
 * DrawingML text on font-independent lines (an em of ascent, a fifth of descent), so a line with
 * exact spacing L has its baseline L minus a fifth of its largest font size below the line's top,
 * whatever the font's own descent; the frame's top is therefore the first baseline minus that, and
 * the space before each later paragraph is the gap between the previous line's bottom and this
 * line's top in that model.
 *
 * @param paragraphs - The paragraphs, top to bottom; at least one, each with at least one line.
 * @returns The frame and the paragraph layouts.
 */
export function layoutFrame(paragraphs: readonly SceneParagraph[]): FrameLayout {
  const areas = paragraphs.map((paragraph) => wrapArea(paragraph));
  const lefts = paragraphs.flatMap((paragraph, index) => [
    areas[index]?.left ?? paragraph.box.x,
    markerLeft(paragraph.bullet),
  ]);
  const left = minOf(lefts.filter((value) => Number.isFinite(value)));
  const right = maxOf(areas.map((area) => area.left + area.width));
  const firstLine = paragraphs[0]?.lines[0];
  const firstSpacing = paragraphs[0] === undefined ? 0 : linePitch(paragraphs[0]);
  const top = (firstLine?.baseline ?? 0) - baselineBelowTop(firstLine, firstSpacing);
  let previousBottom = top;
  let lastSpacing = firstSpacing;
  const layouts = paragraphs.map((paragraph, index): ParagraphLayout => {
    const first = paragraph.lines[0];
    const lineSpacing = linePitch(paragraph);
    const lineTop = (first?.baseline ?? 0) - baselineBelowTop(first, lineSpacing);
    const spaceBefore = index === 0 ? 0 : Math.max(0, lineTop - previousBottom);
    previousBottom += spaceBefore + lineSpacing * paragraph.lines.length;
    lastSpacing = lineSpacing;
    const area = areas[index] ?? { left, width: right - left };
    const textLeft = textStart(paragraph);
    const marker = markerLeft(paragraph.bullet);
    return {
      paragraph,
      lineSpacing,
      spaceBefore,
      marginLeft: area.left - left,
      marginRight: Math.max(0, right - (area.left + area.width)),
      indent: Number.isFinite(marker) ? marker - textLeft : 0,
    };
  });
  const height = previousBottom - top + lastSpacing * BOTTOM_SLACK;
  if (layouts.length > 1) {
    layouts.forEach((layout) => {
      layout.explicitMargins = true;
    });
  }

  return {
    rect: { x: left, y: top, width: right - left, height: Math.max(1, height) },
    paragraphs: layouts,
    wraps: paragraphs.some((paragraph) => paragraph.wrapWidth !== null),
  };
}

/**
 * How far below its top an exactly spaced line has its baseline, from its largest run.
 *
 * @param line - The line, or `undefined` for a frame without lines.
 * @param spacing - The exact line spacing in canvas pixels.
 */
function baselineBelowTop(line: SceneLine | undefined, spacing: number): number {
  const size = maxOf(
    (line?.runs ?? []).map((run) => run.style.size),
    0,
  );
  return exactSpacingBaseline(spacing, size);
}

/**
 * The area a paragraph's text wraps in: its wrap width (or, for text that does not wrap, its
 * longest line with room to spare) from where its text starts, centred in its box, or against the
 * box's right edge.
 *
 * @param paragraph - The paragraph.
 */
function wrapArea(paragraph: SceneParagraph): { left: number; width: number } {
  const longest = maxOf(paragraph.lines.map((line) => line.right - line.left));
  const roomy = longest * NO_WRAP_SLACK + NO_WRAP_SLACK_PX;
  const width = paragraph.wrapWidth ?? roomy;
  const { box } = paragraph;
  switch (paragraph.align) {
    case 'center': {
      return { left: box.x + box.width / 2 - width / 2, width };
    }

    case 'right': {
      return { left: box.x + box.width - width, width };
    }

    case 'left':
    case 'justify': {
      return { left: textStart(paragraph), width };
    }
  }
}

/**
 * The distance between a paragraph's baselines: measured when it has several lines, else its
 * computed line height.
 *
 * @param paragraph - The paragraph.
 */
export function linePitch(paragraph: SceneParagraph): number {
  const first = paragraph.lines[0];
  const last = paragraph.lines.at(-1);
  if (first === undefined || last === undefined || paragraph.lines.length < 2) {
    return paragraph.lineHeight;
  }

  return (last.baseline - first.baseline) / (paragraph.lines.length - 1);
}

/**
 * Where a paragraph's text starts: its leftmost line for left-aligned text (which is not always the
 * content box's edge, as in a flex row with a marker), else its content box, in which PowerPoint
 * centres or right-aligns the lines.
 *
 * @param paragraph - The paragraph.
 */
function textStart(paragraph: SceneParagraph): number {
  if (paragraph.align !== 'left' && paragraph.align !== 'justify') {
    return paragraph.box.x;
  }

  return minOf(paragraph.lines.map((line) => line.left));
}

/**
 * The left edge of a list marker, or infinity without one.
 *
 * @param bullet - The marker.
 */
function markerLeft(bullet: SceneBullet | null): number {
  if (bullet === null) {
    return Number.POSITIVE_INFINITY;
  }

  return bullet.kind === 'shape' ? bullet.rect.x : bullet.left;
}

/**
 * How a run's link is written: a relationship id and, for slide jumps, the action.
 */
export type LinkTarget = {
  /**
   * The relationship id.
   */
  id: string;

  /**
   * `ppaction://hlinksldjump` for a jump to a slide, else nothing.
   */
  action?: string;
};

/**
 * The font a run is written in: the typeface (a theme reference such as `+mn-lt`, an embedded
 * instance's family or an installed family), PowerPoint's bold and italic, and what a viewer
 * without the font needs to pick a similar one.
 */
export type FontChoice = {
  /**
   * The typeface to write on `a:latin`.
   */
  typeface: string;

  /**
   * Whether the run is bold.
   */
  bold: boolean;

  /**
   * Whether the run is italic.
   */
  italic: boolean;

  /**
   * The PANOSE classification as 20 hex digits, if known.
   */
  panose?: string;

  /**
   * The `pitchFamily` byte (pitch in the low bits, family in the high), if known.
   */
  pitchFamily?: number;

  /**
   * The character set, if known.
   */
  charset?: number;

  /**
   * Whether the run renders in a system fallback (CJK, emoji, symbols), so the East Asian and
   * complex script fonts are set as well.
   */
  fallback?: boolean;
};

/**
 * Picks the font of a run.
 */
export type FontResolver = (style: RunStyle) => FontChoice;

/**
 * What runs in a placeholder inherit from the layout, so they leave it out: the first paragraph's
 * size, color, font, case, tracking, alignment and line pitch on the layout's slide.
 */
export type TextDefaults = {
  /**
   * The font size in canvas pixels.
   */
  size: number;

  /**
   * The text color.
   */
  color: string;

  /**
   * The font.
   */
  font: FontChoice;

  /**
   * Letter spacing in canvas pixels.
   */
  letterSpacing: number;

  /**
   * The case transform.
   */
  caps: RunStyle['caps'];

  /**
   * The alignment.
   */
  align: SceneParagraph['align'];

  /**
   * The line pitch in canvas pixels.
   */
  lineSpacing: number;
};

/**
 * The slide counts a page number such as `15 / 42` is rewritten with when a file holds only some of
 * the deck's slides, or each step of a slide as its own slide.
 */
export type SlideTotals = {
  /**
   * The deck's slide count, which the page number shows.
   */
  deck: number;

  /**
   * The file's slide count, written in its place.
   */
  file: number;

  /**
   * The slide's 1-based position in the file, written as the slide number field's cached text.
   */
  position: number;
};

/**
 * What the run writer needs from the slide it writes.
 */
export type TextContext = {
  /**
   * The theme of the slide's surface.
   */
  theme: SurfaceTheme;

  /**
   * The brand's display (major) and body (minor) families, for theme font references.
   */
  families: { major: string; minor: string };

  /**
   * Resolves a link to a relationship, or `null` to drop it.
   */
  link: (href: string) => LinkTarget | null;

  /**
   * The slide number, written as a field where a run shows it in slide chrome; `null` for none.
   */
  slideNumber: number | null;

  /**
   * The total the page number shows (the deck's slide count), the total to write instead (the
   * file's) and the slide's position in the file, or `null` to leave the text as it is.
   */
  totals?: SlideTotals | null;

  /**
   * Picks each run's font. Without one, brand families are theme references and bold starts at 600.
   */
  font?: FontResolver;

  /**
   * What the frame's placeholder gives its runs, or `null` for a free text box.
   */
  defaults?: TextDefaults | null;

  /**
   * Whether the frame is a placeholder whose text writes every property (a nested list level, which
   * the layout's defaults do not describe).
   */
  explicit?: boolean;
};

/**
 * The font a run gets without a resolver: the brand families through the theme, bold from 600.
 *
 * @param style - The run style.
 * @param families - The brand's display and body families.
 */
export function defaultFont(
  style: RunStyle,
  families: { major: string; minor: string },
): FontChoice {
  return {
    typeface: typefaceFor(style.family, families),
    bold: style.weight >= BOLD_FROM_WEIGHT,
    italic: style.italic,
  };
}

/**
 * The font of a run in a context.
 *
 * @param style - The run style.
 * @param context - The context.
 */
function fontOf(style: RunStyle, context: TextContext): FontChoice {
  return context.font?.(style) ?? defaultFont(style, context.families);
}

/**
 * The `a:p` elements of a laid-out frame.
 *
 * @param layout - The frame layout.
 * @param context - The slide's theme, fonts and links.
 */
export function paragraphsXml(layout: FrameLayout, context: TextContext): string {
  return layout.paragraphs.map((paragraph) => paragraphXml(paragraph, context)).join('');
}

/**
 * The text of a paragraph as PowerPoint gets it: wrapped lines joined back with the space the
 * browser dropped at the break (none after a hyphen or a dash), and a soft break where the source
 * breaks the line or where the breaks are kept.
 *
 * @param paragraph - The paragraph.
 */
export function paragraphRuns(paragraph: SceneParagraph): (SceneRun | 'break')[] {
  const items: (SceneRun | 'break')[] = [];
  paragraph.lines.forEach((line, index) => {
    const previous = paragraph.lines[index - 1];
    if (previous !== undefined) {
      if (paragraph.keepBreaks || previous.authored) {
        items.push('break');
      } else {
        const last = items.at(-1);
        if (last !== undefined && last !== 'break' && !NO_SPACE_AFTER.test(last.text)) {
          items[items.length - 1] = { ...last, text: `${last.text} ` };
        }
      }
    }

    items.push(...line.runs.map((run) => ({ ...run })));
  });
  return items;
}

/**
 * One `a:p`: properties, then its runs (consecutive runs written alike are merged), with a soft
 * break where the source breaks the line.
 *
 * @param layout - The paragraph's layout.
 * @param context - The slide's theme, fonts and links.
 */
export function paragraphXml(layout: ParagraphLayout, outer: TextContext): string {
  const { paragraph } = layout;
  const nested = paragraph.level > 0 && (outer.defaults ?? null) !== null;
  const context = nested ? { ...outer, defaults: null, explicit: true } : outer;
  const lastRun = paragraph.lines.at(-1)?.runs.at(-1);
  const marker = paragraph.bullet?.kind === 'text' ? markerRun(paragraph.bullet, context) : '';
  const parts: (string | { run: SceneRun; key: string })[] = [];
  let previousStyle: RunStyle | undefined;
  for (const item of paragraphRuns(paragraph)) {
    if (item === 'break') {
      parts.push(
        el(
          'a:br',
          {},
          previousStyle === undefined ? '' : runProperties('a:rPr', previousStyle, context, null),
        ),
      );
      continue;
    }

    const key = `${runProperties('a:rPr', item.style, context, null)}|${item.href ?? ''}`;
    const last = parts.at(-1);
    if (last !== undefined && typeof last !== 'string' && last.key === key) {
      last.run = { ...last.run, text: last.run.text + item.text };
    } else {
      parts.push({ run: item, key });
    }

    previousStyle = item.style;
  }

  const end =
    lastRun === undefined ? '' : runProperties('a:endParaRPr', lastRun.style, context, null);
  const written = parts.map((part) =>
    typeof part === 'string' ? part : runXml(part.run, context),
  );
  return el('a:p', {}, paragraphProperties(layout, context), marker, ...written, end);
}

/**
 * `a:pPr`: alignment, margins, line spacing, space before and the marker; in a placeholder, what
 * the layout already gives is left out, except the margins and the marker, which the master's list
 * style would otherwise supply.
 *
 * @param layout - The paragraph's layout.
 * @param context - The slide's theme.
 */
function paragraphProperties(layout: ParagraphLayout, context: TextContext): string {
  const { paragraph } = layout;
  const defaults = context.defaults ?? null;
  const inPlaceholder = defaults !== null || context.explicit === true;
  const severalParagraphs = layout.explicitMargins === true;
  const explicitMargins = inPlaceholder || severalParagraphs;
  const algn = { left: 'l', center: 'ctr', right: 'r', justify: 'just' }[paragraph.align];
  const defaultAlign =
    defaults === null
      ? 'l'
      : { left: 'l', center: 'ctr', right: 'r', justify: 'just' }[defaults.align];
  const marL = pxToEmu(Math.max(0, layout.marginLeft));
  const marR = pxToEmu(layout.marginRight);
  const indent = pxToEmu(layout.indent);
  const samePitch =
    defaults !== null && Math.abs(defaults.lineSpacing - layout.lineSpacing) < SAME_PITCH_PX;
  const bullet = bulletXml(paragraph, context);
  return el(
    'a:pPr',
    {
      marL: explicitMargins || marL !== 0 ? marL : undefined,
      marR: explicitMargins || marR !== 0 ? marR : undefined,
      lvl: Math.min(MAX_LEVEL, paragraph.level) || undefined,
      indent: explicitMargins || indent !== 0 ? indent : undefined,
      algn: algn === defaultAlign && !severalParagraphs ? undefined : algn,
    },
    samePitch && !severalParagraphs
      ? ''
      : el('a:lnSpc', {}, el('a:spcPts', { val: pointsHundredths(layout.lineSpacing) })),
    explicitMargins || layout.spaceBefore > 0
      ? el('a:spcBef', {}, el('a:spcPts', { val: pointsHundredths(layout.spaceBefore) }))
      : '',
    inPlaceholder || bullet !== el('a:buNone') ? bullet : '',
  );
}

/**
 * The marker properties: a round or square bullet in the marker's color and size for a drawn
 * marker, none otherwise (a text marker is written as a run with a tab).
 *
 * @param paragraph - The paragraph.
 * @param context - The slide's theme.
 */
function bulletXml(paragraph: SceneParagraph, context: TextContext): string {
  const bullet = paragraph.bullet;
  const fontSize = paragraph.lines[0]?.runs[0]?.style.size ?? 0;
  if (bullet?.kind !== 'shape' || fontSize === 0) {
    return el('a:buNone');
  }

  const share = bullet.rect.width / (BULLET_EM * fontSize);
  const size = Math.min(BULLET_SIZE_RANGE.max, Math.max(BULLET_SIZE_RANGE.min, share));
  const round =
    bullet.radius >= Math.min(bullet.rect.width, bullet.rect.height) / 2 - ROUND_MARKER_SLACK_PX;
  return (
    el('a:buClr', {}, colorXml(bullet.color, context.theme)) +
    el('a:buSzPct', { val: fractionToDrawingUnbounded(size) }) +
    el('a:buFont', { typeface: BULLETS.font, ...BULLET_FONT_FACE }) +
    el('a:buChar', { char: round ? BULLETS.round : BULLETS.square })
  );
}

/**
 * A ratio as DrawingML percentage units without clamping to 100%.
 *
 * @param ratio - The ratio, such as 0.57.
 */
function fractionToDrawingUnbounded(ratio: number): number {
  return Math.round(ratio * fractionToDrawing(1));
}

/**
 * A text marker (such as `01`) as a run followed by a tab to the text.
 *
 * @param bullet - The marker.
 * @param context - The slide's theme and fonts.
 */
function markerRun(bullet: Extract<SceneBullet, { kind: 'text' }>, context: TextContext): string {
  return el(
    'a:r',
    {},
    runProperties('a:rPr', bullet.style, context, null),
    el('a:t', {}, escapeXml(`${bullet.text}\t`)),
  );
}

/**
 * One run, with a slide number field in place of the slide number in chrome text, and the file's
 * slide count in place of the deck's.
 *
 * @param run - The run.
 * @param context - The slide's theme, fonts and links.
 */
export function runXml(run: SceneRun, context: TextContext): string {
  const link = run.href === null ? null : context.link(run.href);
  const properties = runProperties('a:rPr', run.style, context, link);
  const number = context.slideNumber === null ? '' : String(context.slideNumber);
  const index = number === '' ? -1 : findNumber(run.text, number);
  if (index === -1) {
    return el('a:r', {}, properties, el('a:t', {}, escapeXml(run.text)));
  }

  const before = run.text.slice(0, index);
  const totals = context.totals ?? null;
  const rest = run.text.slice(index + number.length);
  const after =
    totals === null
      ? rest
      : rest.replace(new RegExp(`(\\D)${totals.deck}(?!\\d)`), `$1${totals.file}`);
  // The field's cached text is what renderers that do not recompute fields show, so it is the
  // slide's place in the file, which is what PowerPoint computes and what the total counts.
  const cached = totals === null ? number : String(totals.position);
  const field = el(
    'a:fld',
    { id: '{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}', type: 'slidenum' },
    properties,
    el('a:t', {}, escapeXml(cached)),
  );
  /**
   * A plain run of text, or nothing for empty text.
   */
  const plain = (text: string): string =>
    text === '' ? '' : el('a:r', {}, properties, el('a:t', {}, escapeXml(text)));
  return plain(before) + field + plain(after);
}

/**
 * Where a number stands alone in a text, such as `9` in `9 / 16`.
 *
 * @param text - The text.
 * @param number - The number as text.
 * @returns Its index, or -1.
 */
function findNumber(text: string, number: string): number {
  const match = new RegExp(`(^|\\D)(${number})(?!\\d)`).exec(text);
  return match === null ? -1 : match.index + (match[1]?.length ?? 0);
}

/**
 * Run properties in schema order: size, bold, italics, underline, strike, caps, letter spacing,
 * baseline shift, color, fonts and link. Language and kerning come from the presentation's and the
 * master's text styles; in a placeholder, what the layout gives (size, color, font, case, tracking)
 * is left out.
 *
 * @param tag - `a:rPr` or `a:endParaRPr`.
 * @param style - The run style.
 * @param context - The slide's theme and fonts.
 * @param link - The run's link, if any.
 */
export function runProperties(
  tag: string,
  style: RunStyle,
  context: TextContext,
  link: LinkTarget | null,
): string {
  const defaults = context.defaults ?? null;
  const explicit = context.explicit === true;
  const font = fontOf(style, context);
  const shift = style.shift === 'none' ? undefined : BASELINE_SHIFT[style.shift];
  const size = fontSizeHundredths(style.size);
  const spacing = pointsHundredths(style.letterSpacing);
  const sameSize = defaults !== null && fontSizeHundredths(defaults.size) === size;
  const defaultBold = defaults?.font.bold ?? false;
  const defaultItalic = defaults?.font.italic ?? false;
  const defaultCaps = defaults?.caps ?? 'none';
  const defaultSpacing = defaults === null ? 0 : pointsHundredths(defaults.letterSpacing);
  const sameColor = defaults !== null && defaults.color.toLowerCase() === style.color.toLowerCase();
  const sameFont = defaults !== null && defaults.font.typeface === font.typeface;
  const fallbackFonts =
    font.fallback === true
      ? el('a:ea', { typeface: font.typeface }) + el('a:cs', { typeface: font.typeface })
      : '';
  return el(
    tag,
    {
      sz: sameSize ? undefined : size,
      b: font.bold === defaultBold && !explicit ? undefined : Number(font.bold),
      i: font.italic === defaultItalic && !explicit ? undefined : Number(font.italic),
      u: underlineOf(style, link),
      strike: style.strike ? 'sngStrike' : undefined,
      cap: style.caps === defaultCaps && !explicit ? undefined : style.caps,
      spc: spacing === defaultSpacing ? undefined : spacing,
      baseline: shift,
    },
    sameColor ? '' : el('a:solidFill', {}, colorXml(style.color, context.theme)),
    sameFont && fallbackFonts === '' ? '' : latinXml(font) + fallbackFonts,
    link === null ? '' : textLinkXml(link),
  );
}

/**
 * A run's `u` attribute: `sng` when it is underlined, `none` for a link the slide draws without an
 * underline (viewers underline links by default), else none at all.
 *
 * @param style - The run style.
 * @param link - The run's link, if any.
 */
function underlineOf(style: RunStyle, link: LinkTarget | null): 'sng' | 'none' | undefined {
  if (style.underline) {
    return 'sng';
  }

  return link === null ? undefined : 'none';
}

/**
 * The hyperlink extension that tells PowerPoint which color a link is drawn in.
 */
const HYPERLINK_COLOR_EXTENSION = '{A12FA001-AC4F-418D-AE19-62706E023703}';

/**
 * The namespace of {@link HYPERLINK_COLOR_EXTENSION}.
 */
const HYPERLINK_COLOR_NAMESPACE = 'http://schemas.microsoft.com/office/drawing/2018/hyperlinkcolor';

/**
 * A run's link, drawn in the run's own color. Without the hyperlink color extension (`val="tx"`)
 * PowerPoint and LibreOffice paint every link in the theme's hyperlink color whatever the run's
 * fill says; with it they keep the text color the slide shows. The underline is the run's: links
 * the slide draws without one get `u="none"`, since both apps underline links by default.
 *
 * @param link - The link.
 */
function textLinkXml(link: LinkTarget): string {
  return el(
    'a:hlinkClick',
    { 'r:id': link.id, action: link.action },
    el(
      'a:extLst',
      {},
      el(
        'a:ext',
        { uri: HYPERLINK_COLOR_EXTENSION },
        el('ahyp:hlinkClr', { 'xmlns:ahyp': HYPERLINK_COLOR_NAMESPACE, val: 'tx' }),
      ),
    ),
  );
}

/**
 * `a:latin` for a font, with what a viewer without it needs to substitute a similar one.
 *
 * @param font - The font.
 */
export function latinXml(font: FontChoice): string {
  return el('a:latin', {
    typeface: font.typeface,
    panose: font.panose,
    pitchFamily: font.pitchFamily,
    charset: font.charset,
  });
}

/**
 * The defaults a placeholder gives its runs, from the first run and paragraph of a frame.
 *
 * @param layout - The frame.
 * @param context - The fonts.
 * @returns The defaults, or `null` for a frame without text.
 */
export function textDefaults(layout: FrameLayout, context: TextContext): TextDefaults | null {
  const first = layout.paragraphs[0];
  const style = first?.paragraph.lines[0]?.runs[0]?.style;
  if (first === undefined || style === undefined) {
    return null;
  }

  return {
    size: style.size,
    color: style.color,
    font: fontOf(style, context),
    letterSpacing: style.letterSpacing,
    caps: style.caps,
    align: first.paragraph.align,
    lineSpacing: first.lineSpacing,
  };
}

/**
 * The list style of a layout placeholder: its first level set to the defaults, so the slide's runs
 * inherit them.
 *
 * @param defaults - The defaults.
 * @param theme - The surface theme.
 */
export function listStyleXml(defaults: TextDefaults, theme: SurfaceTheme): string {
  const algn = { left: 'l', center: 'ctr', right: 'r', justify: 'just' }[defaults.align];
  return el(
    'a:lstStyle',
    {},
    el(
      'a:lvl1pPr',
      { marL: 0, indent: 0, algn },
      el('a:lnSpc', {}, el('a:spcPts', { val: pointsHundredths(defaults.lineSpacing) })),
      el('a:spcBef', {}, el('a:spcPts', { val: 0 })),
      el('a:buNone'),
      el(
        'a:defRPr',
        {
          sz: fontSizeHundredths(defaults.size),
          b: defaults.font.bold ? 1 : 0,
          i: defaults.font.italic ? 1 : 0,
          kern: 0,
          cap: defaults.caps === 'none' ? undefined : defaults.caps,
          spc: defaults.letterSpacing === 0 ? undefined : pointsHundredths(defaults.letterSpacing),
        },
        el('a:solidFill', {}, colorXml(defaults.color, theme)),
        latinXml(defaults.font),
      ),
    ),
  );
}

/**
 * The typeface for a family: a theme reference for the brand's display and body families, so the
 * deck restyles with the theme, else the family itself.
 *
 * @param family - The family the run renders in.
 * @param families - The brand's display and body families.
 */
export function typefaceFor(family: string, families: { major: string; minor: string }): string {
  if (family === families.major) {
    return '+mj-lt';
  }

  return family === families.minor ? '+mn-lt' : family;
}
