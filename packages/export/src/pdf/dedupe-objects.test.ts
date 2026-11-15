import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRef,
  PDFStream,
  type PDFObject,
} from 'pdf-lib';
import { describe, expect, it } from 'vite-plus/test';

import { dedupeResources } from '#pdf/dedupe-objects.ts';

/**
 * Adds a form XObject with the given children under `/Child`.
 *
 * @param document - The document.
 * @param payload - The stream bytes.
 * @param children - References the form lists under `/Resources /XObject`.
 * @param ref - A reference allocated earlier, so object numbers can differ from creation order.
 */
function addForm(
  document: PDFDocument,
  payload: string,
  children: PDFRef[],
  ref: PDFRef = document.context.nextRef(),
): PDFRef {
  const xobjects = document.context.obj({});
  children.forEach((child, index) => xobjects.set(PDFName.of(`C${index}`), child));
  const stream = document.context.stream(payload, {
    Type: 'XObject',
    Subtype: 'Form',
    BBox: [0, 0, 1, 1],
    Resources: document.context.obj({ XObject: xobjects }),
  });
  document.context.assign(ref, stream);
  return ref;
}

/**
 * Every reference found inside an object, directly or through nested dictionaries and arrays.
 *
 * @param object - The object.
 * @param found - The references so far.
 */
function referencesIn(object: PDFObject | undefined, found: PDFRef[] = []): PDFRef[] {
  if (object instanceof PDFRef) {
    found.push(object);
  } else if (object instanceof PDFStream) {
    referencesIn(object.dict, found);
  } else if (object instanceof PDFDict) {
    object.values().forEach((value) => referencesIn(value, found));
  } else if (object instanceof PDFArray) {
    object.asArray().forEach((value) => referencesIn(value, found));
  }

  return found;
}

/**
 * The tags of references that point at no object.
 *
 * @param document - The document.
 */
function dangling(document: PDFDocument): string[] {
  const missing: string[] = [];
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    for (const ref of referencesIn(object)) {
      if (document.context.lookup(ref) === undefined) {
        missing.push(ref.tag);
      }
    }
  }

  return missing;
}

describe('dedupeResources', () => {
  it('keeps every reference resolvable through a multi-level merge chain', async () => {
    const document = await PDFDocument.create();
    const [a, b, c, x, y, u, v] = Array.from({ length: 7 }, () => document.context.nextRef()) as [
      PDFRef,
      PDFRef,
      PDFRef,
      PDFRef,
      PDFRef,
      PDFRef,
      PDFRef,
    ];
    addForm(document, 'a', [x], a);
    addForm(document, 'a', [y], b);
    addForm(document, 'a', [y], c);
    addForm(document, 'x', [u], x);
    addForm(document, 'x', [v], y);
    addForm(document, 'leaf', [], u);
    addForm(document, 'leaf', [], v);
    const page = document.addPage([100, 100]);
    page.node.set(
      PDFName.of('Resources'),
      document.context.obj({
        XObject: { A: a, B: b, C: c },
      }),
    );
    const result = dedupeResources(document);
    expect(result.merged).toBeGreaterThan(0);
    expect(dangling(document)).toEqual([]);
    const xobjects = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
    const targets = new Set(xobjects?.values().map((value) => (value as PDFRef).tag));
    expect(targets.size).toBe(1);
  });

  it('leaves no dangling reference for random layered forests of duplicates', async () => {
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let round = 0; round < 40; round += 1) {
      const document = await PDFDocument.create();
      let layer: PDFRef[] = [];
      for (let level = 0; level < 5; level += 1) {
        const next: PDFRef[] = [];
        const count = 3 + Math.floor(random() * 6);
        for (let index = 0; index < count; index += 1) {
          const children = layer.filter(() => random() < 0.5);
          next.push(addForm(document, `l${level}-${Math.floor(random() * 2)}`, children));
        }

        layer = next;
      }

      const page = document.addPage([100, 100]);
      const roots: Record<string, PDFRef> = {};
      layer.forEach((ref, index) => {
        roots[`R${index}`] = ref;
      });
      page.node.set(PDFName.of('Resources'), document.context.obj({ XObject: roots }));
      dedupeResources(document);
      expect(dangling(document)).toEqual([]);
    }
  });
});
