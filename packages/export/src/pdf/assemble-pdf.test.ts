import { deflateSync, inflateSync } from 'node:zlib';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFStream,
  PDFString,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib';
import { describe, expect, it } from 'vite-plus/test';

import type { PrintedPage } from '#pdf/assemble-pdf.ts';

import { assemblePdf, internalTarget, withoutMarkedContentIds } from '#pdf/assemble-pdf.ts';

/**
 * The defaults every assembly in these tests shares.
 */
const BASE = {
  /**
   * The deck title.
   */
  title: 'Shade is infrastructure',

  /**
   * No author.
   */
  author: null,

  /**
   * The language.
   */
  language: 'en-GB',

  /**
   * A fixed date.
   */
  date: new Date('2026-11-13T12:00:00Z'),

  /**
   * No JPEG encoding.
   */
  encodeJpeg: null,

  /**
   * The deck origin.
   */
  origin: 'http://127.0.0.1:5173',

  /**
   * The complete deck order.
   */
  slideIds: ['intro', 'details', 'closing', 'appendix', 'sources'],
} as const;

/**
 * A one-page PDF the size of the canvas, optionally with a picture.
 *
 * @param picture - An RGB image stream's pixels to draw, or nothing.
 * @param left - The left edge of the rectangle drawn, which tells pages apart.
 */
async function onePage(picture?: Uint8Array, left = 100): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([1440, 810]);
  page.drawRectangle({ x: left, y: 100, width: 200, height: 100 });
  if (page.node.Resources() === undefined) {
    page.node.set(PDFName.of('Resources'), document.context.obj({}));
  }

  if (picture !== undefined) {
    const image = document.context.stream(deflateSync(picture), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 64,
      Height: 64,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
    });
    page.node.newXObject('Im', document.context.register(image));
  }

  return document.save();
}

/**
 * A slide page for the assembly.
 *
 * @param pdf - The page.
 * @param slideIndex - The slide.
 * @param label - The page label.
 */
function slide(pdf: Uint8Array, slideIndex: number, label = String(slideIndex + 1)): PrintedPage {
  return { pdf, slideIndex, title: `Slide ${slideIndex + 1}`, label };
}

/**
 * The image streams of a document.
 *
 * @param document - The document.
 */
function images(document: PDFDocument): PDFStream[] {
  return document.context
    .enumerateIndirectObjects()
    .flatMap(([, object]) =>
      object instanceof PDFStream && object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')
        ? [object]
        : [],
    );
}

/**
 * The form XObjects a notes page draws its slide with.
 *
 * @param page - The page.
 */
function slideForms(page: PDFPage | undefined): PDFStream[] {
  const xobjects = page?.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  return (xobjects?.entries() ?? []).flatMap(([name, value]) => {
    const form = xobjects?.lookupMaybe(name, PDFStream);
    return name.asString().startsWith('/Slide') && value !== undefined && form !== undefined
      ? [form]
      : [];
  });
}

/**
 * A one-page tagged PDF: one paragraph element whose marked content is on the page, and a link
 * annotation with its own parent tree key, the way Chromium writes them.
 */
async function taggedPage(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([1440, 810]);
  const { context } = document;
  const annotation = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [0, 0, 10, 10],
      StructParent: 1,
      A: { S: 'URI', URI: PDFString.of('https://example.org') },
    }),
  );
  page.node.set(PDFName.of('Annots'), context.obj([annotation]));
  page.node.set(PDFName.of('StructParents'), PDFNumber.of(0));
  const rootRef = context.nextRef();
  const documentRef = context.nextRef();
  const paragraph = context.register(
    context.obj({ Type: 'StructElem', S: 'P', P: documentRef, Pg: page.ref, K: 0 }),
  );
  const link = context.register(
    context.obj({
      Type: 'StructElem',
      S: 'Link',
      P: documentRef,
      K: { Type: 'OBJR', Obj: annotation, Pg: page.ref },
    }),
  );
  context.assign(
    documentRef,
    context.obj({ Type: 'StructElem', S: 'Document', P: rootRef, K: [paragraph, link] }),
  );
  context.assign(
    rootRef,
    context.obj({
      Type: 'StructTreeRoot',
      K: documentRef,
      ParentTree: { Nums: [0, [paragraph], 1, link] },
      ParentTreeNextKey: 2,
    }),
  );
  document.catalog.set(PDFName.of('StructTreeRoot'), rootRef);
  return document.save();
}

describe('assemblePdf', () => {
  it("recognises links to the deck's own slides", () => {
    const pages = new Map([
      [0, 0],
      [2, 3],
    ]);
    expect(
      internalTarget(
        'http://127.0.0.1:5173/?static#/3',
        'http://127.0.0.1:5173',
        pages,
        BASE.slideIds,
      ),
    ).toBe(3);
    expect(
      internalTarget(
        'http://127.0.0.1:5173/__deck-slide/1',
        'http://127.0.0.1:5173',
        pages,
        BASE.slideIds,
      ),
    ).toBe(0);
    expect(
      internalTarget('https://example.org/#/3', 'http://127.0.0.1:5173', pages, BASE.slideIds),
    ).toBeNull();
    expect(
      internalTarget('http://127.0.0.1:5173/#/2', 'http://127.0.0.1:5173', pages, BASE.slideIds),
    ).toBeNull();
  });

  it('only treats links to the exact deck origin as links to the deck', () => {
    const pages = new Map([[2, 3]]);
    const origin = 'http://127.0.0.1:5173';
    expect(internalTarget('http://127.0.0.1:51730/#/3', origin, pages, BASE.slideIds)).toBeNull();
    expect(
      internalTarget('http://127.0.0.1:5173.evil.example/#/3', origin, pages, BASE.slideIds),
    ).toBeNull();
    expect(internalTarget('http://127.0.0.1:5173/?static#/3', origin, pages, BASE.slideIds)).toBe(
      3,
    );
    expect(internalTarget('#/3', origin, pages, BASE.slideIds)).toBe(3);
  });

  it('leaves a link to a lookalike origin external instead of rewriting it as relative', async () => {
    const document = await PDFDocument.create();
    const page = document.addPage([1440, 810]);
    const annotation = document.context.register(
      document.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [0, 0, 10, 10],
        A: { S: 'URI', URI: PDFString.of('http://127.0.0.1:51730/docs') },
      }),
    );
    page.node.set(PDFName.of('Annots'), document.context.obj([annotation]));
    const result = await assemblePdf({
      ...BASE,
      pages: [slide(await document.save(), 0)],
      notes: [],
    });
    expect(result.externalLinks).toBe(1);
  });

  it.each([
    ['full', [0, 1, 2], 2],
    ['filtered', [0, 2], 1],
    ['steps', [0, 0, 2, 2], 2],
  ] as const)(
    'writes actual numeric and named PDF destinations for %s exports',
    async (_name, indices, targetIndex) => {
      const internal = [
        '#/3',
        '#/closing/2/',
        `${BASE.origin}/?static#/closing/1/`,
        `${BASE.origin}/__deck-slide/closing/2/`,
        `${BASE.origin}/__deck-slide/3/`,
      ];
      const inactive = [
        '#/missing',
        '#/99',
        '#/0',
        '#/closing/bad',
        `${BASE.origin}/__deck-slide/missing`,
      ];
      const external = [`${BASE.origin}0/#/closing`, 'https://example.org/#/closing'];
      if (!indices.some((index) => index === 1)) {
        inactive.push('#/details/1/', '#/2');
      }

      const source = await PDFDocument.load(await onePage());
      const annotations = [...internal, ...inactive, ...external].map((uri) =>
        source.context.register(
          source.context.obj({
            Type: 'Annot',
            Subtype: 'Link',
            Rect: [0, 0, 10, 10],
            A: { S: 'URI', URI: PDFString.of(uri) },
          }),
        ),
      );
      source.getPage(0).node.set(PDFName.of('Annots'), source.context.obj(annotations));
      const pdf = await source.save();
      const result = await assemblePdf({
        ...BASE,
        pages: indices.map((index) => slide(pdf, index)),
        notes: [],
      });
      const document = await PDFDocument.load(result.bytes);
      const links = document.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
      for (let index = 0; index < internal.length; index += 1) {
        const annotation = links.lookup(index, PDFDict);
        const destination = annotation.lookup(PDFName.of('Dest'), PDFArray);
        expect(destination.get(0)).toEqual(document.getPage(targetIndex).ref);
        expect(annotation.get(PDFName.of('A'))).toBeUndefined();
      }

      for (let index = internal.length; index < internal.length + inactive.length; index += 1) {
        const annotation = links.lookup(index, PDFDict);
        expect(annotation.get(PDFName.of('A'))).toBeUndefined();
        expect(annotation.get(PDFName.of('Dest'))).toBeUndefined();
      }

      external.forEach((uri, index) => {
        const annotation = links.lookup(internal.length + inactive.length + index, PDFDict);
        expect(
          annotation
            .lookup(PDFName.of('A'), PDFDict)
            .lookup(PDFName.of('URI'), PDFString)
            .decodeText(),
        ).toBe(uri);
      });
    },
  );

  it('draws a notes page the slide it belongs to when an earlier page could not be copied', async () => {
    const empty = await (await PDFDocument.create()).save({ addDefaultPage: false });
    const result = await assemblePdf({
      ...BASE,
      pages: [slide(empty, 0), slide(await onePage(undefined, 333), 1)],
      notes: [
        {
          pdf: await onePage(),
          slideIndex: 1,
          part: 1,
          slideBox: { x: 72, y: 300, width: 792, height: 445.5 },
        },
      ],
    });
    expect(result.pageCount).toBe(2);
    const document = await PDFDocument.load(result.bytes);
    const notes = document.getPages()[1];
    const form = slideForms(notes)[0];
    expect(form).toBeDefined();
    const content = Buffer.from(inflateSync(form?.getContents() ?? new Uint8Array())).toString(
      'latin1',
    );
    expect(content).toContain('333');
  });

  it('labels the continuation pages of long notes and draws the slide only on the first', async () => {
    const page = await onePage();
    const box = { x: 72, y: 300, width: 792, height: 445.5 };
    const result = await assemblePdf({
      ...BASE,
      pages: [slide(page, 0), slide(page, 1)],
      notes: [
        { pdf: page, slideIndex: 1, part: 1, slideBox: box },
        { pdf: page, slideIndex: 1, part: 2, slideBox: null },
        { pdf: page, slideIndex: 1, part: 3, slideBox: null },
      ],
    });
    expect(result.labels).toEqual(['1', '2', 'Notes 2', 'Notes 2 (2)', 'Notes 2 (3)']);
    expect(result.outline).toEqual(['1. Slide 1', '2. Slide 2', 'Speaker notes']);
    const document = await PDFDocument.load(result.bytes);
    const drawn = document
      .getPages()
      .slice(2)
      .map((notes) => slideForms(notes).length > 0);
    expect(drawn).toEqual([true, false, false]);
  });

  it('merges pages, sets the title and writes one bookmark per slide', async () => {
    const page = await onePage();
    const result = await assemblePdf({
      ...BASE,
      pages: [slide(page, 0), slide(page, 1, '2.1'), slide(page, 1, '2.2')],
      notes: [
        {
          pdf: page,
          slideIndex: 0,
          part: 1,
          slideBox: { x: 72, y: 300, width: 792, height: 445.5 },
        },
      ],
    });
    expect(result.pageCount).toBe(4);
    expect(result.outline).toEqual(['1. Slide 1', '2. Slide 2', 'Speaker notes']);
    expect(result.labels).toEqual(['1', '2.1', '2.2', 'Notes 1']);
    const document = await PDFDocument.load(result.bytes);
    expect(document.getTitle()).toBe('Shade is infrastructure');
  });

  it('writes the language, the dates and an XMP stream that agrees with the Info dictionary', async () => {
    const result = await assemblePdf({
      ...BASE,
      author: 'Dana Okafor',
      pages: [slide(await onePage(), 0)],
      notes: [],
    });
    const document = await PDFDocument.load(result.bytes, { updateMetadata: false });
    expect(document.catalog.get(PDFName.of('Lang'))?.toString()).toBe('(en-GB)');
    expect(document.getAuthor()).toBe('Dana Okafor');
    expect(document.getCreationDate()?.toISOString()).toBe('2026-11-13T12:00:00.000Z');
    const metadata = document.catalog.lookup(PDFName.of('Metadata'), PDFStream);
    const xmp = new TextDecoder().decode(metadata.getContents());
    expect(xmp).toContain('<rdf:li xml:lang="x-default">Shade is infrastructure</rdf:li>');
    expect(xmp).toContain('<rdf:li>Dana Okafor</rdf:li>');
    expect(xmp).toContain('<rdf:li>en-GB</rdf:li>');
    expect(xmp).toContain('<xmp:CreateDate>2026-11-13T12:00:00Z</xmp:CreateDate>');
  });

  it('labels pages with their slide numbers, a range while they count up from one', async () => {
    const page = await onePage();
    const result = await assemblePdf({
      ...BASE,
      pages: [slide(page, 0), slide(page, 1), slide(page, 4)],
      notes: [],
    });
    const document = await PDFDocument.load(result.bytes);
    const labels = document.catalog.lookup(PDFName.of('PageLabels'), PDFDict);
    const nums = labels.lookup(PDFName.of('Nums'), PDFArray);
    expect(nums.size()).toBe(4);
    expect(nums.lookup(0, PDFNumber).asNumber()).toBe(0);
    expect(nums.lookup(1, PDFDict).get(PDFName.of('S'))?.toString()).toBe('/D');
    expect(nums.lookup(2, PDFNumber).asNumber()).toBe(2);
    expect(nums.lookup(3, PDFDict).get(PDFName.of('P'))).toBeDefined();
  });

  it('stores a picture shown on two slides and on a notes page once', async () => {
    const pixels = new Uint8Array(64 * 64 * 3).map((_, index) => (index * 7) % 251);
    const page = await onePage(pixels);
    const result = await assemblePdf({
      ...BASE,
      pages: [slide(page, 0), slide(page, 1)],
      notes: [
        {
          pdf: page,
          slideIndex: 1,
          part: 1,
          slideBox: { x: 72, y: 300, width: 792, height: 445.5 },
        },
      ],
    });
    const document = await PDFDocument.load(result.bytes);
    expect(images(document)).toHaveLength(1);
    expect(result.merged).toBeGreaterThan(0);
  });

  it('merges the structure trees of tagged pages under one Document with renumbered keys', async () => {
    const page = await taggedPage();
    const result = await assemblePdf({
      ...BASE,
      pages: [slide(page, 0), slide(page, 1)],
      notes: [],
    });
    expect(result.tagged).toBe(true);
    const document = await PDFDocument.load(result.bytes);
    const root = document.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
    const top = root.lookup(PDFName.of('K'), PDFDict);
    expect(top.get(PDFName.of('S'))?.toString()).toBe('/Document');
    const sections = top.lookup(PDFName.of('K'), PDFArray);
    expect(sections.size()).toBe(2);
    expect(sections.lookup(0, PDFDict).get(PDFName.of('S'))?.toString()).toBe('/Sect');
    expect(root.lookup(PDFName.of('ParentTreeNextKey'), PDFNumber).asNumber()).toBe(4);
    const pages = document.getPages();
    const keys = pages.map((candidate) =>
      candidate.node.lookup(PDFName.of('StructParents'), PDFNumber).asNumber(),
    );
    expect(keys).toEqual([0, 2]);
    const annotation = pages[1]?.node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    expect(annotation?.lookup(PDFName.of('StructParent'), PDFNumber).asNumber()).toBe(3);
    const paragraph = sections
      .lookup(1, PDFDict)
      .lookup(PDFName.of('K'), PDFArray)
      .lookup(0, PDFDict);
    expect(paragraph.get(PDFName.of('Pg'))).toBe(pages[1]?.ref as PDFRef);
    expect(
      document.catalog.lookup(PDFName.of('MarkInfo'), PDFDict).get(PDFName.of('Marked')),
    ).toBeDefined();
  });

  it('leaves the document untagged when a page has no structure', async () => {
    const result = await assemblePdf({
      ...BASE,
      pages: [slide(await taggedPage(), 0), slide(await onePage(), 1)],
      notes: [],
    });
    expect(result.tagged).toBe(false);
    const document = await PDFDocument.load(result.bytes);
    expect(document.catalog.get(PDFName.of('StructTreeRoot'))).toBeUndefined();
  });

  it('drops marked-content ids from a page drawn on another page', () => {
    const content = new TextEncoder().encode('/P <</MCID 3 >>BDC BT (Hi) Tj ET EMC /Span BMC EMC');
    const text = new TextDecoder().decode(withoutMarkedContentIds(content));
    expect(text).toBe('/P BMC BT (Hi) Tj ET EMC /Span BMC EMC');
  });
});
