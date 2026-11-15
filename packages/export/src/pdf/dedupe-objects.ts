import { createHash } from 'node:crypto';
import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFRef,
  PDFStream,
  type PDFContext,
  type PDFDocument,
  type PDFObject,
} from 'pdf-lib';

/**
 * The most passes {@link dedupeResources} makes; each pass can only merge objects whose referenced
 * objects were merged in an earlier one, and resource graphs are a few levels deep.
 */
const MAX_PASSES = 12;

/**
 * What deduplication merged.
 */
export type DedupeResult = {
  /**
   * Indirect objects removed because an identical one was kept.
   */
  merged: number;

  /**
   * Stream bytes removed with them.
   */
  bytesSaved: number;
};

/**
 * Merges identical resources across pages: every indirect object reachable from a page's
 * `/Resources` (images and their soft masks, fonts and their programs, patterns, graphics states,
 * form XObjects) that has the same dictionary and stream bytes as another is replaced by that one,
 * and the copy is deleted. Chromium prints each slide as its own document, so a photo shown on two
 * slides, the grain tile of a gradient surface, or a font program that came out byte-identical is
 * otherwise stored once per page. Pages, annotations, outline items and the structure tree are
 * never merged.
 *
 * @param document - The assembled document; changed in place.
 * @returns How many objects were merged and the stream bytes saved.
 */
export function dedupeResources(document: PDFDocument): DedupeResult {
  const { context } = document;
  const candidates = resourceRefs(document);
  const canonical = new Map<string, PDFRef>();
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const seen = new Map<string, PDFRef>();
    let changed = false;
    for (const ref of candidates) {
      if (canonical.has(ref.tag)) {
        continue;
      }

      const object = context.lookup(ref);
      if (object === undefined) {
        continue;
      }

      const key = objectKey(object, canonical);
      const first = seen.get(key);
      if (first === undefined) {
        seen.set(key, ref);
      } else {
        canonical.set(ref.tag, first);
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  return replaceMerged(context, compressChains(canonical));
}

/**
 * The object a merged tag finally stands for: merges can chain (C into B in one pass, B into A in
 * the next), so the map is followed until it reaches an object that was kept.
 *
 * @param canonical - Merged references by tag.
 * @param ref - A reference.
 */
function keptRef(canonical: ReadonlyMap<string, PDFRef>, ref: PDFRef): PDFRef {
  let current = ref;
  const visited = new Set<string>();
  for (;;) {
    const next = canonical.get(current.tag);
    if (next === undefined || visited.has(current.tag)) {
      return current;
    }

    visited.add(current.tag);
    current = next;
  }
}

/**
 * The same map with every entry pointing straight at the kept object, so one lookup is enough for
 * rewriting references and no merged object is the target of another.
 *
 * @param canonical - Merged references by tag.
 */
function compressChains(canonical: ReadonlyMap<string, PDFRef>): Map<string, PDFRef> {
  const compressed = new Map<string, PDFRef>();
  for (const [tag, ref] of canonical) {
    compressed.set(tag, keptRef(canonical, ref));
  }

  return compressed;
}

/**
 * Every indirect object reachable from a page's resources, in a stable order.
 *
 * @param document - The document.
 */
function resourceRefs(document: PDFDocument): PDFRef[] {
  const { context } = document;
  const found = new Map<string, PDFRef>();
  const stack: PDFObject[] = document.getPages().flatMap((page) => {
    const resources = page.node.get(PDFName.of('Resources'));
    return resources === undefined ? [] : [resources];
  });
  while (stack.length > 0) {
    const object = stack.pop();
    if (object instanceof PDFRef) {
      if (found.has(object.tag)) {
        continue;
      }

      found.set(object.tag, object);
      const target = context.lookup(object);
      if (target !== undefined) {
        stack.push(target);
      }
    } else if (object instanceof PDFStream) {
      stack.push(object.dict);
    } else if (object instanceof PDFDict) {
      stack.push(...object.values());
    } else if (object instanceof PDFArray) {
      stack.push(...object.asArray());
    }
  }

  return [...found.values()].sort((a, b) => a.objectNumber - b.objectNumber);
}

/**
 * A key that is equal for two objects exactly when they are the same object once merged references
 * are followed: the serialised dictionary or array with references replaced by their kept object,
 * and a hash of a stream's encoded bytes.
 *
 * @param object - The object.
 * @param canonical - Merged references by tag, pointing at the kept object.
 */
function objectKey(object: PDFObject, canonical: ReadonlyMap<string, PDFRef>): string {
  if (object instanceof PDFStream) {
    const hash = createHash('sha256').update(object.getContents()).digest('hex');
    return `stream:${serialise(object.dict, canonical)}:${hash}`;
  }

  return serialise(object, canonical);
}

/**
 * An object as text, references replaced by their kept object.
 *
 * @param object - The object.
 * @param canonical - Merged references by tag.
 */
function serialise(object: PDFObject, canonical: ReadonlyMap<string, PDFRef>): string {
  if (object instanceof PDFRef) {
    return `@${keptRef(canonical, object).tag}`;
  }

  if (object instanceof PDFDict) {
    const entries = object
      .entries()
      .map(([key, value]) => `${key.asString()} ${serialise(value, canonical)}`)
      .sort();
    return `<<${entries.join(' ')}>>`;
  }

  if (object instanceof PDFArray) {
    return `[${object
      .asArray()
      .map((value) => serialise(value, canonical))
      .join(' ')}]`;
  }

  return object.toString();
}

/**
 * Points every reference to a merged object at the kept one and deletes the merged objects.
 *
 * @param context - The document's context.
 * @param canonical - Merged references by tag.
 */
function replaceMerged(context: PDFContext, canonical: ReadonlyMap<string, PDFRef>): DedupeResult {
  if (canonical.size === 0) {
    return { merged: 0, bytesSaved: 0 };
  }

  rewriteReferences(context, canonical);
  const bytesSaved = deleteMerged(context, canonical);
  return { merged: canonical.size, bytesSaved };
}

/**
 * Points the references inside every object that is kept at the kept objects. The merged objects
 * themselves are skipped, since {@link deleteMerged} removes them.
 *
 * @param context - The document's context; its objects are changed in place.
 * @param canonical - Merged references by tag.
 */
function rewriteReferences(context: PDFContext, canonical: ReadonlyMap<string, PDFRef>): void {
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (!canonical.has(ref.tag)) {
      rewriteObject(object, canonical);
    }
  }
}

/**
 * Rewrites the references inside one object, recursing into direct dictionaries and arrays.
 *
 * @param object - The object; changed in place.
 * @param canonical - Merged references by tag.
 */
function rewriteObject(object: PDFObject, canonical: ReadonlyMap<string, PDFRef>): void {
  if (object instanceof PDFStream) {
    rewriteObject(object.dict, canonical);
  } else if (object instanceof PDFDict) {
    for (const [key, value] of object.entries()) {
      object.set(key, keptValue(value, canonical));
      rewriteObject(value, canonical);
    }
  } else if (object instanceof PDFArray) {
    for (let index = 0; index < object.size(); index += 1) {
      const value = object.get(index);
      object.set(index, keptValue(value, canonical));
      rewriteObject(value, canonical);
    }
  }
}

/**
 * The kept reference for a value, or the value itself.
 *
 * @param value - The value.
 * @param canonical - Merged references by tag.
 */
function keptValue(value: PDFObject, canonical: ReadonlyMap<string, PDFRef>): PDFObject {
  return value instanceof PDFRef ? (canonical.get(value.tag) ?? value) : value;
}

/**
 * Deletes the merged objects.
 *
 * @param context - The document's context.
 * @param canonical - Merged references by tag.
 * @returns The stream bytes the deleted objects held.
 */
function deleteMerged(context: PDFContext, canonical: ReadonlyMap<string, PDFRef>): number {
  let bytesSaved = 0;
  for (const tag of canonical.keys()) {
    const ref = refOf(tag);
    const object = context.lookup(ref);
    if (object instanceof PDFStream) {
      bytesSaved += object.getContents().length;
    }

    context.delete(ref);
  }

  return bytesSaved;
}

/**
 * The reference for a tag such as `12 0 R`.
 *
 * @param tag - The tag.
 */
function refOf(tag: string): PDFRef {
  const [objectNumber, generation] = tag.split(' ');
  return PDFRef.of(Number(objectNumber), Number(generation));
}
