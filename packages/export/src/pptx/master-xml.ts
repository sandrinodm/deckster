import type { BrandTokens } from '@deckster/brand';
import type { PptxLayoutType, PptxPlaceholderKind } from '@deckster/engine/layout';

import type { PlaceholderRef } from '#pptx/frame-xml.ts';
import type { LayoutSpec } from '#pptx/layout-specs.ts';
import type { TextDefaults } from '#pptx/text-xml.ts';
import type { SurfaceTheme } from '#pptx/theme.ts';
import type { SceneRect } from '#scene/scene.ts';

import { el, escapeXml, XML_DECLARATION } from '#ooxml/xml.ts';
import { PML_NAMESPACES } from '#pptx/namespaces.ts';
import { cNvPr, xfrm } from '#pptx/shape-xml.ts';
import { listStyleXml } from '#pptx/text-xml.ts';
import { COLOR_MAP, colorXml, paintFill } from '#pptx/theme.ts';
import {
  CANVAS_HEIGHT_PX,
  CANVAS_WIDTH_PX,
  EMU_PER_INCH,
  fontSizeHundredths,
  lineSpacingPercent,
  pointsHundredths,
  pxToEmu,
} from '#units.ts';

/**
 * The weight from which the master's title style is bold.
 */
const BOLD_WEIGHT = 600;

/**
 * The default tab stop of the text styles, in EMU: one inch.
 */
const DEFAULT_TAB_SIZE_EMU = EMU_PER_INCH;

/**
 * The title's box is this many lines of headline type tall, so a title may wrap onto a second line.
 */
const TITLE_LINES = 2;

/**
 * The shape ids of the master's title and body placeholders.
 */
const TITLE_SHAPE_ID = 2;

/**
 * The shape id of the master's body placeholder.
 */
const BODY_SHAPE_ID = 3;

/**
 * The second outline level's font size, as a share of the body size.
 */
const SECOND_LEVEL_SIZE_SHARE = 0.9;

/**
 * The third outline level's font size, as a share of the body size.
 */
const THIRD_LEVEL_SIZE_SHARE = 0.8;

/**
 * The indent of each outline level, in ems of that level's font size.
 */
const LEVEL_INDENT_EM = 1.1;

/**
 * The space before each outline paragraph, in ems of that level's font size.
 */
const LEVEL_SPACE_BEFORE_EM = 0.4;

/**
 * A bullet's size as a share of its text, in DrawingML's thousandths of a percent (57 percent).
 */
const BULLET_SIZE_UNITS = 57_000;

/**
 * The slide picture on the notes master, in EMU: its left and top edges, and its width and height.
 */
const NOTES_SLIDE_IMAGE_EMU = {
  /**
   * The left edge.
   */
  x: 381_000,

  /**
   * The top edge.
   */
  y: 685_800,

  /**
   * The width.
   */
  cx: 6_096_000,

  /**
   * The height.
   */
  cy: 3_429_000,
} as const;

/**
 * The notes text box on the notes master, in EMU: its left and top edges, and its width and height.
 */
const NOTES_BODY_EMU = {
  /**
   * The left edge.
   */
  x: 685_800,

  /**
   * The top edge.
   */
  y: 4_343_400,

  /**
   * The width.
   */
  cx: 5_486_400,

  /**
   * The height.
   */
  cy: 4_114_800,
} as const;

/**
 * The insets of the notes text on the notes master, in EMU.
 */
const NOTES_BODY_INSET_EMU = {
  /**
   * The left and right insets.
   */
  horizontal: 91_440,

  /**
   * The top and bottom insets.
   */
  vertical: 45_720,
} as const;

/**
 * The selection-pane name of the slide picture on the notes pages.
 */
const SLIDE_IMAGE_NAME = 'Slide Image';

/**
 * The shape id of the slide picture on the notes pages.
 */
const SLIDE_IMAGE_SHAPE_ID = 2;

/**
 * The selection-pane name of the speaker notes' text box.
 */
const NOTES_BODY_NAME = 'Notes';

/**
 * The shape id of the speaker notes' text box.
 */
const NOTES_BODY_SHAPE_ID = 3;

/**
 * The outline of the slide picture on the notes master, in EMU: one point.
 */
const SLIDE_IMAGE_OUTLINE_EMU = 12_700;

/**
 * The notes text's size on the notes master, in hundredths of a point: 12 points.
 */
const NOTES_TEXT_SIZE_HUNDREDTHS = 1200;

/**
 * Matches the blank line between two paragraphs of speaker notes.
 */
const PARAGRAPH_BREAK = /\n\s*\n/;

/**
 * Matches a line break and the spaces around it, which a paragraph writes as one space.
 */
const LINE_BREAK = /\s*\n\s*/g;

/**
 * PresentationML's slide layout type for each deck layout type.
 */
const LAYOUT_TYPE: Readonly<Record<PptxLayoutType, string>> = {
  /**
   * Title Slide.
   */
  title: 'title',

  /**
   * Section Header.
   */
  section: 'secHead',

  /**
   * Title and Content.
   */
  content: 'obj',

  /**
   * Two Content.
   */
  'two-content': 'twoObj',

  /**
   * Title Only.
   */
  'title-only': 'titleOnly',

  /**
   * Blank.
   */
  blank: 'blank',
};

/**
 * The prompt text PowerPoint shows in an empty placeholder, by kind.
 */
const PROMPTS: Readonly<Record<PptxPlaceholderKind, string>> = {
  /**
   * The title.
   */
  title: 'Click to edit title',

  /**
   * The subtitle.
   */
  subtitle: 'Click to edit subtitle',

  /**
   * The body.
   */
  body: 'Click to edit text',

  /**
   * The picture.
   */
  picture: 'Click icon to add picture',
};

/**
 * The shared root of every slide's shape tree: the group properties PresentationML requires.
 */
export const SHAPE_TREE_ROOT =
  el('p:nvGrpSpPr', {}, el('p:cNvPr', { id: 1, name: '' }), el('p:cNvGrpSpPr'), el('p:nvPr')) +
  el(
    'p:grpSpPr',
    {},
    el(
      'a:xfrm',
      {},
      el('a:off', { x: 0, y: 0 }),
      el('a:ext', { cx: 0, cy: 0 }),
      el('a:chOff', { x: 0, y: 0 }),
      el('a:chExt', { cx: 0, cy: 0 }),
    ),
  );

/**
 * A slide master for one surface: its background, title and body placeholders, the brand's text
 * styles (theme fonts, type scale, colors through the theme), its chrome and its layouts.
 *
 * @param theme - The surface theme.
 * @param brand - The resolved brand, for the type scale and margins.
 * @param background - The background fill markup.
 * @param layoutIds - The layouts' ids and relationship ids, in order.
 * @param shapes - Shapes drawn on every slide of the master: the grain, the chrome and the slide
 *   number placeholder, with ids from 4.
 * @param lang - The language of the deck's text.
 */
export function masterXml(
  theme: SurfaceTheme,
  brand: BrandTokens,
  background: string,
  layoutIds: readonly { id: number; rId: string }[],
  shapes = '',
  lang = 'en-US',
): string {
  const rects = placeholderRects(brand);
  const placeholders = [
    placeholderShape(
      TITLE_SHAPE_ID,
      'Title',
      { type: 'title', idx: undefined },
      bodyless(rects.title),
      PROMPTS.title,
    ),
    placeholderShape(
      BODY_SHAPE_ID,
      'Text',
      { type: 'body', idx: 1 },
      bodyless(rects.body),
      PROMPTS.body,
    ),
  ];
  return (
    XML_DECLARATION +
    el(
      'p:sldMaster',
      PML_NAMESPACES,
      el(
        'p:cSld',
        { name: theme.surface },
        el('p:bg', {}, el('p:bgPr', {}, background, el('a:effectLst'))),
        el('p:spTree', {}, SHAPE_TREE_ROOT, shapes, ...placeholders),
      ),
      el('p:clrMap', COLOR_MAP),
      el(
        'p:sldLayoutIdLst',
        {},
        ...layoutIds.map((layout) => el('p:sldLayoutId', { id: layout.id, 'r:id': layout.rId })),
      ),
      textStylesXml(brand, theme, lang),
    )
  );
}

/**
 * The title and body boxes of a master: the title on the brand's top margin, the body below it.
 *
 * @param brand - The resolved brand, for the margins and type scale.
 */
function placeholderRects(brand: BrandTokens): { title: SceneRect; body: SceneRect } {
  const margin = brand.spacing.margin;
  const width = CANVAS_WIDTH_PX - 2 * margin.x;
  const headline = brand.typography.scale.headline;
  const titleRect = {
    x: margin.x,
    y: margin.y,
    width,
    height: headline.size * headline.lineHeight * TITLE_LINES,
  };
  const bodyTop = titleRect.y + titleRect.height + brand.spacing.scale.lg;
  const bodyRect = {
    x: margin.x,
    y: bodyTop,
    width,
    height: CANVAS_HEIGHT_PX - margin.y - bodyTop,
  };
  return { title: titleRect, body: bodyRect };
}

/**
 * The master's `p:txStyles`: the title style, the body style and the other text's style.
 *
 * @param brand - The resolved brand.
 * @param theme - The surface theme.
 * @param lang - The language of the deck's text.
 */
function textStylesXml(brand: BrandTokens, theme: SurfaceTheme, lang: string): string {
  return el(
    'p:txStyles',
    {},
    titleStyle(brand, lang),
    bodyStyle(brand, theme, lang),
    el(
      'p:otherStyle',
      {},
      levelStyle(1, brand.typography.scale.body.size, null, {
        typeface: '+mn-lt',
        lineHeight: brand.typography.scale.body.lineHeight,
        theme,
        lang,
      }),
    ),
  );
}

/**
 * A placeholder box with its rectangle, for {@link placeholderShape}.
 *
 * @param rect - The rectangle.
 */
function bodyless(rect: SceneRect): { rect: SceneRect; defaults: null } {
  return { rect, defaults: null };
}

/**
 * The master's title style: the brand's headline step in the display family.
 *
 * @param brand - The resolved brand.
 * @param lang - The language of the deck's text.
 */
function titleStyle(brand: BrandTokens, lang: string): string {
  const step = brand.typography.scale.headline;
  return el(
    'p:titleStyle',
    {},
    el(
      'a:lvl1pPr',
      {
        algn: 'l',
        defTabSz: DEFAULT_TAB_SIZE_EMU,
        rtl: 0,
        eaLnBrk: 1,
        latinLnBrk: 0,
        hangingPunct: 1,
      },
      el('a:lnSpc', {}, el('a:spcPct', { val: lineSpacingPercent(step.lineHeight) })),
      el('a:spcBef', {}, el('a:spcPct', { val: 0 })),
      el('a:buNone'),
      el(
        'a:defRPr',
        {
          lang,
          sz: fontSizeHundredths(step.size),
          b: step.weight >= BOLD_WEIGHT ? 1 : 0,
          kern: 0,
          spc: pointsHundredths(step.tracking * step.size),
        },
        el('a:solidFill', {}, el('a:schemeClr', { val: 'tx1' })),
        el('a:latin', { typeface: '+mj-lt' }),
        el('a:ea', { typeface: '+mj-ea' }),
        el('a:cs', { typeface: '+mj-cs' }),
      ),
    ),
  );
}

/**
 * The master's body style: the brand's body step with its square accent bullet on the first two
 * levels.
 *
 * @param brand - The resolved brand.
 * @param theme - The surface theme.
 * @param lang - The language of the deck's text.
 */
function bodyStyle(brand: BrandTokens, theme: SurfaceTheme, lang: string): string {
  const { size, lineHeight } = brand.typography.scale.body;
  const accent = `#${theme.colors.accent1}`;
  const level = { typeface: '+mn-lt', lineHeight, theme, lang };
  return el(
    'p:bodyStyle',
    {},
    levelStyle(1, size, accent, level),
    levelStyle(2, size * SECOND_LEVEL_SIZE_SHARE, accent, level),
    levelStyle(3, size * THIRD_LEVEL_SIZE_SHARE, null, level),
  );
}

/**
 * One level of a text style.
 *
 * @param level - The level, 1 to 9.
 * @param size - The font size in canvas pixels.
 * @param bullet - The bullet color, or `null` for no bullet.
 * @param options - What every level shares: the typeface or theme reference, the CSS line height,
 *   the surface theme and the language of the deck's text.
 */
function levelStyle(
  level: number,
  size: number,
  bullet: string | null,
  options: { typeface: string; lineHeight: number; theme: SurfaceTheme; lang: string },
): string {
  const { typeface, lineHeight, theme, lang } = options;
  const indent = size * LEVEL_INDENT_EM;
  const marL = bullet === null ? 0 : pxToEmu(indent * level);
  const marker = bullet === null ? el('a:buNone') : bulletXml(bullet, theme);
  return el(
    `a:lvl${level}pPr`,
    {
      marL,
      indent: bullet === null ? 0 : -pxToEmu(indent),
      algn: 'l',
      defTabSz: DEFAULT_TAB_SIZE_EMU,
    },
    el('a:lnSpc', {}, el('a:spcPct', { val: lineSpacingPercent(lineHeight) })),
    el('a:spcBef', {}, el('a:spcPts', { val: pointsHundredths(size * LEVEL_SPACE_BEFORE_EM) })),
    marker,
    el(
      'a:defRPr',
      { lang, sz: fontSizeHundredths(size), kern: 0 },
      el('a:solidFill', {}, el('a:schemeClr', { val: 'tx1' })),
      el('a:latin', { typeface }),
      el('a:ea', { typeface: '+mn-ea' }),
      el('a:cs', { typeface: '+mn-cs' }),
    ),
  );
}

/**
 * The square bullet of an outline level: its color, its size and its glyph in Arial.
 *
 * @param color - The bullet's color.
 * @param theme - The surface theme.
 */
function bulletXml(color: string, theme: SurfaceTheme): string {
  return (
    el('a:buClr', {}, colorXml(color, theme)) +
    el('a:buSzPct', { val: BULLET_SIZE_UNITS }) +
    el('a:buFont', {
      typeface: 'Arial',
      panose: '020B0604020202020204',
      pitchFamily: 34,
      charset: 0,
    }) +
    el('a:buChar', { char: '■' })
  );
}

/**
 * Where a placeholder sits and the text style its runs inherit.
 */
type PlaceholderBox = {
  /**
   * Where it sits.
   */
  rect: SceneRect;

  /**
   * Its first level's style, or `null` for the master's.
   */
  defaults: TextDefaults | null;
};

/**
 * A placeholder shape on a master or layout, with PowerPoint's prompt text, wrapping and shrinking
 * text on overflow as PowerPoint's placeholders do.
 *
 * @param id - The shape id.
 * @param name - Its name.
 * @param ref - The placeholder type and index.
 * @param box - Where it sits and its text style.
 * @param prompt - The prompt text.
 * @param theme - The surface theme, for the style's colors.
 */
function placeholderShape(
  id: number,
  name: string,
  ref: PlaceholderRef,
  box: PlaceholderBox,
  prompt: string,
  theme: SurfaceTheme | null = null,
): string {
  const listStyle =
    box.defaults === null || theme === null ? el('a:lstStyle') : listStyleXml(box.defaults, theme);
  return el(
    'p:sp',
    {},
    el(
      'p:nvSpPr',
      {},
      cNvPr(id, name),
      el('p:cNvSpPr', {}, el('a:spLocks', { noGrp: 1 })),
      el('p:nvPr', {}, el('p:ph', { type: ref.type, idx: ref.idx })),
    ),
    el('p:spPr', {}, xfrm(box.rect)),
    el(
      'p:txBody',
      {},
      el(
        'a:bodyPr',
        {
          vert: 'horz',
          wrap: 'square',
          lIns: 0,
          tIns: 0,
          rIns: 0,
          bIns: 0,
          rtlCol: 0,
          anchor: 't',
        },
        el('a:normAutofit'),
      ),
      listStyle,
      el('a:p', {}, el('a:r', {}, el('a:t', {}, prompt))),
    ),
  );
}

/**
 * A slide layout: named after the deck layout (or a brand layout's label), typed for PowerPoint,
 * with its placeholders where the deck draws them in the style the deck sets them in, and its own
 * chrome when it differs from the master's (then the master's shapes are hidden on it).
 *
 * @param spec - The layout.
 * @param theme - The master's theme.
 * @param shapes - The layout's own chrome and slide number placeholder, with ids from 100.
 */
export function layoutXml(spec: LayoutSpec, theme: SurfaceTheme, shapes = ''): string {
  const placeholders = spec.placeholders.map((placeholder, index) =>
    placeholderShape(
      index + 2,
      placeholder.kind === 'title'
        ? 'Title'
        : `${placeholder.kind[0]?.toUpperCase() ?? ''}${placeholder.kind.slice(1)}`,
      placeholder.ref,
      placeholder,
      PROMPTS[placeholder.kind],
      theme,
    ),
  );
  return (
    XML_DECLARATION +
    el(
      'p:sldLayout',
      {
        ...PML_NAMESPACES,
        showMasterSp: spec.chrome === null ? undefined : 0,
        type: LAYOUT_TYPE[spec.type],
        preserve: 1,
      },
      el(
        'p:cSld',
        { name: spec.label ?? spec.name },
        el('p:spTree', {}, SHAPE_TREE_ROOT, shapes, ...placeholders),
      ),
      el('p:clrMapOvr', {}, el('a:masterClrMapping')),
    )
  );
}

/**
 * The master background fill for a surface: a theme color, the gradient's stops, or a picture.
 *
 * @param theme - The surface theme.
 * @param pictureId - The relationship id of the background picture, or `null`.
 */
export function masterBackground(theme: SurfaceTheme, pictureId: string | null): string {
  if (pictureId !== null) {
    return el(
      'a:blipFill',
      { dpi: 0, rotWithShape: 1 },
      el('a:blip', { 'r:embed': pictureId }),
      el('a:srcRect'),
      el('a:stretch', {}, el('a:fillRect')),
    );
  }

  return paintFill(theme.background, theme);
}

/**
 * The notes master: a slide picture above the notes text, in the body font and the deck's language.
 *
 * @param lang - The language of the deck's text.
 */
export function notesMasterXml(lang = 'en-US'): string {
  const notesLevel = el(
    'a:lvl1pPr',
    { marL: 0, algn: 'l', defTabSz: DEFAULT_TAB_SIZE_EMU },
    el(
      'a:defRPr',
      { lang, sz: NOTES_TEXT_SIZE_HUNDREDTHS, kern: 0 },
      el('a:solidFill', {}, el('a:schemeClr', { val: 'tx1' })),
      el('a:latin', { typeface: '+mn-lt' }),
    ),
  );
  return (
    XML_DECLARATION +
    el(
      'p:notesMaster',
      PML_NAMESPACES,
      el(
        'p:cSld',
        {},
        el('p:bg', {}, el('p:bgRef', { idx: 1001 }, el('a:schemeClr', { val: 'bg1' }))),
        el('p:spTree', {}, SHAPE_TREE_ROOT, notesMasterImageXml(), notesMasterBodyXml()),
      ),
      el('p:clrMap', COLOR_MAP),
      el('p:notesStyle', {}, notesLevel),
    )
  );
}

/**
 * The slide picture of the notes master: an outlined rectangle where the slide sits.
 */
function notesMasterImageXml(): string {
  return el(
    'p:sp',
    {},
    el(
      'p:nvSpPr',
      {},
      cNvPr(SLIDE_IMAGE_SHAPE_ID, SLIDE_IMAGE_NAME),
      el('p:cNvSpPr', {}, el('a:spLocks', { noGrp: 1, noRot: 1, noChangeAspect: 1 })),
      el('p:nvPr', {}, el('p:ph', { type: 'sldImg', idx: 2 })),
    ),
    el(
      'p:spPr',
      {},
      el(
        'a:xfrm',
        {},
        el('a:off', { x: NOTES_SLIDE_IMAGE_EMU.x, y: NOTES_SLIDE_IMAGE_EMU.y }),
        el('a:ext', { cx: NOTES_SLIDE_IMAGE_EMU.cx, cy: NOTES_SLIDE_IMAGE_EMU.cy }),
      ),
      el('a:prstGeom', { prst: 'rect' }, el('a:avLst')),
      el('a:noFill'),
      el(
        'a:ln',
        { w: SLIDE_IMAGE_OUTLINE_EMU },
        el('a:solidFill', {}, el('a:prstClr', { val: 'black' })),
      ),
    ),
  );
}

/**
 * The notes text box of the notes master: a placeholder for the speaker notes, with the notes
 * insets and a prompt.
 */
function notesMasterBodyXml(): string {
  return el(
    'p:sp',
    {},
    el(
      'p:nvSpPr',
      {},
      cNvPr(NOTES_BODY_SHAPE_ID, NOTES_BODY_NAME),
      el('p:cNvSpPr', {}, el('a:spLocks', { noGrp: 1 })),
      el('p:nvPr', {}, el('p:ph', { type: 'body', sz: 'quarter', idx: 1 })),
    ),
    el(
      'p:spPr',
      {},
      el(
        'a:xfrm',
        {},
        el('a:off', { x: NOTES_BODY_EMU.x, y: NOTES_BODY_EMU.y }),
        el('a:ext', { cx: NOTES_BODY_EMU.cx, cy: NOTES_BODY_EMU.cy }),
      ),
      el('a:prstGeom', { prst: 'rect' }, el('a:avLst')),
    ),
    el(
      'p:txBody',
      {},
      el('a:bodyPr', {
        vert: 'horz',
        lIns: NOTES_BODY_INSET_EMU.horizontal,
        tIns: NOTES_BODY_INSET_EMU.vertical,
        rIns: NOTES_BODY_INSET_EMU.horizontal,
        bIns: NOTES_BODY_INSET_EMU.vertical,
        rtlCol: 0,
      }),
      el('a:lstStyle'),
      el('a:p', {}, el('a:r', {}, el('a:t', {}, NOTES_BODY_NAME))),
    ),
  );
}

/**
 * A notes slide: the slide picture and the speaker notes, one paragraph per blank-line-separated
 * block.
 *
 * @param notes - The notes text.
 */
export function notesSlideXml(notes: string): string {
  const paragraphs = notes
    .split(PARAGRAPH_BREAK)
    .map((block) => block.trim())
    .filter((block) => block !== '')
    .map((block) =>
      el('a:p', {}, el('a:r', {}, el('a:t', {}, escapeXml(block.replace(LINE_BREAK, ' '))))),
    );
  const image = el(
    'p:sp',
    {},
    el(
      'p:nvSpPr',
      {},
      cNvPr(SLIDE_IMAGE_SHAPE_ID, SLIDE_IMAGE_NAME),
      el('p:cNvSpPr', {}, el('a:spLocks', { noGrp: 1, noRot: 1, noChangeAspect: 1 })),
      el('p:nvPr', {}, el('p:ph', { type: 'sldImg', idx: 2 })),
    ),
    el('p:spPr'),
  );
  return (
    XML_DECLARATION +
    el(
      'p:notes',
      PML_NAMESPACES,
      el('p:cSld', {}, el('p:spTree', {}, SHAPE_TREE_ROOT, image, notesSlideBodyXml(paragraphs))),
      el('p:clrMapOvr', {}, el('a:masterClrMapping')),
    )
  );
}

/**
 * The speaker notes' text box of a notes slide: its paragraphs, or one empty paragraph when there
 * are none.
 *
 * @param paragraphs - The notes' paragraphs.
 */
function notesSlideBodyXml(paragraphs: readonly string[]): string {
  return el(
    'p:sp',
    {},
    el(
      'p:nvSpPr',
      {},
      cNvPr(NOTES_BODY_SHAPE_ID, NOTES_BODY_NAME),
      el('p:cNvSpPr', {}, el('a:spLocks', { noGrp: 1 })),
      el('p:nvPr', {}, el('p:ph', { type: 'body', idx: 1 })),
    ),
    el('p:spPr'),
    el(
      'p:txBody',
      {},
      el('a:bodyPr'),
      el('a:lstStyle'),
      ...(paragraphs.length === 0 ? [el('a:p')] : paragraphs),
    ),
  );
}
