import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import type { BackgroundLayerTokens, BrandTokens } from '#resolve/brand-tokens.ts';
import type { BrandProblem } from '#validate/brand-error.ts';

import { assetProblem, BACKGROUND_EXTENSIONS } from '#node/asset-files.ts';
import { BRANDS_DIR, type BrandLocation } from '#node/brand-paths.ts';
import { readImageSize, type ImageSize } from '#node/image-size.ts';
import { ALL_SURFACES_KEY } from '#resolve/layout-layers.ts';

/**
 * How far a placed or tiled layer's `aspect` may be from its file's before the check warns, as a
 * fraction: 2%, about two pixels on a hundred-pixel mark.
 */
const ASPECT_TOLERANCE = 0.02;

/**
 * The factor used to round displayed aspect ratios to two decimal places.
 */
const ASPECT_ROUNDING_FACTOR = 100;

/**
 * The canvas width in pixels; a photo that fills the slide should have at least this many.
 */
const CANVAS_WIDTH = 1920;

/**
 * The canvas height in pixels.
 */
const CANVAS_HEIGHT = 1080;

/**
 * The background layer files a brand ships, and what is wrong with them.
 */
export type BackgroundFiles = {
  /**
   * The absolute path of each layer file, keyed by the path the brand writes, such as
   * `backgrounds/paper.jpg`.
   */
  files: Record<string, string>;

  /**
   * Files that do not exist, leave the brand folder or are not the image their extension says.
   */
  problems: BrandProblem[];

  /**
   * Files that work but will look wrong: a declared aspect that is not the file's, or a photo with
   * fewer pixels than the slide.
   */
  warnings: BrandProblem[];
};

/**
 * One layer that names a file, with its field path.
 */
type FileLayer = {
  /**
   * The layer's path, such as `color.surfaces.photo.background[0]`.
   */
  path: string;

  /**
   * The layer.
   */
  layer: Extract<BackgroundLayerTokens, { file: string }>;
};

/**
 * Finds every file the brand's background layers name, checks each the way logo files are checked
 * (inside the brand folder once symlinks are followed, an allowed extension, content that matches
 * it), and reads each one's size to warn about a placed or tiled layer whose `aspect` is not its
 * file's and a photo too small to fill the slide sharply.
 *
 * @param tokens - The resolved tokens.
 * @param location - Where the brand lives; layer paths are relative to its folder.
 */
export const resolveBackgroundFiles = Effect.fn('resolveBackgroundFiles')(function* (
  tokens: BrandTokens,
  location: BrandLocation,
): Effect.fn.Return<BackgroundFiles, never, FileSystem.FileSystem> {
  const layers = fileLayers(tokens);
  const written = [...new Set(layers.map(({ layer }) => layer.file))];
  const checked = yield* Effect.forEach(
    written,
    (file) => {
      const absolute = path.resolve(location.dir, file);
      const check = {
        file: absolute,
        root: location.dir,
        rootName: `${BRANDS_DIR}/${location.name}/`,
        written: file,
        extensions: BACKGROUND_EXTENSIONS,
      };
      return Effect.gen(function* () {
        const problem = yield* assetProblem(check);
        const size = problem === undefined ? yield* readImageSize(absolute) : undefined;
        return { file, absolute, problem, size };
      });
    },
    // A brand has a handful of background files.
    { concurrency: 'unbounded' },
  );
  const byFile = new Map(checked.map((entry) => [entry.file, entry]));
  const problems: BrandProblem[] = [];
  const warnings: BrandProblem[] = [];
  for (const { path: layerPath, layer } of layers) {
    const entry = byFile.get(layer.file);
    if (entry?.problem !== undefined) {
      problems.push({
        path: `${layerPath}.file`,
        message: entry.problem,
        fix:
          'Put the image itself (an SVG, PNG, WebP or JPEG, not a link to a file elsewhere) in ' +
          'the brand folder, usually backgrounds/, or fix the path.',
      });
    } else if (entry?.size !== undefined) {
      warnings.push(...sizeWarnings(layerPath, layer, entry.size));
    }
  }

  const files = Object.fromEntries(checked.map((entry) => [entry.file, entry.absolute]));
  return { files, problems, warnings };
});

/**
 * Every layer of every surface that names a file, with its path.
 *
 * @param tokens - The resolved tokens.
 */
function fileLayers(tokens: BrandTokens): FileLayer[] {
  const surfaceLayers = Object.values(tokens.surfaces).flatMap((surface) =>
    namedLayers(surface.layers, `color.surfaces.${surface.name}.background`),
  );
  const layoutLayers = tokens.layouts.flatMap((layout, index) =>
    Object.entries(layout.layers).flatMap(([surface, layers]) =>
      namedLayers(
        layers,
        surface === ALL_SURFACES_KEY
          ? `layouts[${index}].background`
          : `layouts[${index}].background.${surface}`,
      ),
    ),
  );
  return [...surfaceLayers, ...layoutLayers];
}

/**
 * The layers of one list that name a file, with their paths.
 *
 * @param layers - The resolved layers.
 * @param path - The list's path, such as `color.surfaces.photo.background`.
 */
function namedLayers(layers: readonly BackgroundLayerTokens[], path: string): FileLayer[] {
  return layers.flatMap((layer, index) =>
    layer.type === 'gradient' ? [] : [{ path: `${path}[${index}]`, layer }],
  );
}

/**
 * Warnings about a layer's file size: an `aspect` that differs from the file's (the mark would be
 * stretched or squeezed), and a raster photo with fewer pixels than the slide it covers.
 *
 * @param layerPath - The layer's path.
 * @param layer - The layer.
 * @param size - Its file's size.
 */
function sizeWarnings(
  layerPath: string,
  layer: FileLayer['layer'],
  size: ImageSize,
): BrandProblem[] {
  const actual = size.width / size.height;
  if (layer.type !== 'image') {
    return Math.abs(layer.aspect - actual) / actual > ASPECT_TOLERANCE
      ? [
          {
            path: `${layerPath}.aspect`,
            message:
              `Is ${layer.aspect}, but ${layer.file} is ${size.width}x${size.height} ` +
              `(${round(actual)}), so it would be drawn stretched.`,
            fix: `Set \`aspect: ${round(actual)}\`.`,
          },
        ]
      : [];
  }

  if (!size.raster) {
    return [];
  }

  const needed =
    layer.fit === 'cover'
      ? Math.max(CANVAS_WIDTH / size.width, CANVAS_HEIGHT / size.height)
      : Math.min(CANVAS_WIDTH / size.width, CANVAS_HEIGHT / size.height);
  return needed > 1
    ? [
        {
          path: `${layerPath}.file`,
          message:
            `${layer.file} is ${size.width}x${size.height} pixels; filling the ` +
            `${CANVAS_WIDTH}x${CANVAS_HEIGHT} slide enlarges it ${round(needed)} times, so it ` +
            'looks soft.',
          fix: `Use a version at least ${CANVAS_WIDTH}x${CANVAS_HEIGHT} pixels, or an SVG.`,
        },
      ]
    : [];
}

/**
 * A number rounded to two decimals, for messages.
 *
 * @param value - The number.
 */
function round(value: number): number {
  return Math.round(value * ASPECT_ROUNDING_FACTOR) / ASPECT_ROUNDING_FACTOR;
}
