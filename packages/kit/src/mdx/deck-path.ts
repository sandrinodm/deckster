import { fileExists } from '@deckster/brand/node';
import { Effect, FileSystem, Option } from 'effect';
import path from 'node:path';

/**
 * The kinds of file a slide names, each with the extensions it accepts.
 */
export type FileKind = 'image' | 'video' | 'lottie' | 'svg';

/**
 * The extensions each kind of file accepts: what the browser draws and Vite ships as an asset.
 * Video is WebM or MP4 (Playwright's Chromium, which `deck shot` uses, has no H.264).
 */
export const FILE_EXTENSIONS: Readonly<Record<FileKind, readonly string[]>> = {
  /**
   * A picture: a photo, a portrait, a logo or a poster frame.
   */
  image: ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'],

  /**
   * A video or a recorded fallback.
   */
  video: ['.webm', '.mp4'],

  /**
   * A Lottie animation, which the player fetches as JSON.
   */
  lottie: ['.json'],

  /**
   * A drawing `<Svg>` inlines at build time.
   */
  svg: ['.svg'],
};

/**
 * Each kind of file as messages name it.
 */
const KIND_NOUNS: Readonly<Record<FileKind, string>> = {
  /**
   * A picture.
   */
  image: 'an image',

  /**
   * A video.
   */
  video: 'a video',

  /**
   * A Lottie animation.
   */
  lottie: 'a Lottie animation',

  /**
   * An inline drawing.
   */
  svg: 'an SVG drawing',
};

/**
 * The deck folder that holds files served as they are, at `/<path>`.
 */
const PUBLIC_DIR = 'public';

/**
 * The deck folder where files usually go.
 */
const ASSETS_DIR = 'assets';

/**
 * A web address or another URL: `https:`, `data:`, `blob:`.
 */
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/iu;

/**
 * A path relative to the slide file: starts with `./` or `../`.
 */
const SLIDE_RELATIVE = /^\.\.?\//u;

/**
 * What a path is relative to: the slide file (`./`, `../`), the deck folder (a bare path such as
 * `assets/x.png`) or the deck's `public/` folder (a path that starts with `/`).
 */
export type PathBase = 'slide' | 'deck' | 'public';

/**
 * The rule a slide's file paths follow, for fixes.
 */
export const PATH_RULE =
  'Write the path from the deck folder (`assets/people/dana.jpg`), or relative to the slide file ' +
  "with `./` or `../`; a path that starts with `/` names a file in the deck's public/ folder.";

/**
 * A path a slide names, resolved.
 */
export type DeckPath =
  | {
      /**
       * A URL (`https:`, `data:`, or `//host` with no scheme), which is not a file in the deck.
       */
      type: 'url';

      /**
       * Its scheme in lower case without the colon; empty for `//host`.
       */
      scheme: string;
    }
  | {
      /**
       * A file in the deck's `public/` folder, which the server ships at its path as written.
       */
      type: 'public';

      /**
       * Its real absolute path.
       */
      file: string;
    }
  | {
      /**
       * A file in the deck folder, to import.
       */
      type: 'local';

      /**
       * Its real absolute path.
       */
      file: string;

      /**
       * The import specifier from the slide file: `./x.png` or `../assets/x.png`.
       */
      specifier: string;
    }
  | {
      /**
       * Nothing is there.
       */
      type: 'missing';

      /**
       * The absolute path that was tried.
       */
      looked: string;

      /**
       * What the path is relative to.
       */
      base: PathBase;
    }
  | {
      /**
       * A path the build does not accept: outside the deck, a link out of it, a folder or a file of
       * the wrong kind.
       */
      type: 'rejected';

      /**
       * What is wrong, to follow the path as written in a message.
       */
      reason: string;

      /**
       * How to fix it.
       */
      fix: string;
    };

/**
 * A path to resolve, and where it was written.
 */
export type DeckPathRequest = {
  /**
   * The path as written.
   */
  source: string;

  /**
   * The absolute path of the slide file that names it.
   */
  slideFile: string;

  /**
   * The absolute deck folder, which holds `deck.config.ts`.
   */
  deckDir: string;

  /**
   * The kind of file the field takes.
   */
  kind: FileKind;
};

/**
 * Resolves a file path a slide names. A path that starts with `./` or `../` is relative to the
 * slide file, a bare path (`assets/x.png`) to the deck folder and one that starts with `/` to the
 * deck's `public/` folder. The file, with every link followed, must be inside the deck folder
 * (inside `public/` for a `/` path) and have an extension of its kind. URLs are returned as such,
 * for the caller to accept or reject.
 *
 * @param request - The path, the slide, the deck and the kind of file.
 */
export const resolveDeckPath = Effect.fn('resolveDeckPath')(function* (
  request: DeckPathRequest,
): Effect.fn.Return<DeckPath, never, FileSystem.FileSystem> {
  const { source, slideFile, deckDir, kind } = request;
  if (source.startsWith('//')) {
    return { type: 'url', scheme: '' };
  }

  const scheme = URL_SCHEME.exec(source)?.[0];
  if (scheme !== undefined) {
    return { type: 'url', scheme: scheme.slice(0, -1).toLowerCase() };
  }

  const base = pathBase(source);
  const root = base === 'public' ? path.join(deckDir, PUBLIC_DIR) : deckDir;
  const relativeRoot = base === 'slide' ? path.dirname(slideFile) : deckDir;
  const looked = base === 'public' ? path.join(root, source) : path.resolve(relativeRoot, source);
  if (!isInside(root, looked)) {
    return outside(base, looked, root);
  }

  const extension = path.extname(looked).toLowerCase();
  const accepted = FILE_EXTENSIONS[kind];
  if (!accepted.includes(extension)) {
    return {
      type: 'rejected',
      reason:
        `is not ${KIND_NOUNS[kind]} (${extension === '' ? 'no extension' : extension}); ` +
        `${KIND_NOUNS[kind]} is one of ${accepted.join(', ')}.`,
      fix: `Point it at ${KIND_NOUNS[kind]} file (${accepted.join(', ')}) in the deck.`,
    };
  }

  if (!(yield* fileExists(looked))) {
    return { type: 'missing', looked, base };
  }

  const fs = yield* FileSystem.FileSystem;
  const real = yield* fs.realPath(looked).pipe(Effect.option);
  if (Option.isNone(real)) {
    return { type: 'missing', looked, base };
  }

  const realRoot = yield* fs.realPath(root).pipe(Effect.orElseSucceed(() => root));
  if (!isInside(realRoot, real.value)) {
    return {
      type: 'rejected',
      reason: `is a link to ${real.value}, outside the deck folder.`,
      fix: `Copy the file into the deck's ${ASSETS_DIR}/ folder instead of linking to it.`,
    };
  }

  const info = yield* fs.stat(real.value).pipe(Effect.option);
  if (Option.isNone(info) || info.value.type !== 'File') {
    return {
      type: 'rejected',
      reason: `is a folder (${looked}), not a file.`,
      fix: 'Name the file itself.',
    };
  }

  return base === 'public'
    ? { type: 'public', file: real.value }
    : { type: 'local', file: real.value, specifier: importSpecifier(slideFile, looked) };
});

/**
 * What a path is relative to.
 *
 * @param source - The path as written, not a URL.
 */
export function pathBase(source: string): PathBase {
  if (source.startsWith('/')) {
    return 'public';
  }

  return SLIDE_RELATIVE.test(source) ? 'slide' : 'deck';
}

/**
 * What a path is relative to, for a message: "relative to the slide file".
 *
 * @param base - The base.
 */
export function describeBase(base: PathBase): string {
  const words: Readonly<Record<PathBase, string>> = {
    slide: 'relative to the slide file',
    deck: 'from the deck folder',
    public: "in the deck's public/ folder",
  };
  return words[base];
}

/**
 * The rejection of a path that leaves the deck (or its `public/` folder).
 *
 * @param base - What the path is relative to.
 * @param looked - Where it resolves to.
 * @param root - The folder it must stay in.
 */
function outside(base: PathBase, looked: string, root: string): DeckPath {
  const name = path.basename(looked);
  if (base === 'public') {
    return {
      type: 'rejected',
      reason: `resolves to ${looked}, outside the deck's public/ folder (${root}).`,
      fix:
        "A path that starts with / names a file in the deck's public/ folder, not on the disk. " +
        `Copy the file into the deck and write \`${ASSETS_DIR}/${name}\`.`,
    };
  }

  return {
    type: 'rejected',
    reason: `resolves to ${looked}, outside the deck folder (${root}).`,
    fix:
      `A slide can only use files inside its deck. Copy the file into the deck's ${ASSETS_DIR}/ ` +
      `folder and write \`${ASSETS_DIR}/${name}\`.`,
  };
}

/**
 * Whether a path is inside a folder (not the folder itself).
 *
 * @param root - The folder.
 * @param file - The path.
 */
function isInside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

/**
 * The import specifier of a file from the slide that names it, always starting with `./` or `../`
 * so the bundler never reads it as a package.
 *
 * @param slideFile - The slide file.
 * @param file - The file.
 */
function importSpecifier(slideFile: string, file: string): string {
  const relative = path.relative(path.dirname(slideFile), file).split(path.sep).join('/');
  return relative.startsWith('../') ? relative : `./${relative}`;
}
