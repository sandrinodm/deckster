import type { Page } from 'playwright';

import { Effect } from 'effect';

import type { NotesPage } from '#pdf/assemble-pdf.ts';

import { exportError, type ExportError } from '#export-error.ts';
import { escapeXml } from '#ooxml/xml.ts';

/**
 * The canvas in CSS pixels: the slide's size, and the page a notes page is drawn on.
 */
const CANVAS_PX = {
  /**
   * The width.
   */
  width: 1920,

  /**
   * The height.
   */
  height: 1080,
} as const;

/**
 * The PDF page size: the canvas, which Chromium prints at 96 CSS pixels per inch as 1440 by 810
 * points (20 by 11.25 inches).
 */
const PAGE_SIZE = {
  /**
   * The page width.
   */
  width: `${CANVAS_PX.width}px`,

  /**
   * The page height.
   */
  height: `${CANVAS_PX.height}px`,
} as const;

/**
 * PDF points per CSS pixel.
 */
const POINTS_PER_PX = 0.75;

/**
 * Matches the blank line between two paragraphs of speaker notes.
 */
const PARAGRAPH_BREAK_PATTERN = /\n\s*\n/;

/**
 * The space between a notes page's slide box and the title block beside it, in CSS pixels.
 */
const NOTES_META_GAP_PX = 64;

/**
 * The space between a notes page's slide box and the speaker notes below it, in CSS pixels.
 */
const NOTES_GAP_PX = 48;

/**
 * The right margin of a notes page's text, in CSS pixels.
 */
const NOTES_RIGHT_MARGIN_PX = 96;

/**
 * The bottom margin of a notes page's speaker notes, in CSS pixels.
 */
const NOTES_BOTTOM_MARGIN_PX = 64;

/**
 * Where the slide sits on a notes page, in CSS pixels.
 */
const NOTES_SLIDE_BOX = {
  /**
   * The left edge.
   */
  x: 96,

  /**
   * The top edge.
   */
  y: 96,

  /**
   * The width.
   */
  width: 1056,

  /**
   * The height.
   */
  height: 594,
} as const;

/**
 * Matches the characters a font stack must not carry into a style element.
 */
const UNSAFE_CSS_PATTERN = /[<>{};\\]/g;

/**
 * The top of the notes on a notes page after the first, in CSS pixels: below the heading.
 */
const NOTES_NEXT_TOP_PX = 200;

/**
 * The height of the notes box on the first notes page, in CSS pixels.
 */
const NOTES_FIRST_HEIGHT_PX =
  CANVAS_PX.height -
  (NOTES_SLIDE_BOX.y + NOTES_SLIDE_BOX.height + NOTES_GAP_PX) -
  NOTES_BOTTOM_MARGIN_PX;

/**
 * The height of the notes box on every later notes page, in CSS pixels.
 */
const NOTES_NEXT_HEIGHT_PX = CANVAS_PX.height - NOTES_NEXT_TOP_PX - NOTES_BOTTOM_MARGIN_PX;

/**
 * The path in-deck slide links get for the print; `assemblePdf` recognises it.
 */
export const SLIDE_LINK_PATH = '/__deck-slide/';

/**
 * The fix printed when printing fails.
 */
const PRINT_FIX =
  'Run the export again; Chromium prints PDFs only in headless mode, which `deck export` uses.';

/**
 * Prints the slide on screen as a one-page PDF the size of the canvas, with backgrounds, vector
 * text and embedded font subsets, the page's links as link annotations and, with `tagged`,
 * Chromium's structure tree (headings, paragraphs, lists, figures with their alt text). The
 * gradient grain, an SVG noise filter Chromium would otherwise rasterise into a full-page picture
 * on every gradient slide, is printed as a small tiled PNG of the same tile. The page must show the
 * deck in static mode, so the presenter and comment UI are absent and media show posters.
 *
 * @param page - The deck page, showing the slide and step to print.
 * @param label - The slide, for errors.
 * @param tagged - Whether to write the structure tree.
 * @returns The PDF bytes.
 * @throws ExportError in the error channel when Chromium fails.
 */
export const printSlide = Effect.fn('printSlide')(function* (
  page: Page,
  label: string,
  tagged: boolean,
): Effect.fn.Return<Uint8Array, ExportError> {
  const buffer = yield* Effect.tryPromise({
    try: async () => {
      await page.emulateMedia({ media: 'screen' });
      await page.evaluate(markSlideLinks, SLIDE_LINK_PATH);
      await page.evaluate(rasteriseGrain, GRAIN_MARKER);
      try {
        return await page.pdf(printOptions(tagged));
      } finally {
        await page.evaluate(unmarkSlideLinks);
        await page.evaluate(restoreGrain, GRAIN_MARKER);
      }
    },
    catch: (cause) => exportError(`print ${label} to PDF`, cause, PRINT_FIX),
  });
  return new Uint8Array(buffer);
});

/**
 * The options every printed page shares: the canvas size, backgrounds, one page and no margin.
 *
 * @param tagged - Whether to write the structure tree.
 */
function printOptions(tagged: boolean): NonNullable<Parameters<Page['pdf']>[0]> {
  return {
    ...PAGE_SIZE,
    printBackground: true,
    tagged,
    pageRanges: '1',
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  };
}

/**
 * Gives every link to another slide (`#/3`) an absolute URL for the print: Chromium drops links to
 * fragments it cannot find in the page, and `assemblePdf` turns these URLs into links to the
 * slide's page. Runs in the browser; self-contained.
 *
 * @param prefix - The path the URLs get, such as `/__deck-slide/`.
 */
function markSlideLinks(prefix: string): void {
  const slideLinks = document.querySelectorAll<HTMLAnchorElement>('a[href^="#/"]');
  for (const anchor of Array.from(slideLinks)) {
    const href = anchor.getAttribute('href') ?? '';
    anchor.setAttribute('data-export-href', href);
    anchor.setAttribute('href', `${location.origin}${prefix}${href.slice(2)}`);
  }
}

/**
 * The attribute and style element id {@link rasteriseGrain} marks what it changed with.
 */
const GRAIN_MARKER = 'data-export-grain';

/**
 * Replaces every background layer drawn by an SVG noise filter (`feTurbulence`, the brand's
 * gradient grain) with a PNG of the same tile at the same size, on elements and their `::before`
 * and `::after`, for the print: Chromium's PDF output rasterises a filtered SVG background over the
 * whole box at print resolution, about 1 MB per gradient page, while a PNG tile is embedded once
 * and repeated. Runs in the browser; self-contained.
 *
 * @param marker - The attribute that marks changed elements, also the id of the added style sheet.
 */
async function rasteriseGrain(marker: string): Promise<void> {
  const SVG_DATA_URL_PATTERN = /url\("(data:image\/svg\+xml[^"]*)"\)/g;
  const tiles = new Map<string, string>();
  /**
   * The PNG data URL of an SVG tile, drawn at its own size.
   */
  const rasterise = async (url: string): Promise<string> => {
    const cached = tiles.get(url);
    if (cached !== undefined) {
      return cached;
    }

    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d')?.drawImage(image, 0, 0);
    const png = canvas.toDataURL('image/png');
    tiles.set(url, png);
    return png;
  };
  /**
   * The background value with each grain layer replaced, or `null` when it has none.
   */
  const replaced = async (value: string): Promise<string | null> => {
    const urls = [...value.matchAll(SVG_DATA_URL_PATTERN)]
      .map((match) => match[1] ?? '')
      .filter((url) => decodeURIComponent(url).includes('feTurbulence'));
    if (urls.length === 0) {
      return null;
    }

    let result = value;
    for (const url of urls) {
      result = result.replace(url, await rasterise(url));
    }

    return result;
  };
  /**
   * A style rule that sets one background image, over the page's own style.
   */
  const backgroundRule = (selector: string, image: string): string =>
    `${selector} { background-image: ${image} !important; }`;
  const rules: string[] = [];
  let index = 0;
  for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
    const own = await replaced(getComputedStyle(element).backgroundImage);
    const before = await replaced(getComputedStyle(element, '::before').backgroundImage);
    const after = await replaced(getComputedStyle(element, '::after').backgroundImage);
    if (own === null && before === null && after === null) {
      continue;
    }

    index += 1;
    element.setAttribute(marker, String(index));
    const selector = `[${marker}="${index}"]`;
    if (own !== null) {
      rules.push(backgroundRule(selector, own));
    }

    if (before !== null) {
      rules.push(backgroundRule(`${selector}::before`, before));
    }

    if (after !== null) {
      rules.push(backgroundRule(`${selector}::after`, after));
    }
  }

  if (rules.length > 0) {
    const style = document.createElement('style');
    style.id = marker;
    style.textContent = rules.join('\n');
    document.head.append(style);
  }
}

/**
 * Removes what {@link rasteriseGrain} added. Runs in the browser; self-contained.
 *
 * @param marker - The marker attribute and style sheet id.
 */
function restoreGrain(marker: string): void {
  document.getElementById(marker)?.remove();
  for (const element of Array.from(document.querySelectorAll(`[${marker}]`))) {
    element.removeAttribute(marker);
  }
}

/**
 * Puts back the links {@link markSlideLinks} changed. Runs in the browser; self-contained.
 */
function unmarkSlideLinks(): void {
  for (const anchor of Array.from(document.querySelectorAll('a[data-export-href]'))) {
    anchor.setAttribute('href', anchor.getAttribute('data-export-href') ?? '');
    anchor.removeAttribute('data-export-href');
  }
}

/**
 * What a notes page shows.
 */
export type NotesContent = {
  /**
   * The deck slide's zero-based index.
   */
  slideIndex: number;

  /**
   * The slide title.
   */
  title: string;

  /**
   * The speaker notes; blank lines separate paragraphs.
   */
  notes: string;

  /**
   * The CSS font stack for the notes, the brand's body family.
   */
  fontStack: string;

  /**
   * The language of the notes, such as `en-US`, for the page's `lang`.
   */
  language: string;
};

/**
 * The notes' paragraphs: blocks separated by a blank line, trimmed, none empty.
 *
 * @param notes - The speaker notes.
 */
export function notesParagraphs(notes: string): string[] {
  return notes
    .split(PARAGRAPH_BREAK_PATTERN)
    .map((block) => block.trim())
    .filter((block) => block !== '');
}

/**
 * Splits the notes into the paragraphs each notes page holds: the first page has the room below the
 * slide box, every later page the room below its heading. Words fill a page until the next one
 * would not fit, so a long paragraph carries over to the next page and no text is cut. Measured in
 * the browser with the page's own fonts and styles.
 *
 * @param page - A blank page in the deck's browser context.
 * @param content - What the notes pages show.
 * @returns The paragraphs of each page, at least one page.
 * @throws ExportError in the error channel when Chromium fails.
 */
export const paginateNotes = Effect.fn('paginateNotes')(function* (
  page: Page,
  content: NotesContent,
): Effect.fn.Return<string[][], ExportError> {
  const paragraphs = notesParagraphs(content.notes);
  if (paragraphs.length === 0) {
    return [[]];
  }

  const pages = yield* Effect.tryPromise({
    try: async () => {
      await page.setContent(notesHtml(content, [], 1), { waitUntil: 'load' });
      return page.evaluate(splitNotes, {
        paragraphs,
        firstHeight: NOTES_FIRST_HEIGHT_PX,
        nextHeight: NOTES_NEXT_HEIGHT_PX,
      });
    },
    catch: (cause) =>
      exportError(`measure the notes of slide ${content.slideIndex + 1}`, cause, PRINT_FIX),
  });
  return pages;
});

/**
 * Arguments of {@link splitNotes}.
 */
type SplitArgs = {
  /**
   * The notes' paragraphs.
   */
  paragraphs: string[];

  /**
   * The height of the notes box on the first page, in CSS pixels.
   */
  firstHeight: number;

  /**
   * The height of the notes box on every later page.
   */
  nextHeight: number;
};

/**
 * Fills the page's `.notes` box with words until it overflows, page by page. Runs in the browser;
 * self-contained.
 *
 * @param args - The paragraphs and the box heights.
 * @returns The paragraphs of each page.
 */
function splitNotes(args: SplitArgs): string[][] {
  const WORD_BOUNDARY_PATTERN = /\s+/;
  const box = document.querySelector<HTMLElement>('.notes');
  if (box === null) {
    return [args.paragraphs];
  }

  /**
   * Whether the paragraphs fit the box at the given height.
   */
  const fits = (items: readonly string[], height: number): boolean => {
    box.style.height = `${height}px`;
    box.replaceChildren(
      ...items.map((text) => {
        const element = document.createElement('p');
        element.textContent = text;
        return element;
      }),
    );
    const last = box.lastElementChild;
    if (last === null) {
      return true;
    }

    return last.getBoundingClientRect().bottom <= box.getBoundingClientRect().top + height;
  };
  const queue = [...args.paragraphs];
  const pages: string[][] = [];
  while (queue.length > 0) {
    const height = pages.length === 0 ? args.firstHeight : args.nextHeight;
    const current: string[] = [];
    while (queue.length > 0) {
      const next = queue[0] ?? '';
      if (fits([...current, next], height)) {
        current.push(next);
        queue.shift();
        continue;
      }

      const words = next.split(WORD_BOUNDARY_PATTERN);
      let low = 0;
      let high = words.length - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (fits([...current, words.slice(0, middle).join(' ')], height)) {
          low = middle;
        } else {
          high = middle - 1;
        }
      }

      if (low === 0 && current.length > 0) {
        break;
      }

      const taken = Math.max(1, low);
      current.push(words.slice(0, taken).join(' '));
      queue[0] = words.slice(taken).join(' ');
      if (queue[0] === '') {
        queue.shift();
      }

      break;
    }

    pages.push(current);
  }

  return pages;
}

/**
 * Prints the notes pages of a slide: the first has the slide's number and title, a box where the
 * slide is drawn, and the notes below it; notes that do not fit continue on further pages headed
 * with the slide's number and title. The slide itself is added by `assemblePdf` as a vector copy of
 * its page.
 *
 * @param page - A blank page in the deck's browser context.
 * @param content - What the pages show.
 * @returns The pages, the first with where the slide goes on it.
 * @throws ExportError in the error channel when Chromium fails.
 */
export const printNotesPage = Effect.fn('printNotesPage')(function* (
  page: Page,
  content: NotesContent,
): Effect.fn.Return<NotesPage[], ExportError> {
  const chunks = yield* paginateNotes(page, content);
  const box = NOTES_SLIDE_BOX;
  const result: NotesPage[] = [];
  for (const [index, paragraphs] of chunks.entries()) {
    const buffer = yield* Effect.tryPromise({
      try: async () => {
        await page.setContent(notesHtml(content, paragraphs, index + 1), { waitUntil: 'load' });
        return page.pdf(printOptions(true));
      },
      catch: (cause) =>
        exportError(`print the notes of slide ${content.slideIndex + 1}`, cause, PRINT_FIX),
    });
    result.push({
      pdf: new Uint8Array(buffer),
      slideIndex: content.slideIndex,
      part: index + 1,
      slideBox:
        index === 0
          ? {
              x: box.x * POINTS_PER_PX,
              y: (CANVAS_PX.height - box.y - box.height) * POINTS_PER_PX,
              width: box.width * POINTS_PER_PX,
              height: box.height * POINTS_PER_PX,
            }
          : null,
    });
  }

  return result;
});

/**
 * The HTML of one notes page.
 *
 * @param content - What the pages show.
 * @param paragraphs - The notes this page holds; empty for the measuring page.
 * @param part - The page's 1-based number among the slide's notes pages; later ones are headed as a
 *   continuation and have no box for the slide.
 */
export function notesHtml(
  content: NotesContent,
  paragraphs: readonly string[],
  part: number,
): string {
  const first = part === 1;
  const body = paragraphs.map((block) => `<p>${escapeXml(block)}</p>`).join('');
  const box = NOTES_SLIDE_BOX;
  const heading = first
    ? `Slide ${content.slideIndex + 1}`
    : `Slide ${content.slideIndex + 1} (notes, continued)`;
  const metaLeft = first ? box.x + box.width + NOTES_META_GAP_PX : box.x;
  const notesTop = first ? box.y + box.height + NOTES_GAP_PX : NOTES_NEXT_TOP_PX;
  const empty = first && paragraphs.length === 0 ? '<p>No speaker notes.</p>' : '';
  return [
    `<!doctype html><html lang="${escapeXml(content.language)}">` +
      '<head><meta charset="utf-8"><style>',
    `@page { size: ${CANVAS_PX.width}px ${CANVAS_PX.height}px; margin: 0; }`,
    `html, body { margin: 0; width: ${CANVAS_PX.width}px; height: ${CANVAS_PX.height}px; ` +
      `background: #ffffff; color: #161920; font-family: ${safeFontStack(content.fontStack)}; }`,
    `.slide { position: absolute; left: ${box.x}px; top: ${box.y}px; ` +
      `width: ${box.width}px; height: ${box.height}px; outline: 2px solid #d9dce4; }`,
    `.meta { position: absolute; left: ${metaLeft}px; ` +
      `top: ${box.y}px; right: ${NOTES_RIGHT_MARGIN_PX}px; }`,
    '.number { font-size: 28px; color: #555c6a; margin: 0 0 16px; }',
    '.title { font-size: 40px; line-height: 1.2; margin: 0; font-weight: 600; }',
    `.notes { position: absolute; left: ${box.x}px; right: ${NOTES_RIGHT_MARGIN_PX}px; ` +
      `top: ${notesTop}px; height: ${CANVAS_PX.height - notesTop - NOTES_BOTTOM_MARGIN_PX}px; ` +
      'font-size: 26px; line-height: 1.45; overflow: hidden; }',
    '.notes p { margin: 0 0 14px; }',
    '</style></head><body>',
    first ? '<div class="slide"></div>' : '',
    `<div class="meta"><p class="number">${escapeXml(heading)}</p>` +
      `<h1 class="title">${escapeXml(content.title)}</h1></div>`,
    `<div class="notes">${body === '' ? empty : body}</div>`,
    '</body></html>',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * A CSS font stack that cannot end its declaration or its style element: the characters that could
 * (`<`, `>`, `{`, `}`, `;`, `\`) are dropped.
 *
 * @param stack - The brand's font stack.
 */
function safeFontStack(stack: string): string {
  return stack.replaceAll(UNSAFE_CSS_PATTERN, '');
}
