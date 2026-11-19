import type { OpcPackage } from '#ooxml/opc-package.ts';
import type { ChromeShape } from '#pptx/chrome.ts';
import type { SlideNumberSpec } from '#pptx/layout-specs.ts';
import type { IdAllocator } from '#pptx/shape-xml.ts';
import type { TextContext } from '#pptx/text-xml.ts';

import { el } from '#ooxml/xml.ts';
import { textFrameXml } from '#pptx/frame-xml.ts';
import { SLIDE_NUMBER_IDX } from '#pptx/layout-specs.ts';
import { embedMedia } from '#pptx/media.ts';
import { cNvPr, NO_CROP, pictureXml, xfrm } from '#pptx/shape-xml.ts';
import { listStyleXml } from '#pptx/text-xml.ts';

/**
 * The text PowerPoint shows in a slide number field on a master or layout.
 */
const SLIDE_NUMBER_PROMPT = '‹#›';

/**
 * The selection-pane name of a slide number placeholder.
 */
const SLIDE_NUMBER_NAME = 'Slide Number';

/**
 * The page chrome a master, layout or slide draws as shapes: the logo as a picture (its SVG with
 * the captured PNG as fallback) and the footer text as a text box. The page number is a slide
 * number placeholder, written separately.
 *
 * @param pkg - The package, for the logo's files.
 * @param partPath - The part the shapes go in.
 * @param shapes - The chrome.
 * @param nextId - Allocates shape ids.
 * @param context - The text context of the part's surface.
 * @param brandLabel - The brand's name, for the logo's alt text.
 */
export function chromeXml(
  pkg: OpcPackage,
  partPath: string,
  shapes: readonly ChromeShape[],
  nextId: IdAllocator,
  context: TextContext,
  brandLabel: string,
): string {
  return shapes
    .map((shape) => {
      const { node } = shape;
      if (shape.kind === 'logo' && node.kind === 'image') {
        const file = shape.slide.assets.images.get(node.src);
        const fallback = shape.slide.assets.pictures.get(node.id);
        const isSvg = file?.extension === 'svg';
        const raster = isSvg || file === undefined ? fallback : file;
        if (raster === undefined) {
          return '';
        }

        const imageId = embedMedia(pkg, partPath, raster);
        const svgId = isSvg && file !== undefined ? embedMedia(pkg, partPath, file) : undefined;
        return pictureXml(node.rect, nextId(), {
          imageId,
          ...(svgId === undefined ? {} : { svgId }),
          name: 'Logo',
          descr: node.alt === '' ? `${brandLabel} logo` : node.alt,
          crop: file === undefined ? NO_CROP : node.crop,
          radii: node.radii,
        });
      }

      if (shape.kind === 'footer' && node.kind === 'text') {
        return textFrameXml(node.paragraphs, nextId(), 'Footer', context, null);
      }

      return '';
    })
    .join('');
}

/**
 * The slide number placeholder of a master or layout: where the number sits, its text style, and a
 * slide number field.
 *
 * @param spec - Where and how.
 * @param id - The shape id.
 * @param context - The text context of the part's surface.
 */
export function slideNumberPlaceholderXml(
  spec: SlideNumberSpec,
  id: number,
  context: TextContext,
): string {
  return el(
    'p:sp',
    {},
    el(
      'p:nvSpPr',
      {},
      cNvPr(id, SLIDE_NUMBER_NAME),
      el('p:cNvSpPr', {}, el('a:spLocks', { noGrp: 1 })),
      el('p:nvPr', {}, el('p:ph', { type: 'sldNum', sz: 'quarter', idx: SLIDE_NUMBER_IDX })),
    ),
    el('p:spPr', {}, xfrm(spec.rect)),
    el(
      'p:txBody',
      {},
      el(
        'a:bodyPr',
        { vert: 'horz', wrap: 'none', lIns: 0, tIns: 0, rIns: 0, bIns: 0, rtlCol: 0, anchor: 't' },
        el('a:noAutofit'),
      ),
      spec.defaults === null ? el('a:lstStyle') : listStyleXml(spec.defaults, context.theme),
      el(
        'a:p',
        {},
        el(
          'a:fld',
          { id: '{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}', type: 'slidenum' },
          el('a:t', {}, SLIDE_NUMBER_PROMPT),
        ),
      ),
    ),
  );
}

/**
 * A slide's slide number: the placeholder, inheriting its place from the layout, with a slide
 * number field and the file's slide count where the deck's page number shows the total.
 *
 * @param shape - The page number chrome measured on the slide.
 * @param spec - The layout's (or master's) slide number placeholder.
 * @param id - The shape id.
 * @param context - The slide's text context, with its slide number and totals.
 */
export function slideNumberXml(
  shape: ChromeShape,
  spec: SlideNumberSpec | null,
  id: number,
  context: TextContext,
): string {
  if (shape.node.kind !== 'text') {
    return '';
  }

  return textFrameXml(
    shape.node.paragraphs,
    id,
    SLIDE_NUMBER_NAME,
    // Every property is written: renderers do not all apply a slide number placeholder's list style
    // to its field.
    { ...context, defaults: null, explicit: true },
    { type: 'sldNum', idx: SLIDE_NUMBER_IDX },
    { layoutRect: spec?.rect ?? null },
  );
}
