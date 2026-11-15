import type { Browser, Page } from 'playwright';

import { Effect } from 'effect';
import { PDFDocument } from 'pdf-lib';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { assemblePdf } from '#pdf/assemble-pdf.ts';
import { notesHtml, notesParagraphs, paginateNotes, printNotesPage } from '#pdf/print-pages.ts';

/**
 * Printing runs in Chromium.
 */
const TIMEOUT_MS = 120_000;

/**
 * What the notes pages of slide 3 show, with the notes to override.
 *
 * @param notes - The speaker notes.
 */
function content(notes: string) {
  return {
    slideIndex: 2,
    title: 'Pricing <and> plans',
    notes,
    fontStack: 'sans-serif',
    language: 'en-US',
  };
}

/**
 * A very long note: numbered words in paragraphs of different lengths, one of them a wall of text.
 */
function longNotes(): string {
  const paragraphs = Array.from({ length: 60 }, (_, index) =>
    Array.from({ length: 30 + (index % 7) * 20 }, (__, word) => `p${index}w${word}`).join(' '),
  );
  paragraphs.push(Array.from({ length: 3000 }, (_, word) => `wall${word}`).join(' '));
  return paragraphs.join('\n\n');
}

describe('notesHtml', () => {
  it('escapes the title and headings the continuation pages with the slide number', () => {
    const first = notesHtml(content('x'), ['x'], 1);
    expect(first).toContain('Slide 3</p>');
    expect(first).toContain('Pricing &lt;and&gt; plans');
    expect(first).toContain('<div class="slide">');
    const next = notesHtml(content('x'), ['x'], 2);
    expect(next).toContain('Slide 3 (notes, continued)');
    expect(next).not.toContain('<div class="slide">');
  });

  it('keeps a font stack from closing the style element', () => {
    const html = notesHtml(
      { ...content('x'), fontStack: 'Inter, </style><script>x</script>' },
      [],
      1,
    );
    expect(html).not.toContain('<script>');
  });
});

describe('notesParagraphs', () => {
  it('splits on blank lines and drops empty blocks', () => {
    expect(notesParagraphs('a\nb\n\n\n  \n\nc ')).toEqual(['a\nb', 'c']);
  });
});

describe('notes pagination', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  }, TIMEOUT_MS);

  afterAll(async () => {
    await browser.close();
  });

  it(
    'keeps short notes on one page',
    async () => {
      const pages = await Effect.runPromise(
        paginateNotes(page, content('Say hello.\n\nThen demo.')),
      );
      expect(pages).toEqual([['Say hello.', 'Then demo.']]);
    },
    TIMEOUT_MS,
  );

  it(
    'carries very long notes over to as many pages as they need without losing a word',
    async () => {
      const notes = longNotes();
      const pages = await Effect.runPromise(paginateNotes(page, content(notes)));
      expect(pages.length).toBeGreaterThan(3);
      const words = (text: string): string[] => text.split(/\s+/).filter(Boolean);
      expect(pages.flat().flatMap(words)).toEqual(words(notes));
      expect(pages.every((paragraphs) => paragraphs.length > 0)).toBe(true);
    },
    TIMEOUT_MS,
  );

  it(
    'prints one PDF page per chunk, the slide box only on the first, and assembles with notes labels',
    async () => {
      const printed = await Effect.runPromise(printNotesPage(page, content(longNotes())));
      expect(printed.length).toBeGreaterThan(3);
      expect(printed.map((notes) => notes.part)).toEqual(printed.map((_, index) => index + 1));
      expect(printed[0]?.slideBox).not.toBeNull();
      expect(printed.slice(1).every((notes) => notes.slideBox === null)).toBe(true);
      for (const notes of printed) {
        expect((await PDFDocument.load(notes.pdf)).getPageCount()).toBe(1);
      }

      const slide = await (await PDFDocument.create()).save({ addDefaultPage: true });
      const result = await assemblePdf({
        title: 'Deck',
        author: null,
        language: 'en-US',
        date: new Date('2026-11-13T12:00:00Z'),
        encodeJpeg: null,
        origin: 'http://127.0.0.1:5173',
        slideIds: ['intro', 'details', 'pricing'],
        pages: [{ pdf: slide, slideIndex: 2, title: 'Pricing', label: '3' }],
        notes: printed,
      });
      expect(result.pageCount).toBe(1 + printed.length);
      expect(result.labels.slice(0, 3)).toEqual(['3', 'Notes 3', 'Notes 3 (2)']);
      expect(result.outline).toEqual(['3. Pricing', 'Speaker notes']);
    },
    TIMEOUT_MS,
  );
});
