import { Effect, FileSystem } from 'effect';
import { create } from 'fontkit';
import path from 'node:path';

import type { RendererFont } from '#verify/renderers.ts';

/**
 * Font file extensions a renderer can install.
 */
const FONT_EXTENSIONS = new Set(['.ttf', '.otf']);

/**
 * The TrueType and OpenType fonts in a folder (the static instances an export writes to
 * `<out>/fonts`), each with the family name it carries; a folder that does not exist has none, and
 * a file that does not parse is left out.
 *
 * @param folder - The folder.
 * @returns The fonts, sorted by file name.
 */
export const fontFilesIn = Effect.fn('fontFilesIn')(function* (
  folder: string,
): Effect.fn.Return<RendererFont[], never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const names = yield* fs.readDirectory(folder).pipe(Effect.orElseSucceed(() => []));
  const fonts: RendererFont[] = [];
  for (const name of [...names].sort()) {
    if (!FONT_EXTENSIONS.has(path.extname(name).toLowerCase())) {
      continue;
    }

    const file = path.join(folder, name);
    const data = yield* fs.readFile(file).pipe(Effect.orElseSucceed(() => null));
    const family = data === null ? null : fontFamily(data);
    if (family !== null) {
      fonts.push({ family, file });
    }
  }

  return fonts;
});

/**
 * The family name a font file carries: its typographic family (name 16), else its family (name 1).
 *
 * @param data - The font file.
 * @returns The family, or `null` when the file does not parse.
 */
export function fontFamily(data: Uint8Array): string | null {
  try {
    const font = create(Buffer.from(data));
    if (!('familyName' in font)) {
      return null;
    }

    const name = font.getName('preferredFamily', 'en') ?? font.familyName;
    return name === '' ? null : name;
  } catch {
    return null;
  }
}
