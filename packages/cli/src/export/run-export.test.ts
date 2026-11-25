import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { strFromU8, unzipSync } from 'fflate';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { describe, it } from 'vite-plus/test';

import type { ExportOptions } from '#export/export-options.ts';

import { fakeDeckLayer, pageSlide, type FakeDeck } from '#browser/fake-deck.fixture.ts';
import { cliLayer } from '#cli.ts';
import { defaultExportOptions } from '#export/export-options.ts';
import { reportedWarnings, runExport } from '#export/run-export.ts';
import { DEMO_WORKSPACE, FIXTURE_WORKSPACE } from '#lint/lint.fixtures.ts';
import { collectedPage } from '#lint/snapshot.fixture.ts';
import { Workspace } from '#workspace.ts';

/**
 * Exports open a real deck in Chromium.
 */
const EXPORT_TIMEOUT_MS = 240_000;

/**
 * The number of slides the exemplars deck lists.
 */
const EXEMPLAR_SLIDES = 26;

/**
 * The exemplars slide whose cover photo fills the slide, by its 1-based number. The PPTX export
 * rasterises two elements on it, the scrims below, and on no other exemplar slide.
 */
const FULL_BLEED_COVER = 17;

/**
 * The scrims the full-bleed cover draws: one behind the logo, one behind the text block.
 */
const FULL_BLEED_COVER_SCRIMS = 2;

/**
 * Export options writing to a fresh temporary folder.
 *
 * @param deck - The deck.
 * @param overrides - Options that differ from a plain export.
 */
function options(deck: string, overrides: Partial<ExportOptions>): ExportOptions {
  return {
    ...defaultExportOptions(deck),
    out: mkdtempSync(path.join(os.tmpdir(), 'deck-export-')),
    ...overrides,
  };
}

/**
 * Every part of a PPTX as text, by path.
 *
 * @param file - The PPTX.
 */
function pptxParts(file: string): Record<string, string> {
  const files = unzipSync(readFileSync(file));
  return Object.fromEntries(
    Object.entries(files).map(([name, data]) => [
      name,
      name.endsWith('.xml') || name.endsWith('.rels') ? strFromU8(data) : '',
    ]),
  );
}

/**
 * The text runs of a slide part, joined.
 *
 * @param xml - The part.
 */
function runText(xml: string): string {
  return [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((match) => match[1]).join(' ');
}

/**
 * The parts whose path matches a pattern.
 *
 * @param parts - The parts.
 * @param pattern - The pattern.
 */
function partsMatching(parts: Record<string, string>, pattern: RegExp): string[] {
  return Object.keys(parts).filter((name) => pattern.test(name));
}

/**
 * Whether every font of a PDF is embedded: a Type 3 font carries its glyphs, other fonts a font
 * file in their descriptor.
 *
 * @param document - The PDF.
 */
function fontsEmbedded(document: PDFDocument): {
  fonts: number;
  embedded: number;
  trueType: number;
  type3: number;
} {
  let fonts = 0;
  let embedded = 0;
  let trueType = 0;
  let type3 = 0;
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict) || object.get(PDFName.of('Type')) !== PDFName.of('Font')) {
      continue;
    }

    const subtype = object.get(PDFName.of('Subtype'));
    if (subtype === PDFName.of('Type0')) {
      continue;
    }

    if (subtype === PDFName.of('CIDFontType2') || subtype === PDFName.of('TrueType')) {
      trueType += 1;
    }

    if (subtype === PDFName.of('Type3')) {
      type3 += 1;
    }

    fonts += 1;
    const descriptor = object.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
    const hasFile = ['FontFile', 'FontFile2', 'FontFile3'].some(
      (key) => descriptor?.has(PDFName.of(key)) === true,
    );
    if (subtype === PDFName.of('Type3') || hasFile) {
      embedded += 1;
    }
  }

  return { fonts, embedded, trueType, type3 };
}

layer(cliLayer(Workspace.at(DEMO_WORKSPACE)))('deckster export on the exemplars deck', (it) => {
  it.effect(
    'writes a PDF with a page, a bookmark and embedded fonts per slide, and the deck title',
    () =>
      Effect.gen(function* () {
        const result = yield* runExport(options('exemplars', { formats: new Set(['pdf']) }));
        expect(result.pdf?.pages).toBe(EXEMPLAR_SLIDES);
        expect(result.pdf?.outline).toHaveLength(EXEMPLAR_SLIDES);
        expect(result.pdf?.outline[0]).toBe('1. Shade is infrastructure');
        const document = yield* Effect.promise(() =>
          PDFDocument.load(readFileSync(result.pdf?.path ?? '')),
        );
        expect(document.getPageCount()).toBe(EXEMPLAR_SLIDES);
        expect(document.getTitle()).toBe('Shade is infrastructure');
        const [width, height] = [document.getPage(0).getWidth(), document.getPage(0).getHeight()];
        expect(width / height).toBeCloseTo(16 / 9, 3);
        const fonts = fontsEmbedded(document);
        expect(fonts.fonts).toBeGreaterThan(0);
        expect(fonts.embedded).toBe(fonts.fonts);
        expect(fonts.trueType).toBeGreaterThan(0);
        expect(fonts.type3).toBe(0);
      }),
    EXPORT_TIMEOUT_MS,
  );

  it.effect(
    'writes a PPTX with masters, layouts, placeholders, native text and notes',
    () =>
      Effect.gen(function* () {
        const result = yield* runExport(options('exemplars', { formats: new Set(['pptx']) }));
        const parts = pptxParts(result.pptx?.path ?? '');
        expect(partsMatching(parts, /^ppt\/slides\/slide\d+\.xml$/)).toHaveLength(EXEMPLAR_SLIDES);
        expect(partsMatching(parts, /^ppt\/notesSlides\/notesSlide\d+\.xml$/)).toHaveLength(
          EXEMPLAR_SLIDES,
        );
        expect(result.pptx?.masters).toEqual(['default', 'inverse', 'accent', 'gradient']);
        expect(partsMatching(parts, /^ppt\/slideMasters\/slideMaster\d+\.xml$/)).toHaveLength(4);
        expect(result.pptx?.layouts).toEqual(
          expect.arrayContaining([
            'title',
            'section',
            'statement',
            'content',
            'split',
            'stats',
            'default',
          ]),
        );
        const layoutNames = partsMatching(parts, /^ppt\/slideLayouts\/slideLayout\d+\.xml$/).map(
          (name) => /<p:cSld name="([^"]+)"/.exec(parts[name] ?? '')?.[1],
        );
        expect(layoutNames).toContain('content');
        expect(parts['ppt/theme/theme1.xml']).toContain(
          '<a:latin typeface="Bricolage Deck Headline" panose="020B0605040402000204" pitchFamily="34" charset="0"/>',
        );
        expect(result.pptx?.embeddedFonts).toContain('Inter Deck Lead');
        expect(parts['ppt/presentation.xml']).toContain('<p:embeddedFontLst>');
        expect(partsMatching(parts, /^ppt\/fonts\/font\d+\.fntdata$/).length).toBeGreaterThan(0);
        expect(result.pptx?.fonts?.files.length).toBeGreaterThan(0);
        const cover = parts['ppt/slides/slide1.xml'] ?? '';
        expect(cover).toContain('<p:ph type="ctrTitle"/>');
        expect(cover).toContain('<p:ph type="subTitle" idx="1"/>');
        expect(runText(cover)).toContain('Shade is infrastructure');
        expect(cover).toContain('wrap="square"');
        expect(cover).not.toContain('kern=');
        expect(parts['ppt/slideMasters/slideMaster1.xml']).toContain('name="Logo"');
        expect(parts['ppt/slides/slide4.xml']).toContain('<p:ph type="sldNum" idx="12"/>');
        const media = partsMatching(parts, /^ppt\/media\//);
        expect(
          media.every((name) => /^ppt\/media\/(?:media|vector)-[0-9a-f]{16}\./.test(name)),
        ).toBe(true);
        const ask = parts['ppt/slides/slide13.xml'] ?? '';
        expect(runText(ask)).toContain('$4.2M a year from 2027 to 2036, $42M in total');
        expect(ask).toContain('<a:buChar char="■"/>');
        const statement = parts['ppt/slides/slide2.xml'] ?? '';
        expect(statement).toContain('The hottest afternoon of 2026');
        expect(runText(parts['ppt/notesSlides/notesSlide1.xml'] ?? '')).toContain(
          'Thank the chair.',
        );
        const pictured = (result.pptx?.slides ?? [])
          .filter((slide) => slide.counts.rasterised > 0)
          .map((slide) => [slide.slide, slide.counts.rasterised]);
        expect(pictured).toEqual([[FULL_BLEED_COVER, FULL_BLEED_COVER_SCRIMS]]);
      }),
    EXPORT_TIMEOUT_MS,
  );
});

layer(cliLayer(Workspace.at(DEMO_WORKSPACE)))('deckster export output paths', (it) => {
  it.effect('refuses a file name for --out when several formats are written', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        runExport({
          ...defaultExportOptions('exemplars'),
          formats: new Set(['pdf', 'pptx']),
          out: path.join(os.tmpdir(), 'deck-export-x.pdf'),
        }),
      );
      expect(error.message).toContain('names a .pdf file, but the export writes pdf, pptx');
    }),
  );
});

layer(cliLayer(Workspace.at(FIXTURE_WORKSPACE)))('deckster export on the export fixture', (it) => {
  it.effect(
    'keeps external and slide links in the PDF',
    () =>
      Effect.gen(function* () {
        const result = yield* runExport(
          options('export', { formats: new Set(['pdf']), notes: true }),
        );
        expect(result.pdf?.internalLinks).toBeGreaterThanOrEqual(1);
        expect(result.pdf?.externalLinks).toBeGreaterThanOrEqual(1);
        expect(result.pdf?.pages).toBe(12);
        expect(result.pdf?.outline.at(-1)).toBe('Speaker notes');
      }),
    EXPORT_TIMEOUT_MS,
  );

  it.effect(
    'maps tables, charts, diagrams, links and step reveals to native objects',
    () =>
      Effect.gen(function* () {
        const result = yield* runExport(options('export', { formats: new Set(['pptx']) }));
        const parts = pptxParts(result.pptx?.path ?? '');
        const links = parts['ppt/slides/_rels/slide1.xml.rels'] ?? '';
        expect(links).toContain('Target="https://example.org/canopy" TargetMode="External"');
        expect(parts['ppt/slides/slide1.xml']).toContain('action="ppaction://hlinksldjump"');
        const table = parts['ppt/slides/slide2.xml'] ?? '';
        expect(table).toContain('<a:tbl>');
        expect(runText(table)).toContain('$4.2M');
        expect(parts['ppt/slides/slide3.xml']).toContain('<p:timing>');
        expect(parts['ppt/charts/chart1.xml']).toContain('<c:barChart>');
        expect(parts['ppt/charts/chart1.xml']).toContain('<c:dPt><c:idx val="2"/>');
        const figures = parts['ppt/slides/slide4.xml'] ?? '';
        expect(figures).toContain('<p:cxnSp>');
        expect(figures).toContain('<a:stCxn');
        expect(runText(figures)).toContain('Plan');
        expect(result.pptx?.slides[3]?.counts).toMatchObject({ charts: 1, diagrams: 1 });
        const scrim = parts['ppt/slides/slide5.xml'] ?? '';
        expect(scrim).not.toContain('<a:gradFill');
        expect(result.pptx?.slides[4]?.counts.rasterised).toBe(1);
        const contact = parts['ppt/slides/slide6.xml'] ?? '';
        expect(contact).toContain('<ahyp:hlinkClr');
        expect(contact).toContain(' u="none"');
        expect(contact.match(/<a:path /g)?.length).toBeGreaterThan(2);
      }),
    EXPORT_TIMEOUT_MS,
  );

  it.effect(
    'reports the plan per slide without writing files in a dry run',
    () =>
      Effect.gen(function* () {
        const result = yield* runExport(options('export', { dryRun: true, formats: new Set() }));
        expect(result.pptx).toBeNull();
        expect(result.dryRun?.slides.map((slide) => slide.id)).toEqual([
          'links',
          'table',
          'steps',
          'figures',
          'scrim',
          'contact',
        ]);
        expect(result.dryRun?.totals.native).toBeGreaterThan(0);
      }),
    EXPORT_TIMEOUT_MS,
  );
});

layer(cliLayer(Workspace.at(DEMO_WORKSPACE)))('deckster export on the diagrams-demo deck', (it) => {
  it.effect(
    'draws every described diagram as native shapes with connectors glued to their nodes',
    () =>
      Effect.gen(function* () {
        const result = yield* runExport(options('diagrams-demo', { formats: new Set(['pptx']) }));
        const parts = pptxParts(result.pptx?.path ?? '');
        const slides = partsMatching(parts, /^ppt\/slides\/slide\d+\.xml$/).map(
          (name) => parts[name] ?? '',
        );
        const connectors = slides.flatMap((xml) => xml.match(/<p:cxnSp>/g) ?? []);
        expect(connectors.length).toBeGreaterThan(10);
        const glued = slides.filter(
          (xml) => /<a:stCxn id="\d+" idx="\d+"\/>/.test(xml) && /<a:endCxn id="\d+"/.test(xml),
        );
        expect(glued.length).toBeGreaterThanOrEqual(5);
        expect(slides.join('')).toContain('name="Node: Orders service"');
        const diagrams = (result.pptx?.slides ?? []).reduce(
          (sum, slide) => sum + slide.counts.diagrams,
          0,
        );
        expect(diagrams).toBeGreaterThanOrEqual(10);
        const pictures = (result.dryRun?.slides ?? []).flatMap((slide) =>
          slide.findings.filter(
            (finding) => finding.outcome === 'picture' && finding.selector.includes('kit-diagram'),
          ),
        );
        const wholeDiagrams = pictures.filter((finding) =>
          /figure\.kit-diagram[^>]*$/.test(finding.selector),
        );
        expect(wholeDiagrams).toEqual([]);
      }),
    EXPORT_TIMEOUT_MS,
  );
});

/**
 * A two-slide fake deck whose second slide shows a render error.
 */
const BROKEN_DECK: FakeDeck = {
  slides: [
    { page: pageSlide(0, 'title'), steps: [collectedPage()] },
    {
      page: pageSlide(1, 'steps'),
      steps: [collectedPage({ renderError: { file: 'slides/steps.mdx', message: 'boom\nstack' } })],
    },
  ],
};

layer(Layer.mergeAll(fakeDeckLayer(BROKEN_DECK), NodeServices.layer, Workspace.layer))(
  'deckster export --png with a slide that renders an error',
  (it) => {
    it.effect('fails naming the slide, for the whole deck and for chosen slides', () =>
      Effect.gen(function* () {
        const whole = yield* Effect.flip(
          runExport(options('hello', { formats: new Set(['png']) })),
        );
        expect(whole.message).toContain('slide 2 "steps": boom');
        expect(whole.message).not.toContain('slide 1');
        const chosen = yield* Effect.flip(
          runExport(options('hello', { formats: new Set(['png']), slides: '2' })),
        );
        expect(chosen.message).toContain('slide 2 "steps": boom');
      }),
    );
  },
);

describe('reportedWarnings', () => {
  const capture = {
    warnings: [
      'slide 3: span.kit-flow-badge: its ::before/::after could not be measured',
      'font note',
    ],
    fontWarnings: ['font note'],
  };

  it('keeps the PPTX-only notes out of a PDF-only export', () => {
    expect(reportedWarnings(capture, false)).toEqual(['font note']);
  });

  it('reports every note when a PPTX is written, planned or verified', () => {
    expect(reportedWarnings(capture, true)).toEqual(capture.warnings);
  });

  it('reports nothing when nothing was measured', () => {
    expect(reportedWarnings(null, true)).toEqual([]);
  });
});
