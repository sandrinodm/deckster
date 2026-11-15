import { strToU8, zipSync, type Zippable } from 'fflate';
import path from 'node:path';

import { el, XML_DECLARATION } from '#ooxml/xml.ts';

/**
 * The namespace of package relationship parts.
 */
const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

/**
 * The namespace of `[Content_Types].xml`.
 */
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';

/**
 * Content types by file extension, written as `Default` entries. Parts with other extensions, and
 * XML parts, get an `Override` entry of their own.
 */
const DEFAULT_CONTENT_TYPES: Readonly<Record<string, string>> = {
  /**
   * Relationship parts.
   */
  rels: 'application/vnd.openxmlformats-package.relationships+xml',

  /**
   * Generic XML.
   */
  xml: 'application/xml',

  /**
   * PNG pictures.
   */
  png: 'image/png',

  /**
   * JPEG pictures.
   */
  jpeg: 'image/jpeg',

  /**
   * JPEG pictures.
   */
  jpg: 'image/jpeg',

  /**
   * GIF pictures.
   */
  gif: 'image/gif',

  /**
   * SVG pictures.
   */
  svg: 'image/svg+xml',

  /**
   * MP4 video.
   */
  mp4: 'video/mp4',

  /**
   * QuickTime video.
   */
  mov: 'video/quicktime',

  /**
   * Embedded workbooks of charts.
   */
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

  /**
   * Embedded fonts.
   */
  fntdata: 'application/x-fontdata',
};

/**
 * Compression level for XML parts; pictures and media are stored, since they are compressed
 * already.
 */
const XML_DEFLATE_LEVEL = 6;

/**
 * One relationship from a part (or the package) to another part or an external URL.
 */
export type Relationship = {
  /**
   * The relationship's id within its source, such as `rId3`.
   */
  id: string;

  /**
   * The relationship type URI.
   */
  type: string;

  /**
   * The target: a path relative to the source part's folder, or a URL for external targets.
   */
  target: string;

  /**
   * Whether the target is outside the package.
   */
  external: boolean;
};

/**
 * An Open Packaging Conventions package being built: parts, their content types and the
 * relationships between them. It is written once with {@link OpcPackage.toZip}.
 */
export type OpcPackage = {
  /**
   * Adds or replaces a part.
   *
   * @param partPath - The part's path without a leading slash, such as `ppt/slides/slide1.xml`.
   * @param data - Its content; strings are written as UTF-8.
   * @param contentType - Its content type; an XML part needs one, a picture's comes from its
   *   extension.
   */
  addPart: (partPath: string, data: string | Uint8Array, contentType?: string) => void;

  /**
   * Adds a relationship from a part, or from the package when `source` is empty, and returns its
   * id. A relationship to the same target with the same type is returned instead of a duplicate.
   *
   * @param source - The source part's path, or `''` for the package.
   * @param type - The relationship type URI.
   * @param target - The target part's path from the package root, or a URL when `external`.
   * @param external - Whether the target is a URL outside the package.
   */
  relate: (source: string, type: string, target: string, external?: boolean) => string;

  /**
   * Whether a part exists.
   *
   * @param partPath - The part's path.
   */
  has: (partPath: string) => boolean;

  /**
   * The zipped package.
   */
  toZip: () => Uint8Array;
};

/**
 * A part as it was added: its content and the content type it was given, if any.
 */
type Part = {
  /**
   * Its content; strings are written as UTF-8.
   */
  data: string | Uint8Array;

  /**
   * Its content type, when the caller gave one.
   */
  contentType: string | undefined;
};

/**
 * Creates an empty package.
 *
 * @returns The builder.
 */
export function createPackage(): OpcPackage {
  const parts = new Map<string, Part>();
  const relationships = new Map<string, Relationship[]>();
  return {
    addPart: (partPath, data, contentType) => {
      parts.set(partPath, { data, contentType });
    },
    relate: (source, type, target, external = false) => {
      const list = relationships.get(source) ?? [];
      const relative = external ? target : relativeTarget(source, target);
      const existing = list.find((rel) => rel.type === type && rel.target === relative);
      if (existing !== undefined) {
        return existing.id;
      }

      const id = `rId${list.length + 1}`;
      list.push({ id, type, target: relative, external });
      relationships.set(source, list);
      return id;
    },
    has: (partPath) => parts.has(partPath),
    toZip: () => zipPackage(parts, relationships),
  };
}

/**
 * The path of a part's relationships part: `ppt/slides/_rels/slide1.xml.rels`.
 *
 * @param source - The source part, or `''` for the package.
 */
export function relationshipsPath(source: string): string {
  if (source === '') {
    return '_rels/.rels';
  }

  return path.posix.join(
    path.posix.dirname(source),
    '_rels',
    `${path.posix.basename(source)}.rels`,
  );
}

/**
 * A target path relative to the source part's folder, as relationships write it.
 *
 * @param source - The source part, or `''` for the package.
 * @param target - The target's path from the package root.
 */
function relativeTarget(source: string, target: string): string {
  if (source === '') {
    return target;
  }

  return path.posix.relative(path.posix.dirname(source), target);
}

/**
 * Zips the parts with `[Content_Types].xml` and every relationships part. `[Content_Types].xml`
 * goes first, as some readers expect.
 *
 * @param parts - The parts.
 * @param relationships - The relationships by source.
 */
function zipPackage(
  parts: ReadonlyMap<string, Part>,
  relationships: ReadonlyMap<string, readonly Relationship[]>,
): Uint8Array {
  const files: Zippable = {};
  files['[Content_Types].xml'] = [strToU8(contentTypesXml(parts)), { level: XML_DEFLATE_LEVEL }];
  for (const [source, list] of relationships) {
    files[relationshipsPath(source)] = [
      strToU8(relationshipsXml(list)),
      { level: XML_DEFLATE_LEVEL },
    ];
  }

  for (const [partPath, part] of parts) {
    if (typeof part.data === 'string') {
      files[partPath] = [strToU8(part.data), { level: XML_DEFLATE_LEVEL }];
    } else {
      files[partPath] = [part.data, { level: 0 }];
    }
  }

  return zipSync(files);
}

/**
 * `[Content_Types].xml`: a default per known extension in use, and an override per part whose type
 * its extension does not give.
 *
 * @param parts - The parts.
 */
function contentTypesXml(parts: ReadonlyMap<string, Part>): string {
  const extensions = new Set(['rels', 'xml']);
  const overrides: string[] = [];
  for (const [partPath, part] of parts) {
    const extension = path.posix.extname(partPath).slice(1).toLowerCase();
    const fallback = DEFAULT_CONTENT_TYPES[extension];
    if (part.contentType === undefined || part.contentType === fallback) {
      extensions.add(extension);
    } else {
      overrides.push(el('Override', { PartName: `/${partPath}`, ContentType: part.contentType }));
    }
  }

  const defaults = [...extensions].flatMap((extension) => {
    const type = DEFAULT_CONTENT_TYPES[extension];
    return type === undefined ? [] : [el('Default', { Extension: extension, ContentType: type })];
  });
  return XML_DECLARATION + el('Types', { xmlns: CONTENT_TYPES_NS }, ...defaults, ...overrides);
}

/**
 * A relationships part.
 *
 * @param list - The relationships.
 */
function relationshipsXml(list: readonly Relationship[]): string {
  const items = list.map((rel) =>
    el('Relationship', {
      Id: rel.id,
      Type: rel.type,
      Target: rel.target,
      TargetMode: rel.external ? 'External' : undefined,
    }),
  );
  return XML_DECLARATION + el('Relationships', { xmlns: RELATIONSHIPS_NS }, ...items);
}
