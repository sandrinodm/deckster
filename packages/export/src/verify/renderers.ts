import type { ChildProcessSpawner } from 'effect/process';

import { Effect, FileSystem } from 'effect';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import os from 'node:os';
import path from 'node:path';

import { exportError, type ExportError } from '#export-error.ts';
import { bindMount, dockerStatus, ensureImage, type DockerStatus } from '#verify/docker-image.ts';
import { runProcess } from '#verify/run-process.ts';

/**
 * Characters that cannot name one staged font file inside its assigned directory.
 */
const UNSAFE_FONT_FILENAME_PATTERN = /[^A-Za-z0-9 .-]+/g;

/**
 * Repeated placeholder characters collapse to one underscore.
 */
const REPEATED_UNDERSCORE_PATTERN = /_+/g;

/**
 * Leading dots cannot carry a staged font name outside its directory.
 */
const LEADING_DOTS_PATTERN = /^\.+/g;

/**
 * The resolution LibreOffice's PDF is rasterised at: 144 dpi turns a 13.333-inch slide into 1920
 * pixels.
 */
const LIBREOFFICE_DPI = 144;

/**
 * The thumbnail size Quick Look renders, in pixels along the longer side.
 */
const QUICK_LOOK_SIZE = 1920;

/**
 * How long Keynote gets to open and export a presentation, in seconds.
 */
const KEYNOTE_TIMEOUT_S = 180;

/**
 * Where Keynote is installed on macOS.
 */
const KEYNOTE_APP = '/Applications/Keynote.app';

/**
 * The AppleScript that opens a presentation in Keynote and exports its slides as PNG files.
 */
const KEYNOTE_SCRIPT = [
  'on run argv',
  '  tell application "Keynote"',
  '    set theDoc to open (POSIX file (item 1 of argv))',
  '    export theDoc to (POSIX file (item 2 of argv)) as slide images ' +
    'with properties {image format:PNG, skipped slides:false}',
  '    close theDoc saving no',
  '  end tell',
  'end run',
].join('\n');

/**
 * Whatever is not a lower-case letter or a digit: removed when names are compared.
 */
const NON_ALPHANUMERIC = /[^a-z0-9]/g;

/**
 * The embedded font list of a presentation, or the empty form of it.
 */
const EMBEDDED_FONT_LIST = /<p:embeddedFontLst>[\s\S]*?<\/p:embeddedFontLst>|<p:embeddedFontLst\/>/;

/**
 * The font file extensions the LibreOffice container installs; any other staged file is named
 * `.ttf`.
 */
const FONT_EXTENSIONS: ReadonlySet<string> = new Set(['.ttf', '.otf', '.woff', '.woff2', '.ttc']);

/**
 * The page number at the end of a picture's file name, such as `07` in `page-07.png`.
 */
const PAGE_NUMBER = /(\d+)\.png$/;

/**
 * The renderers `deck export --verify` can use: LibreOffice with the export's fonts installed,
 * LibreOffice with no brand fonts and the embedded fonts removed (what an app that ignores
 * embedding shows: the declared substitutes), LibreOffice with no brand fonts but the file as
 * written (its embedded fonts), Quick Look and Keynote.
 */
export const RENDERER_IDS = [
  'libreoffice',
  'libreoffice-nofonts',
  'libreoffice-embedded',
  'quicklook',
  'keynote',
] as const;

/**
 * The renderers `--verify` uses without `--renderer`: the ones that run unattended. Keynote is
 * opt-in, since it opens the application.
 */
export const DEFAULT_RENDERER_IDS: readonly RendererId[] = [
  'libreoffice',
  'libreoffice-nofonts',
  'quicklook',
];

/**
 * The substitutes the LibreOffice image has for families a recipient's computer has.
 */
const LIBREOFFICE_SUBSTITUTES =
  'substitutes Liberation Sans/Serif/Mono for Arial, Helvetica, Times New Roman and Courier New, ' +
  'DejaVu Serif for Georgia, DejaVu Sans Mono for Menlo, ' +
  'Carlito and Caladea for Calibri and Cambria';

/**
 * The folders macOS loads fonts from.
 */
const MAC_FONT_DIRS = [
  path.join(os.homedir(), 'Library', 'Fonts'),
  '/Library/Fonts',
  '/System/Library/Fonts',
  '/System/Library/Fonts/Supplemental',
];

/**
 * One of {@link RENDERER_IDS}.
 */
export type RendererId = (typeof RENDERER_IDS)[number];

/**
 * The LibreOffice passes: the same Impress image, with the brand's fonts installed, with none, or
 * with none and the file's embedded fonts as written.
 */
type LibreOfficeRendererId = 'libreoffice' | 'libreoffice-nofonts' | 'libreoffice-embedded';

/**
 * A font file to install in a renderer, under the brand's family name.
 */
export type RendererFont = {
  /**
   * The family name the deck uses.
   */
  family: string;

  /**
   * The font file (WOFF2, TTF or OTF).
   */
  file: string;
};

/**
 * What a renderer produced.
 */
export type RenderedSlides = {
  /**
   * The renderer.
   */
  renderer: RendererId;

  /**
   * One PNG per slide, in order; `null` where the renderer produced nothing for a slide.
   */
  pages: (string | null)[];
};

/**
 * What a renderer gets: the presentation, the same slides as one-slide presentations (Quick Look
 * renders only a file's first slide), a work folder and the brand's fonts.
 */
export type RenderInput = {
  /**
   * The whole presentation.
   */
  deck: string;

  /**
   * One single-slide presentation per slide, in order.
   */
  singles: readonly string[];

  /**
   * A folder the renderer may write to.
   */
  workDir: string;

  /**
   * Fonts to install where the renderer allows it (LibreOffice in Docker); Quick Look and Keynote
   * use the fonts installed on this Mac.
   */
  fonts: readonly RendererFont[];
};

/**
 * Something that turns a PPTX into pictures of its slides.
 */
export type Renderer = {
  /**
   * Its id.
   */
  id: RendererId;

  /**
   * What it is, for reports: engine, version where known, and which fonts it had.
   */
  label: string;

  /**
   * Renders every slide.
   */
  render: (
    input: RenderInput,
  ) => Effect.Effect<
    RenderedSlides,
    ExportError,
    FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
  >;
};

/**
 * What the renderers are told about fonts, for their labels.
 */
export type RendererFontContext = {
  /**
   * The fonts the `libreoffice` pass installs; the export's static instances, else the brand's
   * faces.
   */
  fonts: readonly RendererFont[];

  /**
   * Every family the presentation names (brand families and instance families), to report which are
   * installed on this Mac for Quick Look and Keynote.
   */
  families: readonly string[];
};

/**
 * The renderers that work on this machine, among the ones asked for: LibreOffice Impress in Docker
 * in up to three font set-ups (the export's fonts installed; no brand fonts and the embedded fonts
 * removed; no brand fonts with the file as written), Apple's Office renderer through Quick Look
 * (macOS only; the fonts installed on this Mac) and Keynote through AppleScript (macOS only,
 * opt-in, needs Automation permission for the terminal). Each label says which fonts it had.
 *
 * @param requested - The renderer ids to try.
 * @param context - The fonts, for the labels.
 * @returns The available renderers, for each one that is not why, and the Docker status.
 */
export const detectRenderers = Effect.fn('detectRenderers')(function* (
  requested: readonly RendererId[],
  context: RendererFontContext = { fonts: [], families: [] },
): Effect.fn.Return<
  {
    renderers: Renderer[];
    unavailable: { id: RendererId; why: string }[];
    docker: DockerStatus | null;
  },
  never,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> {
  const fs = yield* FileSystem.FileSystem;
  const renderers: Renderer[] = [];
  const unavailable: { id: RendererId; why: string }[] = [];
  const isMac = process.platform === 'darwin';
  const docker = requested.some((id) => id.startsWith('libreoffice'))
    ? yield* dockerStatus()
    : null;
  const installed = isMac ? yield* macFontFiles() : [];
  for (const id of requested) {
    if (id === 'libreoffice' || id === 'libreoffice-nofonts' || id === 'libreoffice-embedded') {
      if (docker === null || docker.kind === 'ready') {
        renderers.push(libreOfficeRenderer(id, context.fonts));
      } else {
        unavailable.push({ id, why: docker.why });
      }
    } else if (!isMac) {
      unavailable.push({ id, why: 'it needs macOS' });
    } else if (
      id === 'keynote' &&
      !(yield* fs.exists(KEYNOTE_APP).pipe(Effect.orElseSucceed(() => false)))
    ) {
      unavailable.push({ id, why: 'Keynote is not installed' });
    } else {
      const fonts = macFontLabel(context.families, installed);
      renderers.push(id === 'keynote' ? keynoteRenderer(fonts) : quickLookRenderer(fonts));
    }
  }

  return { renderers, unavailable, docker };
});

/**
 * The font file names installed on this Mac, lower case.
 */
const macFontFiles = Effect.fn('macFontFiles')(function* (): Effect.fn.Return<
  string[],
  never,
  FileSystem.FileSystem
> {
  const fs = yield* FileSystem.FileSystem;
  const names: string[] = [];
  for (const folder of MAC_FONT_DIRS) {
    const listed = yield* fs.readDirectory(folder).pipe(Effect.orElseSucceed(() => []));
    names.push(...listed.map((name) => name.toLowerCase()));
  }

  return names;
});

/**
 * Which of the presentation's families have a font file on this Mac, for a label.
 *
 * @param families - The families the presentation names.
 * @param files - The font file names installed, lower case.
 * @returns Such as `brand fonts installed on this Mac: Inter; not installed: Fraunces`.
 */
export function macFontLabel(families: readonly string[], files: readonly string[]): string {
  if (families.length === 0) {
    return 'fonts installed on this Mac only';
  }

  /**
   * A name lower case without spaces or punctuation, for matching file names.
   */
  const squash = (name: string): string => name.toLowerCase().replace(NON_ALPHANUMERIC, '');
  const squashed = files.map((file) => squash(file));
  const unique = [...new Set(families)];
  const found = unique.filter((family) => squashed.some((file) => file.startsWith(squash(family))));
  const missing = unique.filter((family) => !found.includes(family));
  const parts = [
    found.length === 0
      ? "none of the presentation's fonts installed on this Mac"
      : `installed on this Mac: ${found.join(', ')}`,
    ...(missing.length === 0 || found.length === 0 ? [] : [`not installed: ${missing.join(', ')}`]),
  ];
  return parts.join('; ');
}

/**
 * The label of a LibreOffice pass: which fonts it had.
 *
 * @param id - The pass.
 * @param fonts - The fonts the `libreoffice` pass installs.
 */
export function libreOfficeLabel(
  id: LibreOfficeRendererId,
  fonts: readonly RendererFont[],
): string {
  const engine = 'LibreOffice Impress 7.4 (Debian bookworm, Docker)';
  if (id === 'libreoffice') {
    const families = [...new Set(fonts.map((font) => font.family))];
    return `${engine}, fonts installed: ${families.length === 0 ? 'none' : families.join(', ')}`;
  }

  if (id === 'libreoffice-nofonts') {
    const removed =
      'brand fonts not installed and embedded fonts removed (an app that ignores embedding)';
    return `${engine}, ${removed}; ${LIBREOFFICE_SUBSTITUTES}`;
  }

  return `${engine}, brand fonts not installed, the file's embedded fonts as written`;
}

/**
 * A presentation without its embedded font list, so a renderer substitutes installed fonts as an
 * app that ignores embedding does. The font parts stay; nothing refers to them.
 *
 * @param pptx - The presentation.
 * @returns The presentation without `p:embeddedFontLst`, or the same bytes when it has none.
 */
export function withoutEmbeddedFonts(pptx: Uint8Array): Uint8Array {
  const files = unzipSync(pptx);
  const presentation = files['ppt/presentation.xml'];
  if (presentation === undefined) {
    return pptx;
  }

  const xml = strFromU8(presentation);
  const stripped = xml.replace(EMBEDDED_FONT_LIST, '');
  if (stripped === xml) {
    return pptx;
  }

  files['ppt/presentation.xml'] = strToU8(stripped);
  return zipSync(files);
}

/**
 * The folders and files a LibreOffice pass works in, as the container sees them.
 */
type LibreOfficeWork = {
  /**
   * The pass's folder, mounted at `/work`.
   */
  workDir: string;

  /**
   * The folder of the brand's fonts, mounted at `/fonts` for the `libreoffice` pass.
   */
  fontsDir: string;

  /**
   * The folder the pictures are written to, `pages` in the work folder.
   */
  outDir: string;

  /**
   * The folder holding the presentation, mounted read-only at `/deck`.
   */
  deckDir: string;

  /**
   * The presentation's file name inside the deck folder.
   */
  deckName: string;
};

/**
 * LibreOffice Impress in Docker: converts the deck to PDF and rasterises it at 1920x1080. The
 * `libreoffice` pass installs the fonts given; the other two install none, and
 * `libreoffice-nofonts` renders a copy without the embedded font list.
 *
 * @param id - The pass.
 * @param fonts - The fonts the `libreoffice` pass installs.
 */
function libreOfficeRenderer(id: LibreOfficeRendererId, fonts: readonly RendererFont[]): Renderer {
  return {
    id,
    label: libreOfficeLabel(id, fonts),
    render: Effect.fn('renderWithLibreOffice')(function* (input) {
      const fs = yield* FileSystem.FileSystem;
      const image = yield* ensureImage('libreoffice');
      const work = yield* stageLibreOffice(id, input);
      const result = yield* runProcess(
        'docker',
        libreOfficeRunArgs(id, work, image),
        'Start Docker and run the command again.',
      );
      if (result.code !== 0) {
        return yield* exportError(
          `render the PPTX with LibreOffice (${id})`,
          result.stderr.trim(),
          'Run the command again; if it fails again, open the PPTX in LibreOffice to see the ' +
            'error.',
        );
      }

      const names = yield* fs
        .readDirectory(work.outDir)
        .pipe(Effect.mapError(writeError(work.outDir)));
      const pages = names
        .filter((name) => name.startsWith('page-') && name.endsWith('.png'))
        .sort((a, b) => pageNumber(a) - pageNumber(b));
      return {
        renderer: id,
        pages: input.singles.map((_, index) =>
          pages[index] === undefined ? null : path.join(work.outDir, pages[index]),
        ),
      };
    }),
  };
}

/**
 * The `docker run` arguments of a LibreOffice pass: the deck folder read-only, the work folder, the
 * brand's fonts for the `libreoffice` pass only, then the image, the deck, the page folder and the
 * resolution.
 *
 * @param id - The pass.
 * @param work - The pass's folders.
 * @param image - The image tag.
 */
export function libreOfficeRunArgs(
  id: LibreOfficeRendererId,
  work: LibreOfficeWork,
  image: string,
): string[] {
  return [
    'run',
    '--rm',
    // Rendering uses local files. Avoid creating host interfaces that interrupt Chromium requests.
    '--network=none',
    '--mount',
    bindMount(work.deckDir, '/deck', true),
    '--mount',
    bindMount(work.workDir, '/work', false),
    ...(id === 'libreoffice' ? ['--mount', bindMount(work.fontsDir, '/fonts', true)] : []),
    image,
    `/deck/${work.deckName}`,
    '/work/pages',
    String(LIBREOFFICE_DPI),
  ];
}

/**
 * The file name a font is staged under for the LibreOffice container: its family, then its index
 * and its extension, one of the known font ones (`Inter Deck__0.ttf`). The container installs the
 * font under the family in the name, so the family stays, but only as one path segment: anything
 * but letters, digits, spaces, dots and hyphens becomes `_`, and a run of underscores is one, so a
 * family such as `../../x` cannot name a file outside the fonts folder.
 *
 * @param family - The font's family name.
 * @param index - The font's position in the list, which keeps names unique.
 * @param file - The font file, for its extension.
 */
export function stagedFontName(family: string, index: number, file: string): string {
  const safe = family
    .replaceAll(UNSAFE_FONT_FILENAME_PATTERN, '_')
    .replaceAll(REPEATED_UNDERSCORE_PATTERN, '_');
  const name = safe.replaceAll(LEADING_DOTS_PATTERN, '').trim();
  const found = path.extname(file).toLowerCase();
  const extension = FONT_EXTENSIONS.has(found) ? found : '.ttf';
  return `${name === '' ? 'font' : name}__${index}${extension}`;
}

/**
 * Prepares a LibreOffice pass's work folder: empty folders for the fonts, the pages and the deck,
 * the brand's fonts copied in for the `libreoffice` pass, and the presentation written there
 * (without its embedded font list for `libreoffice-nofonts`).
 *
 * @param id - The pass.
 * @param input - The presentation and the work folder.
 * @returns The folders the container needs.
 */
const stageLibreOffice = Effect.fn('stageLibreOffice')(function* (
  id: LibreOfficeRendererId,
  input: RenderInput,
): Effect.fn.Return<LibreOfficeWork, ExportError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const workDir = path.join(input.workDir, id);
  const fontsDir = path.join(workDir, 'fonts');
  const outDir = path.join(workDir, 'pages');
  const deckDir = path.join(workDir, 'deck');
  yield* fs.remove(workDir, { recursive: true }).pipe(Effect.ignore);
  for (const folder of [fontsDir, outDir, deckDir]) {
    yield* fs.makeDirectory(folder, { recursive: true }).pipe(Effect.mapError(writeError(folder)));
  }

  if (id === 'libreoffice') {
    for (const [index, font] of input.fonts.entries()) {
      const target = path.join(fontsDir, stagedFontName(font.family, index, font.file));
      yield* fs.copyFile(font.file, target).pipe(Effect.mapError(writeError(target)));
    }
  }

  const deck = path.join(deckDir, path.basename(input.deck));
  const original = yield* fs.readFile(input.deck).pipe(Effect.mapError(writeError(input.deck)));
  yield* fs
    .writeFile(deck, id === 'libreoffice-nofonts' ? withoutEmbeddedFonts(original) : original)
    .pipe(Effect.mapError(writeError(deck)));
  return { workDir, fontsDir, outDir, deckDir, deckName: path.basename(deck) };
});

/**
 * Apple's Office document renderer through `qlmanage`: one thumbnail per single-slide presentation.
 *
 * @param fonts - Which of the presentation's fonts this Mac has, for the label.
 */
function quickLookRenderer(fonts: string): Renderer {
  return {
    id: 'quicklook',
    label: `macOS Quick Look (Apple's Office renderer, as Keynote and Finder use it), ${fonts}`,
    render: Effect.fn('renderWithQuickLook')(function* (input) {
      const fs = yield* FileSystem.FileSystem;
      const outDir = path.join(input.workDir, 'quicklook');
      yield* fs.remove(outDir, { recursive: true }).pipe(Effect.ignore);
      yield* fs
        .makeDirectory(outDir, { recursive: true })
        .pipe(Effect.mapError(writeError(outDir)));
      const pages: (string | null)[] = [];
      for (const single of input.singles) {
        yield* runProcess(
          'qlmanage',
          ['-t', '-s', String(QUICK_LOOK_SIZE), '-o', path.resolve(outDir), path.resolve(single)],
          'Quick Look ships with macOS; run the command on a Mac.',
        );
        const picture = path.join(outDir, `${path.basename(single)}.png`);
        const drawn = yield* fs.exists(picture).pipe(Effect.orElseSucceed(() => false));
        pages.push(drawn ? picture : null);
      }

      return { renderer: 'quicklook', pages };
    }),
  };
}

/**
 * Keynote through AppleScript: exports every slide as a PNG.
 *
 * @param fonts - Which of the presentation's fonts this Mac has, for the label.
 */
function keynoteRenderer(fonts: string): Renderer {
  return {
    id: 'keynote',
    label: `Keynote (AppleScript export), ${fonts}`,
    render: Effect.fn('renderWithKeynote')(function* (input) {
      const fs = yield* FileSystem.FileSystem;
      const outDir = path.join(input.workDir, 'keynote');
      const script = path.join(input.workDir, 'keynote-export.applescript');
      yield* fs.remove(outDir, { recursive: true }).pipe(Effect.ignore);
      yield* fs
        .makeDirectory(outDir, { recursive: true })
        .pipe(Effect.mapError(writeError(outDir)));
      yield* fs.writeFileString(script, KEYNOTE_SCRIPT).pipe(Effect.mapError(writeError(script)));
      const result = yield* runProcess(
        'timeout',
        [
          String(KEYNOTE_TIMEOUT_S),
          'osascript',
          path.resolve(script),
          path.resolve(input.deck),
          path.resolve(outDir),
        ],
        'Install Keynote, or leave keynote out of --renderer.',
      );
      if (result.code !== 0) {
        return yield* exportError(
          'export the slides with Keynote',
          result.stderr.trim() || `no answer within ${KEYNOTE_TIMEOUT_S}s`,
          'Allow your terminal to control Keynote (System Settings > Privacy & Security > ' +
            'Automation) and close any dialog Keynote shows, or leave keynote out of --renderer.',
        );
      }

      const names = yield* listPictures(outDir);
      return {
        renderer: 'keynote',
        pages: input.singles.map((_, index) =>
          names[index] === undefined ? null : path.join(outDir, names[index]),
        ),
      };
    }),
  };
}

/**
 * The PNG files in a folder, in slide order (Keynote numbers them).
 *
 * @param folder - The folder, searched one level deep.
 */
const listPictures = Effect.fn('listPictures')(function* (
  folder: string,
): Effect.fn.Return<string[], ExportError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const names = yield* fs
    .readDirectory(folder, { recursive: true })
    .pipe(Effect.mapError(writeError(folder)));
  return names
    .filter((name) => name.endsWith('.png'))
    .sort((a, b) => pageNumber(a) - pageNumber(b));
});

/**
 * The page number in a file name such as `page-07.png` or `Slide 7.png`.
 *
 * @param name - The file name.
 */
function pageNumber(name: string): number {
  const match = PAGE_NUMBER.exec(name);
  return match === null ? 0 : Number(match[1]);
}

/**
 * Maps a file system failure on a path to an export error.
 *
 * @param file - The path.
 */
function writeError(file: string): (cause: unknown) => ExportError {
  return (cause) =>
    exportError(`write ${file}`, cause, 'Check that the output folder can be written.');
}
