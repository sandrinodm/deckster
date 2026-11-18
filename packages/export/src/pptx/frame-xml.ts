import type { TextContext } from '#pptx/text-xml.ts';
import type { SceneParagraph, SceneRect } from '#scene/scene.ts';

import { el, escapeXml } from '#ooxml/xml.ts';
import { cNvPr, xfrm } from '#pptx/shape-xml.ts';
import { layoutFrame, paragraphsXml } from '#pptx/text-xml.ts';

/**
 * A PowerPoint placeholder a text frame fills: its type and index on the layout.
 */
export type PlaceholderRef = {
  /**
   * `title`, `ctrTitle` (a title slide's title), `subTitle`, `body`, `pic` (a picture) or `sldNum`
   * (the slide number).
   */
  type: 'title' | 'ctrTitle' | 'subTitle' | 'body' | 'pic' | 'sldNum';

  /**
   * The placeholder index on the layout; titles have none.
   */
  idx: number | undefined;
};

/**
 * The body properties of a text frame: no insets, top-anchored; text wraps in the frame (which is
 * as wide as the area that reproduces the browser's line breaks) unless no paragraph wraps. A
 * placeholder shrinks text that overflows it, as PowerPoint's own placeholders do; a text box grows
 * to fit what is typed into it.
 *
 * @param wraps - Whether the text wraps.
 * @param placeholder - Whether the frame is a placeholder.
 */
export function frameBodyProperties(wraps: boolean, placeholder: boolean): string {
  let autofit = el('a:noAutofit');
  if (placeholder) {
    autofit = el('a:normAutofit');
  } else if (wraps) {
    autofit = el('a:spAutoFit');
  }

  return el(
    'a:bodyPr',
    {
      wrap: wraps ? 'square' : 'none',
      lIns: 0,
      tIns: 0,
      rIns: 0,
      bIns: 0,
      rtlCol: 0,
      anchor: 't',
      anchorCtr: 0,
    },
    autofit,
  );
}

/**
 * A text frame: a text box, or a placeholder when it fills one, positioned where the browser drew
 * its lines.
 *
 * @param paragraphs - The paragraphs, top to bottom.
 * @param id - The shape id.
 * @param name - The name the selection pane shows.
 * @param context - The slide's theme, fonts and links.
 * @param placeholder - The placeholder it fills, or `null` for a free text box.
 */
export function textFrameXml(
  paragraphs: readonly SceneParagraph[],
  id: number,
  name: string,
  context: TextContext,
  placeholder: PlaceholderRef | null,
  extras: FrameExtras = {},
): string {
  const layout = layoutFrame(paragraphs);
  const descr = extras.descr ?? '';
  const inherited =
    placeholder !== null &&
    extras.layoutRect !== undefined &&
    extras.layoutRect !== null &&
    sameRect(extras.layoutRect, layout.rect);
  const nvPr =
    placeholder === null
      ? el('p:nvPr')
      : el('p:nvPr', {}, el('p:ph', { type: placeholder.type, idx: placeholder.idx }));
  const locks =
    placeholder === null
      ? el('p:cNvSpPr', { txBox: 1 })
      : el('p:cNvSpPr', {}, el('a:spLocks', { noGrp: 1 }));
  return el(
    'p:sp',
    {},
    el('p:nvSpPr', {}, cNvPr(id, name, descr === '' ? {} : { descr }), locks, nvPr),
    inherited
      ? el('p:spPr')
      : el(
          'p:spPr',
          {},
          xfrm(layout.rect),
          el('a:prstGeom', { prst: 'rect' }, el('a:avLst')),
          el('a:noFill'),
        ),
    el(
      'p:txBody',
      {},
      frameBodyProperties(layout.wraps, placeholder !== null),
      el('a:lstStyle'),
      paragraphsXml(layout, context),
    ),
  );
}

/**
 * What else a text frame may say about itself.
 */
export type FrameExtras = {
  /**
   * The alternative text, such as the full text of an outlined title.
   */
  descr?: string;

  /**
   * Where the layout's placeholder sits; a placeholder frame in the same place leaves its position
   * to the layout.
   */
  layoutRect?: SceneRect | null;
};

/**
 * The largest difference, in canvas pixels, between two frames that count as in the same place.
 */
const SAME_RECT_TOLERANCE_PX = 1;

/**
 * The height of an off-slide placeholder, in canvas pixels.
 */
export const OFF_SLIDE_HEIGHT_PX = 80;

/**
 * The gap between an off-slide placeholder and the slide's top edge, in canvas pixels.
 */
export const OFF_SLIDE_GAP_PX = 20;

/**
 * Whether two rectangles are the same within {@link SAME_RECT_TOLERANCE_PX}.
 *
 * @param a - A rectangle.
 * @param b - Another.
 */
export function sameRect(a: SceneRect, b: SceneRect): boolean {
  return (
    Math.abs(a.x - b.x) <= SAME_RECT_TOLERANCE_PX &&
    Math.abs(a.y - b.y) <= SAME_RECT_TOLERANCE_PX &&
    Math.abs(a.width - b.width) <= SAME_RECT_TOLERANCE_PX &&
    Math.abs(a.height - b.height) <= SAME_RECT_TOLERANCE_PX
  );
}

/**
 * A placeholder holding plain text that the layout does not draw, such as a statement slide's
 * title: placed just above the slide so outline view, the accessibility checker and screen readers
 * have it while the slide looks as designed.
 *
 * @param text - The text.
 * @param id - The shape id.
 * @param placeholder - The placeholder.
 * @param slideWidthPx - The slide width in canvas pixels.
 */
export function offSlidePlaceholderXml(
  text: string,
  id: number,
  placeholder: PlaceholderRef,
  slideWidthPx: number,
): string {
  return el(
    'p:sp',
    {},
    el(
      'p:nvSpPr',
      {},
      cNvPr(id, 'Title'),
      el('p:cNvSpPr', {}, el('a:spLocks', { noGrp: 1 })),
      el('p:nvPr', {}, el('p:ph', { type: placeholder.type, idx: placeholder.idx })),
    ),
    el(
      'p:spPr',
      {},
      xfrm({
        x: 0,
        y: -OFF_SLIDE_HEIGHT_PX - OFF_SLIDE_GAP_PX,
        width: slideWidthPx,
        height: OFF_SLIDE_HEIGHT_PX,
      }),
    ),
    el(
      'p:txBody',
      {},
      el('a:bodyPr', { wrap: 'none' }, el('a:noAutofit')),
      el('a:lstStyle'),
      el('a:p', {}, el('a:r', {}, el('a:t', {}, escapeXml(text)))),
    ),
  );
}
