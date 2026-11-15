/**
 * The folders of a deck an agent turn may change, and the file extensions each may hold. Slides are
 * compiled for the browser and never run in Node; media and data are read by slides. Nothing else
 * is content: not `deck.config.ts`, `package.json`, `tsconfig.json`, any stylesheet (a stylesheet
 * can make the build tool load JavaScript), `.ts` helper modules, mini apps, `lib/`, review
 * comments (`.feedback/`), fonts (they belong to brands) or anything outside the deck.
 */
export const CONTENT_FOLDERS: Readonly<Record<string, readonly string[]>> = {
  /**
   * Slide files.
   */
  slides: ['mdx', 'tsx'],

  /**
   * Images, video, audio and data the slides use.
   */
  assets: [
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'avif',
    'svg',
    'webm',
    'mp4',
    'mov',
    'm4v',
    'mp3',
    'm4a',
    'wav',
    'ogg',
    'opus',
    'json',
    'csv',
  ],

  /**
   * The deck's static files, served as they are: the same media and data as `assets/`.
   */
  public: [
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'avif',
    'svg',
    'webm',
    'mp4',
    'mov',
    'm4v',
    'mp3',
    'm4a',
    'wav',
    'ogg',
    'opus',
    'json',
    'csv',
  ],
};

/**
 * The content folders' names, in a fixed order.
 */
export const CONTENT_FOLDER_NAMES: readonly string[] = Object.keys(CONTENT_FOLDERS);

/**
 * The one sentence the agent help, the doctor and the docs use for what the agent may edit.
 */
export const CONTENT_SCOPE_SENTENCE =
  "The agent edits only the deck's content: slide files (.mdx, .tsx) in slides/ and media and data in assets/ and public/, in a working copy the editor copies into the deck; the slide list changes only through the deck tools, and anything else it writes is ignored.";

/**
 * The extension of a file name in lower case, without the dot; empty when it has none.
 *
 * @param name - The file name.
 */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Whether a path inside a deck folder is a content file an agent turn may create, change or delete:
 * under `slides/`, `assets/` or `public/` (at any depth), with an extension that folder allows.
 *
 * @param deckRelative - The path relative to the deck folder, with forward slashes, as the file
 *   system names it.
 */
export function isContentFile(deckRelative: string): boolean {
  const segments = deckRelative.split('/');
  const [folder] = segments;
  const name = segments.at(-1) ?? '';
  if (folder === undefined || segments.length < 2 || !isPlainSegments(segments)) {
    return false;
  }

  const allowed = CONTENT_FOLDERS[folder];
  return allowed !== undefined && allowed.includes(extensionOf(name));
}

/**
 * Whether a path inside a deck folder is a content folder or a folder inside one, which a turn may
 * create (an agent adds `slides/` parts or `assets/` as it writes into them) or remove.
 *
 * @param deckRelative - The path relative to the deck folder, with forward slashes.
 */
export function isContentDirectory(deckRelative: string): boolean {
  const segments = deckRelative.split('/');
  const [folder] = segments;
  return folder !== undefined && CONTENT_FOLDERS[folder] !== undefined && isPlainSegments(segments);
}

/**
 * Characters a content path never holds besides control characters (a newline would split a report
 * or a prompt line): the backslash and the colon.
 */
const UNSAFE_CHARACTERS = /[\\:]/;

/**
 * The highest code of an ASCII control character.
 */
const CONTROL_LIMIT = 0x1f;

/**
 * The delete character's code.
 */
const DELETE_CODE = 0x7f;

/**
 * Whether a text holds an ASCII control character (a newline, a tab, a NUL) or the delete
 * character.
 *
 * @param text - The text.
 */
function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= CONTROL_LIMIT || code === DELETE_CODE) {
      return true;
    }
  }

  return false;
}

/**
 * The longest name of one path segment, in characters.
 */
const MAX_SEGMENT_CHARS = 255;

/**
 * Whether every segment of a path is a plain, visible name: not empty, `.` or `..`, not hidden (no
 * leading dot: the framework's temporary files start with one), no control character, backslash or
 * colon, at most 255 characters.
 *
 * @param segments - The path's segments.
 */
function isPlainSegments(segments: readonly string[]): boolean {
  return segments.every(
    (segment) =>
      segment !== '' &&
      !segment.startsWith('.') &&
      segment.length <= MAX_SEGMENT_CHARS &&
      !UNSAFE_CHARACTERS.test(segment) &&
      !hasControlCharacter(segment),
  );
}

/**
 * The key two content paths are compared by when the file system may not tell them apart: Unicode
 * NFC and lower case, so `Title.mdx` and `title.mdx` have one key.
 *
 * @param relative - The path.
 */
export function foldPath(relative: string): string {
  return relative.normalize('NFC').toLowerCase();
}

/**
 * The bounds of a turn's working copy and of every sync from it.
 */
export type StagingLimits = {
  /**
   * The most files the content folders may hold.
   */
  readonly maxFiles: number;

  /**
   * The largest content file, in bytes.
   */
  readonly maxFileBytes: number;

  /**
   * The most bytes all content files may hold together.
   */
  readonly maxTotalBytes: number;

  /**
   * The deepest folder below a content folder.
   */
  readonly maxDepth: number;
};

/**
 * The bounds of a real turn: 2000 files, 256 MB a file, 2 GB in all, 16 folders deep.
 */
export const STAGING_LIMITS: StagingLimits = {
  /**
   * Files.
   */
  maxFiles: 2000,

  /**
   * Bytes a file.
   */
  maxFileBytes: 256 * 1024 * 1024,

  /**
   * Bytes in all.
   */
  maxTotalBytes: 2 * 1024 * 1024 * 1024,

  /**
   * Folder depth.
   */
  maxDepth: 16,
};
