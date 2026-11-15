import type { SlideKind } from '@deckster/engine/manifest';

import type { Problem } from '#errors.ts';

import { SLIDES_DIR } from '#decks/deck-paths.ts';
import { suggest } from '#suggest.ts';

/**
 * The kind of slide each file extension in `slides/` holds; other extensions are not slides.
 */
const SLIDE_EXTENSIONS: Readonly<Record<string, SlideKind>> = {
  /**
   * An MDX slide.
   */
  '.mdx': 'mdx',

  /**
   * A TSX slide.
   */
  '.tsx': 'tsx',
};

/**
 * The extension at the end of a file name, dot included.
 */
const EXTENSION_PATTERN = /\.[^.]+$/;

/**
 * A slide file the manifest lists.
 */
export type SlideFile = {
  /**
   * The slide id: the file name without its extension.
   */
  id: string;

  /**
   * The file name inside `slides/`, such as `title.mdx`.
   */
  fileName: string;

  /**
   * Whether the slide is MDX or TSX.
   */
  kind: SlideKind;
};

/**
 * The manifest order resolved against the files in `slides/`.
 */
export type SlideOrder = {
  /**
   * The listed slides that have exactly one file, in manifest order.
   */
  slides: SlideFile[];

  /**
   * Problems that stop the build: listed slides with no file, duplicates, ambiguous files.
   */
  problems: Problem[];

  /**
   * Slide files the manifest does not list; they are not slides (the build does not validate them
   * as slides) and are left out of the deck.
   */
  warnings: string[];
};

/**
 * Matches the ordered slide ids from `deck.config.ts` to the files in `slides/`. Each id must name
 * exactly one `<id>.mdx` or `<id>.tsx`. Other file types are ignored.
 *
 * @param ids - Slide ids in manifest order.
 * @param fileNames - The file names found in `slides/`.
 */
export function resolveSlideOrder(
  ids: readonly string[],
  fileNames: readonly string[],
): SlideOrder {
  const filesById = groupSlideFiles(fileNames);
  const problems: Problem[] = [];
  const slides: SlideFile[] = [];
  const seen = new Set<string>();
  for (const [index, id] of ids.entries()) {
    const files = filesById.get(id) ?? [];
    const problem = slideProblem(id, index, files, seen, filesById.keys());
    seen.add(id);
    if (problem !== undefined) {
      problems.push(problem);
    } else if (files[0] !== undefined) {
      slides.push(files[0]);
    }
  }

  const warnings = [...filesById.values()]
    .flat()
    .filter((file) => !seen.has(file.id))
    .map(unlistedWarning);
  return { slides, problems, warnings };
}

/**
 * The slide files in `slides/` grouped by id, in file-name order; files that are not `.mdx` or
 * `.tsx` are left out.
 *
 * @param fileNames - The file names found in `slides/`.
 */
function groupSlideFiles(fileNames: readonly string[]): Map<string, SlideFile[]> {
  const filesById = new Map<string, SlideFile[]>();
  for (const fileName of [...fileNames].sort()) {
    const extension = EXTENSION_PATTERN.exec(fileName)?.[0] ?? '';
    const kind = SLIDE_EXTENSIONS[extension];
    if (kind === undefined) {
      continue;
    }

    const id = fileName.slice(0, -extension.length);
    filesById.set(id, [...(filesById.get(id) ?? []), { id, fileName, kind }]);
  }

  return filesById;
}

/**
 * What is wrong with one listed id, or `undefined` when it names exactly one file: listed twice,
 * matching both an MDX and a TSX file, or matching none.
 *
 * @param id - The listed slide id.
 * @param index - Its position in the list, for the message.
 * @param files - The files with that id.
 * @param seen - The ids listed before it.
 * @param available - Every id that has a file, for a "did you mean" fix.
 */
function slideProblem(
  id: string,
  index: number,
  files: readonly SlideFile[],
  seen: ReadonlySet<string>,
  available: Iterable<string>,
): Problem | undefined {
  if (seen.has(id)) {
    return {
      message: `slides[${index}] lists "${id}" a second time.`,
      fix: `Remove the duplicate "${id}"; each slide appears once.`,
    };
  }

  if (files.length > 1) {
    const names = files.map((file) => `${SLIDES_DIR}/${file.fileName}`).join(' and ');
    return {
      message: `slides[${index}] "${id}" matches both ${names}.`,
      fix: 'Delete or rename one of them so the id names a single file.',
    };
  }

  if (files.length === 0) {
    return missingSlide(id, index, available);
  }

  return undefined;
}

/**
 * The problem for a listed id with no file, suggesting the closest id that has one.
 *
 * @param id - The listed slide id.
 * @param index - Its position in the list, for the message.
 * @param available - Every id that has a file.
 */
function missingSlide(id: string, index: number, available: Iterable<string>): Problem {
  const closest = suggest(id, available);
  const files = `${SLIDES_DIR}/${id}.mdx or ${SLIDES_DIR}/${id}.tsx`;
  return {
    message: `slides[${index}] "${id}" has no file in ${SLIDES_DIR}/.`,
    fix:
      closest === undefined ? `Create ${files}.` : `Change it to "${closest}", or create ${files}.`,
  };
}

/**
 * The warning for a slide file the manifest leaves out.
 *
 * @param file - The unlisted slide file.
 */
function unlistedWarning(file: SlideFile): string {
  return (
    `${SLIDES_DIR}/${file.fileName} is not listed in deck.config.ts, so it is not a slide ` +
    `and the deck leaves it out. Add "${file.id}" to slides to show it, or keep it there if ` +
    'slides import it.'
  );
}
