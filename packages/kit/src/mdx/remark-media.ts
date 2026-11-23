import {
  describeBase,
  PATH_RULE,
  resolveDeckPath,
  type DeckPath,
  type FileKind,
} from '#mdx/deck-path.ts';
import { convertGif } from '#mdx/gif-to-video.ts';
import { failBuild, warn, type KitFile } from '#mdx/kit-file.ts';
import {
  attributeValue,
  defaultImport,
  findAttribute,
  identifierArrayAttribute,
  identifierAttribute,
  removeAttribute,
  setAttribute,
  walk,
  type MdastNode,
  type MdxAttribute,
} from '#mdx/mdast.ts';
import { runKitEffect } from '#mdx/node-runtime.ts';

/**
 * The parts of a vfile the plugin uses.
 */
export type MediaFile = Pick<KitFile, 'path' | 'message' | 'fail'>;

/**
 * Options of {@link remarkKitMedia}.
 */
export type RemarkMediaOptions = {
  /**
   * The absolute deck folder (it holds `deck.config.ts`): bare paths start there, and every file
   * must be inside it.
   */
  deckDir: string;

  /**
   * The workspace, which holds `node_modules/.cache/deck` for converted GIFs. Without it GIFs are
   * not converted.
   */
  workspaceRoot?: string;

  /**
   * Whether to convert local GIFs to video when `ffmpeg` is on `PATH`. Defaults to `true`.
   */
  convertGifs?: boolean;
};

/**
 * The media elements whose file attributes become imports: each attribute that names a file, with
 * the kind of file it takes.
 */
const MEDIA_ATTRIBUTES: Readonly<Record<string, Readonly<Record<string, FileKind>>>> = {
  /**
   * An image.
   */
  Image: { src: 'image' },

  /**
   * A video and its poster frame.
   */
  Video: { src: 'video', poster: 'image' },

  /**
   * A Lottie animation file.
   */
  Lottie: { src: 'lottie' },

  /**
   * A mini app frame's poster image and its recorded fallback video.
   */
  AppFrame: { poster: 'image', fallback: 'video' },

  /**
   * An inline widget's poster image.
   */
  Live: { poster: 'image' },
};

/**
 * The media elements whose attributes hold a list of files, with the kind of file each takes.
 */
const MEDIA_LIST_ATTRIBUTES: Readonly<Record<string, Readonly<Record<string, FileKind>>>> = {
  /**
   * One still per part of a cued video, for static mode and exports.
   */
  Video: { posters: 'image' },
};

/**
 * The file attributes of an inline image a markdown image became.
 */
const INLINE_IMAGE_ATTRIBUTES: Readonly<Record<string, FileKind>> = {
  /**
   * The image.
   */
  src: 'image',
};

/**
 * The element a markdown image becomes when it stands in a paragraph of its own.
 */
const IMAGE_ELEMENT = 'Image';

/**
 * Query added to a Lottie file's import so Vite hands the component a URL to fetch, not parsed JSON
 * in the bundle: the animation loads only on the slide that uses it.
 */
const URL_QUERY = '?url';

/**
 * A source that names a GIF file, with or without a query string.
 */
const GIF_SOURCE = /\.gif(?:\?.*)?$/i;

/**
 * The `Image` props a video made from a GIF keeps; the rest (`treatment`) only images have.
 */
const VIDEO_KEEPS = new Set(['alt', 'fit', 'focal', 'ratio', 'caption']);

/**
 * What one run of the plugin collects: the imports to add at the top of the slide.
 */
type MediaRun = {
  /**
   * The slide's vfile.
   */
  file: MediaFile;

  /**
   * The plugin options.
   */
  options: RemarkMediaOptions;

  /**
   * The imports, in order.
   */
  imports: MdastNode[];
};

/**
 * A remark plugin that turns the file paths of `<Image>`, `<Video>`, `<Lottie>`, posters, app
 * fallbacks and markdown images (`![alt](../assets/x.png)`) into imports, so the bundler
 * fingerprints and ships exactly the files the slides use. A markdown image alone in its paragraph
 * becomes the kit's `<Image>`, with the brand's treatment. Paths follow the deck's rule: `./` and
 * `../` are relative to the slide file, a bare path (`assets/x.png`) to the deck folder, and a path
 * that starts with `/` names a file in the deck's `public/` folder, which is checked and left as it
 * is. The file, links followed, must be inside the deck folder and of the attribute's kind (an
 * image, a video, a Lottie JSON); anything else fails the build. A path that does not exist is a
 * `media-missing` warning (an error in `deckster lint`) with the path that was tried, and the tag
 * keeps the string so the component shows a placeholder. Web addresses are left as they are. A
 * local GIF is converted to a looping WebM with a poster frame when `ffmpeg` is on `PATH` (cached
 * under `node_modules/.cache/deck/gif/`) and shown as `<Video>`; otherwise it stays a GIF with a
 * `media-gif` warning.
 *
 * @param options - The deck folder, and the workspace for the GIF cache.
 */
export function remarkKitMedia(
  options: RemarkMediaOptions,
): (tree: MdastNode, file: MediaFile) => Promise<void> {
  return async (tree, file) => {
    const run: MediaRun = { file, options, imports: [] };
    const elements: MdastNode[] = [];
    walk(tree, (node, parent, index) => {
      if (node.type === 'image' && parent !== undefined) {
        elements.push(markdownImage(node, parent, index));
        return true;
      }

      if (typeof node.name === 'string' && hasMediaAttributes(node.name)) {
        elements.push(node);
      }

      return false;
    });
    for (const element of elements) {
      await resolveElement(element, run);
    }

    tree.children = [...run.imports, ...(tree.children ?? [])];
  };
}

/**
 * Whether an element has attributes that name files.
 *
 * @param name - The element name.
 */
function hasMediaAttributes(name: string): boolean {
  return MEDIA_ATTRIBUTES[name] !== undefined || MEDIA_LIST_ATTRIBUTES[name] !== undefined;
}

/**
 * Turns a markdown image into a JSX element in place: the kit's `<Image>` when it is the only thing
 * in its paragraph (the paragraph is replaced), else an inline `<img>`, which a figure could not be
 * inside a paragraph.
 *
 * @param node - The `image` node.
 * @param parent - Its parent.
 * @param index - Its position in the parent.
 * @returns The element to resolve.
 */
function markdownImage(node: MdastNode, parent: MdastNode, index: number): MdastNode {
  const attributes: MdxAttribute[] = [
    { type: 'mdxJsxAttribute', name: 'src', value: node.url ?? '' },
    { type: 'mdxJsxAttribute', name: 'alt', value: node.alt ?? '' },
  ];
  const alone =
    parent.type === 'paragraph' &&
    (parent.children ?? []).every(
      (child) => child === node || (child.type === 'text' && (child.value ?? '').trim() === ''),
    );
  const element: MdastNode = {
    type: alone ? 'mdxJsxFlowElement' : 'mdxJsxTextElement',
    name: alone ? IMAGE_ELEMENT : 'img',
    attributes,
    children: [],
    ...(node.position === undefined ? {} : { position: node.position }),
  };
  if (alone) {
    Object.assign(parent, element);
    delete parent.value;
    return parent;
  }

  parent.children?.splice(index, 1, element);
  return element;
}

/**
 * Resolves every file attribute of one element.
 *
 * @param node - The element.
 * @param run - The slide and the imports so far.
 */
async function resolveElement(node: MdastNode, run: MediaRun): Promise<void> {
  const name = node.name ?? '';
  const single = MEDIA_ATTRIBUTES[name] ?? (name === 'img' ? INLINE_IMAGE_ATTRIBUTES : {});
  for (const [attribute, kind] of Object.entries(single)) {
    const source = attributeValue(node, attribute);
    if (typeof source !== 'string' || findAttribute(node, attribute) === undefined) {
      continue;
    }

    if (GIF_SOURCE.test(source) && attribute === 'src' && (name === 'Image' || name === 'img')) {
      await resolveGif(node, source, run);
      continue;
    }

    const local = await localImport(node, attribute, source, kind, run);
    if (local !== undefined) {
      removeAttribute(node, attribute);
      node.attributes?.push(identifierAttribute(attribute, local));
    }
  }

  for (const [attribute, kind] of Object.entries(MEDIA_LIST_ATTRIBUTES[name] ?? {})) {
    const sources = attributeValue(node, attribute);
    if (!Array.isArray(sources) || !sources.every((source) => typeof source === 'string')) {
      continue;
    }

    const locals: string[] = [];
    for (const source of sources) {
      const local = await localImport(node, attribute, source, kind, run);
      if (local === undefined) {
        return;
      }

      locals.push(local);
    }

    removeAttribute(node, attribute);
    node.attributes?.push(identifierArrayAttribute(attribute, locals));
  }
}

/**
 * Imports one file of the deck and returns the binding. A URL or a `public/` path is left alone, a
 * missing file is a warning, and a path the deck does not accept fails the build.
 *
 * @param node - The element, for the message's place.
 * @param attribute - The attribute, for the message.
 * @param source - The path as written.
 * @param kind - The kind of file the attribute takes.
 * @param run - The slide and the imports so far.
 * @returns The binding; `undefined` when the attribute keeps its string.
 */
async function localImport(
  node: MdastNode,
  attribute: string,
  source: string,
  kind: FileKind,
  run: MediaRun,
): Promise<string | undefined> {
  const resolved = await resolveMedia(source, kind, run);
  const specifier = checkResolved(node, attribute, source, resolved, run);
  if (specifier === undefined) {
    return undefined;
  }

  return addImport(run, node.name === 'Lottie' ? `${specifier}${URL_QUERY}` : specifier);
}

/**
 * Resolves a path against the slide and the deck.
 *
 * @param source - The path as written.
 * @param kind - The kind of file it must be.
 * @param run - The slide and the options.
 */
async function resolveMedia(source: string, kind: FileKind, run: MediaRun): Promise<DeckPath> {
  if (run.file.path === undefined) {
    return { type: 'url', scheme: '' };
  }

  return runKitEffect(
    resolveDeckPath({ source, slideFile: run.file.path, deckDir: run.options.deckDir, kind }),
  );
}

/**
 * Reports a resolved path that is missing or not accepted, and gives the import specifier of a file
 * in the deck.
 *
 * @param node - The element, for the message's place.
 * @param attribute - The attribute, for the message.
 * @param source - The path as written.
 * @param resolved - The path, resolved.
 * @param run - The slide.
 * @returns The specifier; `undefined` when the attribute keeps its string.
 */
function checkResolved(
  node: MdastNode,
  attribute: string,
  source: string,
  resolved: DeckPath,
  run: MediaRun,
): string | undefined {
  const where = `<${tagName(node)}> ${attribute}="${source}"`;
  switch (resolved.type) {
    case 'local':
      return resolved.specifier;
    case 'url':
    case 'public':
      return undefined;
    case 'missing':
      warn(
        run.file,
        {
          rule: 'media-missing',
          problem: `${where} does not exist (looked for ${resolved.looked}).`,
          fix:
            `Add the file, or fix the path, which is ${describeBase(resolved.base)}. ` + PATH_RULE,
        },
        node,
      );
      return undefined;
    case 'rejected':
      return failBuild(
        run.file,
        { rule: 'media-path', problem: `${where} ${resolved.reason}`, fix: resolved.fix },
        node,
      );
  }
}

/**
 * Converts a GIF in the deck to a `<Video>` when it can, else keeps it with a warning.
 *
 * @param node - The `<Image>` or `<img>`.
 * @param source - The GIF's path as written.
 * @param run - The slide and the imports so far.
 */
async function resolveGif(node: MdastNode, source: string, run: MediaRun): Promise<void> {
  const resolved = await resolveMedia(source, 'image', run);
  const specifier = checkResolved(node, 'src', source, resolved, run);
  if (resolved.type === 'missing') {
    return;
  }

  const { workspaceRoot, convertGifs = true } = run.options;
  if (resolved.type === 'local' && workspaceRoot !== undefined && convertGifs) {
    const converted = await runKitEffect(convertGif(resolved.file, workspaceRoot));
    if ('video' in converted) {
      becomeVideo(node, addImport(run, converted.video), addImport(run, converted.poster));
      return;
    }

    gifWarning(node, source, run.file, converted.reason);
  } else {
    const reason =
      resolved.type === 'local'
        ? 'Converting GIFs to video is off for this build.'
        : 'Only a GIF the slide imports from the deck (not a URL or a public/ file) can be ' +
          'converted to video.';
    gifWarning(node, source, run.file, reason);
  }

  if (specifier !== undefined) {
    removeAttribute(node, 'src');
    node.attributes?.push(identifierAttribute('src', addImport(run, specifier)));
  }
}

/**
 * Turns an `<Image>` of a GIF into a looping, muted, self-starting `<Video>` with the converted
 * file and poster, keeping the props a video has.
 *
 * @param node - The element, changed in place.
 * @param video - The binding of the WebM.
 * @param poster - The binding of the poster.
 */
function becomeVideo(node: MdastNode, video: string, poster: string): void {
  const kept = (node.attributes ?? []).filter(
    (attribute) => attribute.name !== undefined && VIDEO_KEEPS.has(attribute.name),
  );
  if (node.type === 'mdxJsxTextElement') {
    node.type = 'mdxJsxFlowElement';
  }

  node.name = 'Video';
  node.attributes = [
    identifierAttribute('src', video),
    identifierAttribute('poster', poster),
    ...kept,
  ];
  setAttribute(node, 'loop', true);
  if (findAttribute(node, 'alt') === undefined) {
    setAttribute(node, 'alt', '');
  }
}

/**
 * Warns that a GIF stays a GIF, and why.
 *
 * @param node - The element.
 * @param source - The GIF's path.
 * @param file - The vfile.
 * @param reason - Why it was not converted.
 */
function gifWarning(node: MdastNode, source: string, file: MediaFile, reason: string): void {
  warn(
    file,
    {
      rule: 'media-gif',
      problem: `<${tagName(node)}> uses a GIF (${source}). ${reason}`,
      fix:
        'GIFs are large, limited to 256 colors and cannot pause. Install ffmpeg so the build ' +
        'converts it, or convert it to a short WebM and use <Video loop poster=...>.',
    },
    node,
  );
}

/**
 * Adds a default import of a file and returns its binding.
 *
 * @param run - The slide and the imports so far.
 * @param specifier - The path to import, relative or absolute.
 */
function addImport(run: MediaRun, specifier: string): string {
  const local = `kitMedia${run.imports.length}`;
  run.imports.push(defaultImport(local, specifier));
  return local;
}

/**
 * The tag name to show in a message; a markdown image reads as `Image`.
 *
 * @param node - The element.
 */
function tagName(node: MdastNode): string {
  return node.name === 'img' ? 'Image' : (node.name ?? 'Image');
}
