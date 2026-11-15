import { parseHash } from '@deckster/engine/hash';
import {
  beginMarkedContent,
  concatTransformationMatrix,
  decodePDFRawStream,
  drawObject,
  endMarkedContent,
  popGraphicsState,
  pushGraphicsState,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib';

import { dedupeResources } from '#pdf/dedupe-objects.ts';
import { writeMetadata, writePageLabels } from '#pdf/pdf-metadata.ts';
import { recompressImages, type JpegEncoder } from '#pdf/recompress-images.ts';
import {
  copyPageWithStructure,
  finishStructure,
  structureState,
  type StructureState,
} from '#pdf/struct-tree.ts';

/**
 * The path Chromium prints for slide links before they become PDF destinations.
 */
const SLIDE_LINK_PATH = '/__deck-slide/';

/**
 * Matches a marked-content sequence tied to a structure element: its tag, then a property list with
 * an `/MCID`, then `BDC`.
 */
const MCID_PATTERN = /\/([A-Za-z0-9_]+)\s*<<\s*\/MCID\s+\d+\s*>>\s*BDC/g;

/**
 * Matches the leading slash of a relative link URL, which the export drops.
 */
const LEADING_SLASH_PATTERN = /^\//;

/**
 * The newline byte between joined content streams.
 */
const NEWLINE = 0x0a;

/**
 * One printed page: a deck slide at one step.
 */
export type PrintedPage = {
  /**
   * The one-page PDF Chromium printed.
   */
  pdf: Uint8Array;

  /**
   * The deck slide's zero-based index.
   */
  slideIndex: number;

  /**
   * The slide title, for the outline.
   */
  title: string;

  /**
   * The page label the viewer shows: the slide number, or `3.2` for the second step of slide 3.
   */
  label: string;
};

/**
 * A notes page: the notes laid out by Chromium with a box left for the slide.
 */
export type NotesPage = {
  /**
   * The one-page PDF of the notes.
   */
  pdf: Uint8Array;

  /**
   * The deck slide's zero-based index.
   */
  slideIndex: number;

  /**
   * Which of the slide's notes pages this is, from 1. Notes too long for one page continue on
   * further pages.
   */
  part: number;

  /**
   * Where the slide goes on the page, in PDF points from the bottom-left corner, or `null` on a
   * continuation page, which has no slide.
   */
  slideBox: { x: number; y: number; width: number; height: number } | null;
};

/**
 * What goes into the document.
 */
export type AssembleOptions = {
  /**
   * The deck title, set as the document title shown in the viewer's title bar.
   */
  title: string;

  /**
   * The author, or `null` when the deck names none.
   */
  author: string | null;

  /**
   * The document language as a BCP 47 tag, such as `en-US`: the brand's number locale.
   */
  language: string;

  /**
   * When the document was made.
   */
  date: Date;

  /**
   * Encodes large rasterised photos as JPEG, or `null` to keep them lossless.
   */
  encodeJpeg: JpegEncoder | null;

  /**
   * The slide pages, in order.
   */
  pages: readonly PrintedPage[];

  /**
   * Notes pages, appended after the slides under a "Speaker notes" bookmark; empty for none.
   */
  notes: readonly NotesPage[];

  /**
   * The origin the deck was served from, such as `http://127.0.0.1:5173`: links to it with a slide
   * hash become links to that slide's page.
   */
  origin: string;

  /**
   * The complete slide ids in deck order, including slides omitted from this export.
   */
  slideIds: readonly string[];
};

/**
 * What the assembled document holds, for the report and tests.
 */
export type AssembledPdf = {
  /**
   * The PDF bytes.
   */
  bytes: Uint8Array;

  /**
   * The number of pages.
   */
  pageCount: number;

  /**
   * The outline entries, in order.
   */
  outline: string[];

  /**
   * Links rewritten to point at a page of the document.
   */
  internalLinks: number;

  /**
   * Links left pointing outside the document.
   */
  externalLinks: number;

  /**
   * The page labels, in page order.
   */
  labels: string[];

  /**
   * Whether the document carries Chromium's structure tree (a tagged PDF).
   */
  tagged: boolean;

  /**
   * Identical images, fonts and patterns merged across pages.
   */
  merged: number;

  /**
   * Rasterised photos stored as JPEG.
   */
  jpegImages: number;
};

/**
 * The pages copied into the document so far, with what the labels and the outline need.
 */
type CopiedPages = {
  /**
   * The copied pages: the slide pages first, then the notes pages.
   */
  pages: PDFPage[];

  /**
   * The page label of each page, in page order.
   */
  labels: string[];

  /**
   * The index in `pages` of each slide's first page, by slide index.
   */
  firstPageOfSlide: Map<number, number>;

  /**
   * The index in `pages` of the first notes page.
   */
  notesStart: number;

  /**
   * The last copied page of each slide, by slide index: the page a notes page draws its slide from.
   */
  lastPageOfSlide: Map<number, PDFPage>;
};

/**
 * Merges Chromium's one-page PDFs into one document: the pages in order with their vector text,
 * embedded font subsets, link annotations and structure tree (when Chromium tagged them), links to
 * another slide of the deck turned into links to that slide's page, an outline with one bookmark
 * per slide (its first page), page labels, the title, author and language in the Info dictionary
 * and an XMP stream, and notes pages with the slide drawn from its page in this document. Identical
 * resources (a photo on two slides, a gradient's grain tile, a font program) are then stored once,
 * and large rasterised photos are stored as JPEG.
 *
 * @param options - The pages, notes, metadata and deck origin.
 * @returns The document and what it holds.
 */
export async function assemblePdf(options: AssembleOptions): Promise<AssembledPdf> {
  const document = await PDFDocument.create({ updateMetadata: false });
  writeMetadata(document, {
    title: options.title,
    author: options.author,
    language: options.language,
    date: options.date,
  });
  const structure = structureState();
  const { pages, labels, firstPageOfSlide, notesStart } = await copyPages(
    document,
    options,
    structure,
  );
  const pageRefs = pages.map((page) => page.ref);
  const links = rewriteLinks(document, pageRefs, firstPageOfSlide, options);
  const outline = writeOutline(
    document,
    options.pages,
    firstPageOfSlide,
    pageRefs,
    options.notes.length > 0 ? notesStart : null,
  );
  writePageLabels(document, labels);
  const tagged = finishStructure(document, structure);
  const { merged } = dedupeResources(document);
  const recompressed =
    options.encodeJpeg === null
      ? { images: 0 }
      : await recompressImages(document, options.encodeJpeg);
  const bytes = await document.save();
  return {
    bytes,
    pageCount: document.getPageCount(),
    outline,
    ...links,
    labels,
    tagged,
    merged,
    jpegImages: recompressed.images,
  };
}

/**
 * Copies the slide pages and then the notes pages into the document, in that order.
 *
 * @param document - The document.
 * @param options - The slide pages and notes pages to copy.
 * @param structure - The structure tree being merged; updated.
 * @returns The copied pages, their labels, and where the notes start.
 */
async function copyPages(
  document: PDFDocument,
  options: AssembleOptions,
  structure: StructureState,
): Promise<CopiedPages> {
  const copied: CopiedPages = {
    pages: [],
    labels: [],
    firstPageOfSlide: new Map(),
    notesStart: 0,
    lastPageOfSlide: new Map(),
  };
  await copySlidePages(document, options.pages, structure, copied);
  copied.notesStart = copied.pages.length;
  await copyNotesPages(document, options, structure, copied);
  return copied;
}

/**
 * Copies the slide pages in order and records the first page of each slide. A page the copy rejects
 * is skipped.
 *
 * @param document - The document.
 * @param printed - The slide pages, in order.
 * @param structure - The structure tree being merged; updated.
 * @param copied - The pages copied so far; updated.
 */
async function copySlidePages(
  document: PDFDocument,
  printed: readonly PrintedPage[],
  structure: StructureState,
  copied: CopiedPages,
): Promise<void> {
  for (const slide of printed) {
    const page = copyPageWithStructure(document, await PDFDocument.load(slide.pdf), structure);
    if (page === null) {
      continue;
    }

    copied.pages.push(page);
    copied.labels.push(slide.label);
    copied.lastPageOfSlide.set(slide.slideIndex, page);
    if (!copied.firstPageOfSlide.has(slide.slideIndex)) {
      copied.firstPageOfSlide.set(slide.slideIndex, copied.pages.length - 1);
    }
  }
}

/**
 * Copies each notes page and draws its slide into the notes page's box. A notes page the copy
 * rejects is skipped.
 *
 * @param document - The document.
 * @param options - The slide pages, which the slides are drawn from, and the notes pages.
 * @param structure - The structure tree being merged; updated.
 * @param copied - The pages copied so far; updated.
 */
async function copyNotesPages(
  document: PDFDocument,
  options: AssembleOptions,
  structure: StructureState,
  copied: CopiedPages,
): Promise<void> {
  for (const notes of options.notes) {
    const page = copyPageWithStructure(document, await PDFDocument.load(notes.pdf), structure);
    if (page === null) {
      continue;
    }

    copied.pages.push(page);
    copied.labels.push(notesLabel(notes));
    drawSlide(document, page, notes, copied.lastPageOfSlide);
  }
}

/**
 * The page label of a notes page: `Notes 3`, and `Notes 3 (2)` for the second page of its notes.
 *
 * @param notes - The notes page.
 */
function notesLabel(notes: NotesPage): string {
  const base = `Notes ${notes.slideIndex + 1}`;
  return notes.part > 1 ? `${base} (${notes.part})` : base;
}

/**
 * Draws the slide into a notes page's slide box as a form XObject made from the slide's own page in
 * this document, so the notes page shares that page's images and fonts instead of copying them. The
 * slide's marked-content ids are dropped from the copy and the drawing is marked as an artifact, so
 * screen readers read the slide once, on its own page.
 *
 * @param document - The document.
 * @param page - The notes page.
 * @param notes - The notes page's slide and box.
 * @param slidePages - The last copied page of each slide, by slide index; a slide whose page could
 *   not be copied has none, so the box stays empty rather than showing another slide.
 */
function drawSlide(
  document: PDFDocument,
  page: PDFPage,
  notes: NotesPage,
  slidePages: ReadonlyMap<number, PDFPage>,
): void {
  const box = notes.slideBox;
  const slidePage = slidePages.get(notes.slideIndex);
  const resources = slidePage?.node.get(PDFName.of('Resources'));
  if (box === null || slidePage === undefined || resources === undefined) {
    return;
  }

  const { width, height } = slidePage.getSize();
  const content = withoutMarkedContentIds(pageContents(slidePage));
  const form = document.context.flateStream(content, {
    Type: 'XObject',
    Subtype: 'Form',
    FormType: 1,
    BBox: [0, 0, width, height],
    Resources: resources,
  });
  const name = page.node.newXObject('Slide', document.context.register(form));
  page.pushOperators(
    beginMarkedContent('Artifact'),
    pushGraphicsState(),
    concatTransformationMatrix(box.width / width, 0, 0, box.height / height, box.x, box.y),
    drawObject(name),
    popGraphicsState(),
    endMarkedContent(),
  );
}

/**
 * A page's content streams, decoded and joined.
 *
 * @param page - The page.
 */
function pageContents(page: PDFPage): Uint8Array {
  const contents = page.node.normalizedEntries().Contents;
  const parts: Uint8Array[] = [];
  for (let index = 0; contents !== undefined && index < contents.size(); index += 1) {
    const stream = contents.lookup(index);
    if (stream instanceof PDFRawStream) {
      parts.push(decodePDFRawStream(stream).decode(), Uint8Array.of(NEWLINE));
    }
  }

  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }

  return joined;
}

/**
 * Content with every marked-content sequence that names a structure element (`/P <</MCID 3>> BDC`)
 * turned into a plain one (`/P BMC`), for a copy of a page drawn on another page.
 *
 * @param content - Decoded content stream bytes.
 */
export function withoutMarkedContentIds(content: Uint8Array): Uint8Array {
  const text = Buffer.from(content).toString('latin1');
  const replaced = text.replace(MCID_PATTERN, '/$1 BMC');
  return new Uint8Array(Buffer.from(replaced, 'latin1'));
}

/**
 * Turns links to the deck's own slides into links to their pages.
 *
 * @param document - The document.
 * @param pageRefs - Every page.
 * @param firstPageOfSlide - The first page of each slide.
 * @param options - The deck origin and complete slide ids.
 */
function rewriteLinks(
  document: PDFDocument,
  pageRefs: readonly PDFRef[],
  firstPageOfSlide: ReadonlyMap<number, number>,
  options: Pick<AssembleOptions, 'origin' | 'slideIds'>,
): { internalLinks: number; externalLinks: number } {
  const { origin, slideIds } = options;
  let internalLinks = 0;
  let externalLinks = 0;
  for (const page of document.getPages()) {
    for (const annotation of linkAnnotations(page)) {
      const action = annotation.lookupMaybe(PDFName.of('A'), PDFDict);
      const uri = action?.lookupMaybe(PDFName.of('URI'), PDFString, PDFHexString)?.decodeText();
      if (action === undefined || uri === undefined) {
        continue;
      }

      const target = internalTarget(uri, origin, firstPageOfSlide, slideIds);
      const targetRef = target === null ? undefined : pageRefs[target];
      if (targetRef === undefined && slideHash(uri, origin) !== null) {
        annotation.delete(PDFName.of('A'));
        annotation.delete(PDFName.of('Dest'));
        continue;
      }

      if (targetRef === undefined && hasOrigin(uri, origin)) {
        // A relative link resolved against the export's temporary server leads nowhere.
        const relative = uri.slice(origin.length).replace(LEADING_SLASH_PATTERN, '');
        action.set(PDFName.of('URI'), PDFString.of(relative));
        continue;
      }

      if (targetRef === undefined) {
        externalLinks += 1;
        continue;
      }

      annotation.delete(PDFName.of('A'));
      annotation.set(PDFName.of('Dest'), document.context.obj([targetRef, PDFName.of('Fit')]));
      internalLinks += 1;
    }
  }

  return { internalLinks, externalLinks };
}

/**
 * The link annotations of a page.
 *
 * @param page - The page.
 */
function linkAnnotations(page: PDFPage): PDFDict[] {
  const annotations = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (annotations === undefined) {
    return [];
  }

  const result: PDFDict[] = [];
  for (let index = 0; index < annotations.size(); index += 1) {
    const annotation = annotations.lookupMaybe(index, PDFDict);
    if (annotation?.get(PDFName.of('Subtype')) === PDFName.of('Link')) {
      result.push(annotation);
    }
  }

  return result;
}

/**
 * Whether a URL is on the deck's origin, compared as parsed origins: `http://host:51730/` is not on
 * `http://host:5173`, and neither is `http://host:5173.example/`.
 *
 * @param uri - The link's URL.
 * @param origin - The deck's origin.
 */
function hasOrigin(uri: string, origin: string): boolean {
  try {
    return new URL(uri).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

/**
 * The page a link URL points at when it is a link to a slide of the deck, else `null`.
 *
 * @param uri - The link's URL.
 * @param origin - The deck's origin.
 * @param firstPageOfSlide - The first page of each slide.
 * @param slideIds - Every slide id, in deck order.
 */
export function internalTarget(
  uri: string,
  origin: string,
  firstPageOfSlide: ReadonlyMap<number, number>,
  slideIds: readonly string[],
): number | null {
  const hash = slideHash(uri, origin);
  const position = hash === null ? undefined : parseHash(hash, slideIds);
  return position === undefined ? null : (firstPageOfSlide.get(position.slide) ?? null);
}

/**
 * Reads a raw slide hash or its exact-origin print URL. Invalid slide tokens stay recognizable so
 * the caller can deactivate them rather than preserve a temporary-server URL.
 *
 * @param uri - The link URL.
 * @param origin - The deck's origin.
 */
function slideHash(uri: string, origin: string): string | null {
  if (uri.startsWith('#/')) {
    return uri;
  }

  if (!hasOrigin(uri, origin)) {
    return null;
  }

  const url = new URL(uri);
  if (url.pathname.startsWith(SLIDE_LINK_PATH)) {
    return `#/${url.pathname.slice(SLIDE_LINK_PATH.length)}${url.search}${url.hash}`;
  }

  return url.hash.startsWith('#/') ? url.hash : null;
}

/**
 * One bookmark of the outline: its title and the page it opens.
 */
type OutlineEntry = {
  /**
   * The bookmark title, such as `3. Pricing`.
   */
  title: string;

  /**
   * The page the bookmark opens.
   */
  page: PDFRef;
};

/**
 * Writes the outline: one bookmark per slide at its first page, then a "Speaker notes" bookmark.
 *
 * @param document - The document.
 * @param pages - The slide pages.
 * @param firstPageOfSlide - The first page of each slide.
 * @param pageRefs - Every page.
 * @param notesStart - The first notes page, or `null` without notes.
 * @returns The bookmark titles.
 */
function writeOutline(
  document: PDFDocument,
  pages: readonly PrintedPage[],
  firstPageOfSlide: ReadonlyMap<number, number>,
  pageRefs: readonly PDFRef[],
  notesStart: number | null,
): string[] {
  const entries = outlineEntries(pages, firstPageOfSlide, pageRefs, notesStart);
  if (entries.length === 0) {
    return [];
  }

  const { context } = document;
  const outlinesRef = context.nextRef();
  const itemRefs = entries.map(() => context.nextRef());
  entries.forEach((entry, index) => {
    const item = context.obj({
      Title: PDFHexString.fromText(entry.title),
      Parent: outlinesRef,
      Dest: [entry.page, PDFName.of('Fit')],
    });
    const previous = itemRefs[index - 1];
    const next = itemRefs[index + 1];
    if (previous !== undefined) {
      item.set(PDFName.of('Prev'), previous);
    }

    if (next !== undefined) {
      item.set(PDFName.of('Next'), next);
    }

    const ref = itemRefs[index];
    if (ref !== undefined) {
      context.assign(ref, item);
    }
  });
  const outlines = context.obj({ Type: 'Outlines', Count: PDFNumber.of(entries.length) });
  outlines.set(PDFName.of('First'), itemRefs[0] ?? outlinesRef);
  outlines.set(PDFName.of('Last'), itemRefs.at(-1) ?? outlinesRef);
  context.assign(outlinesRef, outlines);
  document.catalog.set(PDFName.of('Outlines'), outlinesRef);
  document.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  return entries.map((entry) => entry.title);
}

/**
 * The outline's bookmarks: one per slide that has a page, then the notes bookmark when there are
 * notes pages.
 *
 * @param pages - The slide pages.
 * @param firstPageOfSlide - The first page of each slide.
 * @param pageRefs - Every page.
 * @param notesStart - The first notes page, or `null` without notes.
 */
function outlineEntries(
  pages: readonly PrintedPage[],
  firstPageOfSlide: ReadonlyMap<number, number>,
  pageRefs: readonly PDFRef[],
  notesStart: number | null,
): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  for (const [slideIndex, pageIndex] of firstPageOfSlide) {
    const printed = pages.find((page) => page.slideIndex === slideIndex);
    const ref = pageRefs[pageIndex];
    if (printed !== undefined && ref !== undefined) {
      entries.push({ title: `${slideIndex + 1}. ${printed.title}`, page: ref });
    }
  }

  const notesRef = notesStart === null ? undefined : pageRefs[notesStart];
  if (notesRef !== undefined) {
    entries.push({ title: 'Speaker notes', page: notesRef });
  }

  return entries;
}
