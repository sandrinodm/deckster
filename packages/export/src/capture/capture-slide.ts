import type { Page } from 'playwright';

import { Effect } from 'effect';

import type { FetchedFile, TooLargeFile } from '#capture/page-scripts.ts';
import type { ExportMode, MasterBackground, ScenePlan } from '#plan/plan-scene.ts';
import type { EmbeddedFile, GrainFile, SlideAssets } from '#pptx/deck-input.ts';
import type { BoxNode, SceneNode, SceneRect, SlideScene } from '#scene/scene.ts';

import {
  encodePicture,
  fetchFile,
  grainTile,
  isolateNode,
  restoreIsolation,
} from '#capture/page-scripts.ts';
import { exportError, type ExportError } from '#export-error.ts';
import { plotSvg } from '#plan/chart-policy.ts';
import { hasGrainOnly, planScene } from '#plan/plan-scene.ts';
import { isOutlineCandidate, outlineBox } from '#pptx/outline-text.ts';
import { collectScene, releasePseudoElements, releaseScene } from '#scene/collect-scene.ts';
import { finishScene } from '#scene/finish-scene.ts';

/**
 * File extensions by media type, for embedded files.
 */
const EXTENSIONS: Readonly<Record<string, string>> = {
  /**
   * PNG.
   */
  'image/png': 'png',

  /**
   * JPEG.
   */
  'image/jpeg': 'jpeg',

  /**
   * GIF.
   */
  'image/gif': 'gif',

  /**
   * SVG.
   */
  'image/svg+xml': 'svg',

  /**
   * MP4 video.
   */
  'video/mp4': 'mp4',

  /**
   * QuickTime video.
   */
  'video/quicktime': 'mov',
};

/**
 * The fix printed when a capture step fails.
 */
const CAPTURE_FIX =
  'Run the export again; if it keeps failing, run `pnpm deck shot <deck> <slide>` to see the ' +
  'slide.';

/**
 * How to capture a slide.
 */
export type CaptureOptions = {
  /**
   * The export mode.
   */
  mode: ExportMode;

  /**
   * The CSS selectors the layout's placeholders read.
   */
  placeholderSelectors: string[];

  /**
   * Frontmatter text for placeholders that read fields.
   */
  fieldText: Record<string, string>;

  /**
   * The background of the slide master the slide uses.
   */
  master: MasterBackground;

  /**
   * A label for errors, such as `slide 3`.
   */
  label: string;

  /**
   * What to capture for the slide master of a textured surface: the grain tile, a picture of the
   * box that covers the slide (a mesh gradient), or nothing.
   */
  captureTexture: 'grain' | 'picture' | null;

  /**
   * Whether to picture the box that covers the slide even when its paint is native: the fallback of
   * a gradient background for renderers that cannot draw it.
   */
  captureBackdrop?: boolean;

  /**
   * Picture pixels per canvas pixel, or `null` for automatic: 2x, but never more pixels than a
   * 1920x1080 slide per picture.
   */
  pictureScale: number | null;

  /**
   * Whether display-size text is drawn as outlines (`--outline-text`): each such text frame is also
   * pictured, as the fallback of its outline SVG.
   */
  outlineText?: boolean;
};

/**
 * A captured slide: its scene, its plan and the files the writer embeds.
 */
export type CapturedSlide = {
  /**
   * The scene.
   */
  scene: SlideScene;

  /**
   * The plan.
   */
  plan: ScenePlan;

  /**
   * The files.
   */
  assets: SlideAssets;
};

/**
 * The most pixels one picture gets with automatic scale: a 1920x1080 slide.
 */
const MAX_PICTURE_PIXELS = 1920 * 1080;

/**
 * Picture pixels per canvas pixel at most with automatic scale.
 */
const MAX_PICTURE_DENSITY = 2;

/**
 * The JPEG quality of pictures without transparency.
 */
const JPEG_QUALITY = 0.88;

/**
 * Captures the slide on screen for the PPTX writer: measures its scene, plans what is native and
 * what is a picture, then screenshots each rasterised element on a transparent background (JPEG
 * when it turns out opaque, at most the pixels of a 1920x1080 slide), fetches the original image
 * files, draws the brand's grain as a small tile when a native fill gets it, and in `image` mode
 * screenshots the whole slide, and only then puts the page's pseudo-elements back: the stand-ins
 * that were measured stay on the page while pictures are taken, so a picture shows what the user
 * sees (a blurred `::before` included). The page is left as it was, also when measuring fails.
 *
 * @param page - The deck page, showing the slide at the step to capture.
 * @param options - The mode, placeholders and master background.
 * @returns The scene, plan and files.
 * @throws ExportError in the error channel when the browser fails.
 */
export const captureSlide = Effect.fn('captureSlide')(function* (
  page: Page,
  options: CaptureOptions,
): Effect.fn.Return<CapturedSlide, ExportError> {
  return yield* Effect.gen(function* () {
    const collected = yield* Effect.tryPromise({
      try: () =>
        page.evaluate(collectScene, { placeholderSelectors: options.placeholderSelectors }),
      catch: (cause) => exportError(`measure ${options.label}`, cause, CAPTURE_FIX),
    });
    const scene = finishScene(collected, options.fieldText);
    const plan = planScene(scene, options.mode, options.master);
    const assets = yield* captureAssets(page, scene, plan, options);
    yield* Effect.tryPromise({
      try: () => page.evaluate(releasePseudoElements),
      catch: (cause) => exportError(`restore ${options.label}`, cause, CAPTURE_FIX),
    });
    return { scene, plan, assets };
  }).pipe(
    Effect.ensuring(Effect.promise(() => page.evaluate(releaseScene).catch(() => undefined))),
  );
});

/**
 * Screenshots and fetches what the writer embeds.
 *
 * @param page - The deck page.
 * @param scene - The scene.
 * @param plan - The plan.
 * @param options - The capture options.
 */
const captureAssets = Effect.fn('captureAssets')(function* (
  page: Page,
  scene: SlideScene,
  plan: ScenePlan,
  options: CaptureOptions,
): Effect.fn.Return<SlideAssets, ExportError> {
  const capture = { page, scale: options.pictureScale, label: options.label, scene };
  if (options.mode === 'image') {
    const slidePicture = yield* screenshot(capture, null);
    return {
      pictures: new Map(),
      images: new Map(),
      media: new Map(),
      slidePicture,
      background: null,
      grain: null,
    };
  }

  const pictures = new Map<number, Uint8Array>();
  yield* pictureElements(capture, plan, options, pictures);
  const imageNodes = imageNodesOf(plan);
  const images = yield* fetchImages(page, imageNodes, plan, options.label);
  yield* pictureUnfetchedImages(capture, imageNodes, images, pictures);
  const background = yield* pictureBackdrop(capture, plan, options);
  const grain = yield* grainOf(page, scene, plan, options);
  return { pictures, images, media: new Map(), slidePicture: null, background, grain };
});

/**
 * Pictures the plan's elements that the writer cannot draw natively: picture items, the plot of a
 * native chart in hybrid mode, text drawn as outlines and a picture background.
 *
 * @param capture - The page, scale and slide.
 * @param plan - The plan.
 * @param options - The capture options.
 * @param pictures - Receives each picture by node id.
 */
const pictureElements = Effect.fn('pictureElements')(function* (
  capture: PictureCapture,
  plan: ScenePlan,
  options: CaptureOptions,
  pictures: Map<number, Uint8Array>,
): Effect.fn.Return<void, ExportError> {
  for (const item of plan.items) {
    if (item.kind === 'picture') {
      const picture = yield* nodePicture(capture, item.node, item.scope);
      if (picture !== null) {
        pictures.set(item.node.id, picture);
      }
    }

    // A native chart carries a picture of its plot for renderers that cannot draw it as the web
    // does (Apple's), as the fallback of its alternate content.
    const plot =
      options.mode === 'hybrid' && item.kind === 'native' && item.node.kind === 'chart'
        ? plotSvg(item.node, capture.scene)
        : null;
    if (plot !== null && !pictures.has(plot.id)) {
      const picture = yield* nodePicture(capture, plot, 'subtree');
      if (picture !== null) {
        pictures.set(plot.id, picture);
      }
    }
  }

  for (const item of plan.items) {
    const node = outlinedTextOf(item, options.outlineText === true);
    if (node !== null) {
      const box = outlineBox(node.rect, node.paragraphs, capture.scene.canvas);
      const picture = yield* nodePicture(capture, node, 'subtree', box);
      if (picture !== null) {
        pictures.set(node.id, picture);
      }
    }
  }

  if (plan.background.kind === 'picture') {
    const node = plan.background.node;
    const picture = yield* nodePicture(capture, node, 'paint');
    if (picture !== null) {
      pictures.set(node.id, picture);
    }
  }
});

/**
 * The image nodes of the plan that are drawn natively, in plan order.
 *
 * @param plan - The plan.
 */
const imageNodesOf = (plan: ScenePlan) =>
  plan.items.flatMap((item) =>
    item.kind === 'native' && item.node.kind === 'image' ? [item.node] : [],
  );

/**
 * The text node of an element that is drawn as an outline, or `null` when the outline option does
 * not apply to it.
 *
 * @param item - One element to draw.
 * @param outlineText - Whether display-size text is drawn as outlines.
 */
const outlinedTextOf = (
  item: ScenePlan['items'][number],
  outlineText: boolean,
): Extract<SceneNode, { kind: 'text' }> | null => {
  if (!outlineText || item.kind !== 'native' || item.node.kind !== 'text') {
    return null;
  }

  return isOutlineCandidate(item.node.paragraphs) ? item.node : null;
};

/**
 * Fetches each image and video the native plan embeds, once per source, through the page.
 *
 * @param page - The deck page.
 * @param imageNodes - The image nodes of the plan.
 * @param plan - The plan, whose media posters are fetched too.
 * @param label - The slide, for errors.
 */
const fetchImages = Effect.fn('fetchImages')(function* (
  page: Page,
  imageNodes: readonly { readonly src: string }[],
  plan: ScenePlan,
  label: string,
): Effect.fn.Return<Map<string, EmbeddedFile>, ExportError> {
  const images = new Map<string, EmbeddedFile>();
  const posters = plan.items.flatMap((item) =>
    item.kind === 'native' && item.node.kind === 'media' && item.node.poster !== null
      ? [item.node.poster]
      : [],
  );
  const sources = new Set([...imageNodes.map((node) => node.src), ...posters]);
  for (const src of sources) {
    const file = yield* fetchEmbedded(page, src, label);
    if (file !== null) {
      images.set(src, file);
    }
  }

  return images;
});

/**
 * Pictures each image node whose file is an SVG, or could not be fetched, as the page draws it.
 *
 * @param capture - The page, scale and slide.
 * @param imageNodes - The image nodes of the plan.
 * @param images - The fetched files by source.
 * @param pictures - Receives each picture by node id.
 */
const pictureUnfetchedImages = Effect.fn('pictureUnfetchedImages')(function* (
  capture: PictureCapture,
  imageNodes: ReturnType<typeof imageNodesOf>,
  images: ReadonlyMap<string, EmbeddedFile>,
  pictures: Map<number, Uint8Array>,
): Effect.fn.Return<void, ExportError> {
  for (const node of imageNodes) {
    const isSvg = images.get(node.src)?.extension === 'svg';
    if (isSvg || !images.has(node.src)) {
      const picture = yield* nodePicture(capture, node, 'subtree');
      if (picture !== null) {
        pictures.set(node.id, picture);
      }
    }
  }
});

/**
 * The picture of the full-bleed box that covers the slide, when the slide needs one: a texture
 * picture, the backdrop option, or a gradient the slide paints natively (the fallback for renderers
 * that cannot draw it).
 *
 * @param capture - The page, scale and slide.
 * @param plan - The plan.
 * @param options - The capture options.
 */
const pictureBackdrop = Effect.fn('pictureBackdrop')(function* (
  capture: PictureCapture,
  plan: ScenePlan,
  options: CaptureOptions,
): Effect.fn.Return<Uint8Array | null, ExportError> {
  const backdrop = capture.scene.nodes.find((node) => node.kind === 'box' && node.fullBleed);
  const ownGradient = plan.background.kind === 'paint' && plan.background.paint.kind !== 'solid';
  const wanted =
    options.captureTexture === 'picture' || options.captureBackdrop === true || ownGradient;
  if (!wanted || backdrop === undefined) {
    return null;
  }

  return yield* nodePicture(capture, backdrop, 'paint');
});

/**
 * The brand's grain tile, when the slide or its master tiles it over a native fill.
 *
 * @param page - The deck page.
 * @param scene - The scene.
 * @param plan - The plan.
 * @param options - The capture options.
 */
const grainOf = Effect.fn('grainOf')(function* (
  page: Page,
  scene: SlideScene,
  plan: ScenePlan,
  options: CaptureOptions,
): Effect.fn.Return<GrainFile | null, ExportError> {
  const grainBoxes = scene.nodes.filter(
    (node): node is BoxNode => node.kind === 'box' && hasGrainOnly(node),
  );
  const wanted =
    options.captureTexture === 'grain' ||
    (plan.background.kind === 'paint' && plan.background.grain) ||
    plan.items.some(
      (item) => item.kind === 'native' && grainBoxes.some((box) => box === item.node),
    );
  const source = grainBoxes[0];
  if (!wanted || source === undefined) {
    return null;
  }

  const tile = yield* Effect.tryPromise({
    try: () => page.evaluate(grainTile, Math.floor(source.id)),
    catch: (cause) => exportError(`draw the grain on ${options.label}`, cause, CAPTURE_FIX),
  });
  return tile === null
    ? null
    : { data: new Uint8Array(Buffer.from(tile.base64, 'base64')), size: tile.size };
});

/**
 * What the picture helpers need: the page, the picture scale, the slide label and its scene for
 * warnings.
 */
type PictureCapture = {
  /**
   * The deck page.
   */
  page: Page;

  /**
   * Picture pixels per canvas pixel, or `null` for automatic.
   */
  scale: number | null;

  /**
   * The slide, for errors.
   */
  label: string;

  /**
   * The scene, whose warnings collect pictures that could not be taken.
   */
  scene: SlideScene;
};

/**
 * A picture of one element on a transparent background, or `null` (with a warning) when the element
 * is gone, such as a pseudo-element's stand-in.
 *
 * @param capture - The page, scale and slide.
 * @param node - The node whose element to capture.
 * @param scope - The subtree, or only the element's own paint.
 * @param rect - The area to picture, when it is not the node's box.
 */
const nodePicture = Effect.fn('nodePicture')(function* (
  capture: PictureCapture,
  node: SceneNode,
  scope: 'subtree' | 'paint',
  rect: SceneRect = node.rect,
): Effect.fn.Return<Uint8Array | null, ExportError> {
  const id = Math.floor(node.id);
  const found = yield* Effect.tryPromise({
    try: () => capture.page.evaluate(isolateNode, { id, scope }),
    catch: (cause) =>
      exportError(`isolate ${node.selector} on ${capture.label}`, cause, CAPTURE_FIX),
  });
  if (!found) {
    capture.scene.warnings.push(`${node.selector}: could not be pictured; it is left out.`);
    return null;
  }

  return yield* screenshot(capture, rect).pipe(
    Effect.ensuring(
      Effect.promise(() => capture.page.evaluate(restoreIsolation).catch(() => undefined)),
    ),
  );
});

/**
 * A picture of the page, or of a rectangle of the canvas with a transparent background, scaled to
 * the picture scale and encoded as JPEG when it is opaque.
 *
 * @param capture - The page, scale and slide.
 * @param rect - The rectangle in canvas pixels, or `null` for the whole slide.
 */
const screenshot = Effect.fn('screenshot')(function* (
  capture: PictureCapture,
  rect: SceneRect | null,
): Effect.fn.Return<Uint8Array, ExportError> {
  const clip =
    rect === null
      ? undefined
      : {
          x: Math.max(0, rect.x),
          y: Math.max(0, rect.y),
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
        };
  const buffer = yield* Effect.tryPromise({
    try: () =>
      capture.page.screenshot({
        type: 'png',
        animations: 'disabled',
        ...(clip === undefined ? {} : { clip, omitBackground: true }),
      }),
    catch: (cause) => exportError(`screenshot ${capture.label}`, cause, CAPTURE_FIX),
  });
  const width = clip?.width ?? capture.scene.canvas.width;
  const height = clip?.height ?? capture.scene.canvas.height;
  const density =
    capture.scale ??
    Math.min(MAX_PICTURE_DENSITY, Math.sqrt(MAX_PICTURE_PIXELS / (width * height)));
  const encoded = yield* Effect.tryPromise({
    try: () =>
      capture.page.evaluate(encodePicture, {
        base64: Buffer.from(buffer).toString('base64'),
        width: width * density,
        height: height * density,
        quality: JPEG_QUALITY,
      }),
    catch: (cause) => exportError(`encode a picture of ${capture.label}`, cause, CAPTURE_FIX),
  });
  return encoded === null
    ? new Uint8Array(buffer)
    : new Uint8Array(Buffer.from(encoded.base64, 'base64'));
});

/**
 * Fetches an image or video through the page.
 *
 * @param page - The deck page.
 * @param src - The URL.
 * @param label - The slide, for errors.
 * @returns The file, or `null` when it cannot be fetched or its type cannot be embedded.
 */
export const fetchEmbedded = Effect.fn('fetchEmbedded')(function* (
  page: Page,
  src: string,
  label: string,
): Effect.fn.Return<EmbeddedFile | null, ExportError> {
  const file = yield* fetchEmbeddedWithin(page, src, label, null);
  return file === null || 'tooLarge' in file ? null : file;
});

/**
 * Fetches an image or video through the page with a size limit: a response that declares more than
 * the limit is not read, and one that does not declare its size is cancelled once it passes the
 * limit, so a large file is never held in memory, converted or sent through the browser bridge.
 *
 * @param page - The deck page.
 * @param src - The URL.
 * @param label - The slide, for errors.
 * @param maxBytes - The most bytes to read, or `null` for no limit.
 * @returns The file, a note that it is too large (with its size, or what had been read), or `null`
 *   when it cannot be fetched or its type cannot be embedded.
 */
export const fetchEmbeddedWithin = Effect.fn('fetchEmbeddedWithin')(function* (
  page: Page,
  src: string,
  label: string,
  maxBytes: number | null,
): Effect.fn.Return<EmbeddedFile | TooLargeFile | null, ExportError> {
  const fetched: FetchedFile | TooLargeFile | null = yield* Effect.tryPromise({
    try: () => page.evaluate(fetchFile, { src, maxBytes }),
    catch: (cause) => exportError(`fetch ${src} on ${label}`, cause, CAPTURE_FIX),
  });
  if (fetched === null || 'tooLarge' in fetched) {
    return fetched;
  }

  const extension = EXTENSIONS[fetched.type];
  if (extension === undefined) {
    return null;
  }

  return { data: new Uint8Array(Buffer.from(fetched.base64, 'base64')), extension };
});
