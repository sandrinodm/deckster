import type { PlatformError } from 'effect';

import { fileExists } from '@deckster/brand/node';
import { Effect, FileSystem, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';

import type { KitNodeServices } from '#mdx/node-runtime.ts';

/**
 * Where converted GIFs are kept, under the workspace: one WebM and one poster per GIF content hash,
 * so a GIF converts once however many slides and builds use it.
 */
export const GIF_CACHE_DIR = path.join('node_modules', '.cache', 'deck', 'gif');

/**
 * The converter the build looks for on `PATH`.
 */
const FFMPEG = 'ffmpeg';

/**
 * Hex characters of the content hash kept in the file names.
 */
const HASH_LENGTH = 16;

/**
 * The arguments that turn a GIF into a silent VP9 WebM: even dimensions (VP9 needs them), constant
 * quality, no audio track.
 */
const WEBM_ARGUMENTS = [
  '-an',
  '-c:v',
  'libvpx-vp9',
  '-b:v',
  '0',
  '-crf',
  '32',
  '-pix_fmt',
  'yuv420p',
  '-vf',
  'scale=trunc(iw/2)*2:trunc(ih/2)*2',
];

/**
 * The first bytes of every GIF: `GIF87a` or `GIF89a`.
 */
const GIF_SIGNATURES = ['GIF87a', 'GIF89a'] as const;

/**
 * Random bytes in a temporary file's suffix.
 */
const TEMPORARY_SUFFIX_BYTES = 8;

/**
 * A GIF converted to video.
 */
export type ConvertedGif = {
  /**
   * The absolute path of the WebM.
   */
  video: string;

  /**
   * The absolute path of the poster: the GIF's first frame as a PNG.
   */
  poster: string;
};

/**
 * Why a GIF stayed a GIF.
 */
export type GifKept = {
  /**
   * What went wrong, as a sentence for the warning.
   */
  reason: string;
};

/**
 * Converts a GIF to a silent looping WebM and a poster frame with `ffmpeg`, cached under
 * `node_modules/.cache/deck/gif/` by the hash of the GIF's content. A cached pair is reused without
 * running `ffmpeg`. A file whose first bytes are not a GIF signature is kept without running
 * `ffmpeg`, and `ffmpeg` reads the GIF only with its GIF demuxer and only through the `file`
 * protocol, so a `.gif` that holds a playlist or another format cannot make it read other files or
 * URLs. Each file is written under a temporary name and renamed into place, so an interrupted
 * conversion never leaves a half-written video in the cache.
 *
 * @param gif - The absolute path of the GIF.
 * @param workspaceRoot - The workspace, which holds `node_modules/.cache/deck`.
 * @returns The video and poster, or why the GIF was kept (no `ffmpeg` on `PATH`, or it failed).
 */
export const convertGif = Effect.fn('convertGif')(function* (
  gif: string,
  workspaceRoot: string,
): Effect.fn.Return<ConvertedGif | GifKept, never, KitNodeServices> {
  const fs = yield* FileSystem.FileSystem;
  const content = yield* fs.readFile(gif).pipe(Effect.option);
  if (content._tag === 'None') {
    return { reason: `The GIF ${gif} could not be read.` };
  }

  if (!isGif(content.value)) {
    return { reason: `${gif} is not a GIF (it does not start with GIF87a or GIF89a).` };
  }

  const hash = createHash('sha256').update(content.value).digest('hex').slice(0, HASH_LENGTH);
  const dir = path.join(workspaceRoot, GIF_CACHE_DIR);
  const converted: ConvertedGif = {
    video: path.join(dir, `${hash}.webm`),
    poster: path.join(dir, `${hash}.png`),
  };
  if ((yield* fileExists(converted.video)) && (yield* fileExists(converted.poster))) {
    return converted;
  }

  if (!(yield* hasFfmpeg())) {
    return { reason: `${FFMPEG} is not on PATH, so the GIF could not be converted to video.` };
  }

  const made = yield* writeConversion(gif, dir, converted).pipe(
    Effect.as(true),
    Effect.catch(() => Effect.succeed(false)),
  );
  return made ? converted : { reason: `${FFMPEG} could not convert ${gif} to video.` };
});

/**
 * Whether `ffmpeg` runs.
 */
const hasFfmpeg = Effect.fn('hasFfmpeg')(function* (): Effect.fn.Return<
  boolean,
  never,
  ChildProcessSpawner.ChildProcessSpawner
> {
  return yield* runFfmpeg(['-version']).pipe(Effect.catch(() => Effect.succeed(false)));
});

/**
 * Writes the video and the poster into the cache, each under a temporary name first.
 *
 * @param gif - The GIF.
 * @param dir - The cache folder.
 * @param target - Where the two files go.
 */
const writeConversion = Effect.fn('writeConversion')(function* (
  gif: string,
  dir: string,
  target: ConvertedGif,
): Effect.fn.Return<void, PlatformError.PlatformError | GifConversionFailed, KitNodeServices> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(dir, { recursive: true });
  const { video, poster } = temporaryPaths(target);
  for (const args of conversionSteps(gif, video, poster)) {
    if (!(yield* runFfmpeg(args))) {
      yield* fs.remove(video, { force: true });
      yield* fs.remove(poster, { force: true });
      return yield* new GifConversionFailed({
        message: `${FFMPEG} ${args.join(' ')} failed; the GIF stays a GIF.`,
      });
    }
  }

  yield* fs.rename(video, target.video);
  yield* fs.rename(poster, target.poster);
});

/**
 * Whether a file starts with a GIF signature (`GIF87a` or `GIF89a`).
 *
 * @param content - The file's bytes.
 */
export function isGif(content: Uint8Array): boolean {
  const head = String.fromCharCode(...content.subarray(0, GIF_SIGNATURES[0].length));
  return (GIF_SIGNATURES as readonly string[]).includes(head);
}

/**
 * The two `ffmpeg` runs of a conversion, the video and then the poster. Each reads the input only
 * with the GIF demuxer (`-f gif`) and only through the `file` protocol (`-protocol_whitelist file`,
 * input written as `file:<path>`), so no other demuxer or protocol ever sees the file.
 *
 * @param gif - The absolute path of the GIF.
 * @param video - Where the WebM goes.
 * @param poster - Where the poster goes.
 */
export function conversionSteps(gif: string, video: string, poster: string): string[][] {
  const input = ['-protocol_whitelist', 'file', '-f', 'gif', '-i', `file:${gif}`];
  return [
    ['-y', ...input, ...WEBM_ARGUMENTS, video],
    ['-y', ...input, '-frames:v', '1', poster],
  ];
}

/**
 * Temporary names beside the cached files, with a random suffix so concurrent builds never share
 * one.
 *
 * @param target - Where the two files go.
 */
export function temporaryPaths(target: ConvertedGif): ConvertedGif {
  const suffix = `.${randomBytes(TEMPORARY_SUFFIX_BYTES).toString('hex')}.tmp`;
  return { video: `${target.video}${suffix}.webm`, poster: `${target.poster}${suffix}.png` };
}

/**
 * Runs `ffmpeg` quietly and tells whether it exited with 0.
 *
 * @param args - The arguments after `ffmpeg`.
 */
const runFfmpeg = Effect.fn('runFfmpeg')(function* (
  args: readonly string[],
): Effect.fn.Return<boolean, PlatformError.PlatformError, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const code = yield* spawner.exitCode(
    ChildProcess.make(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args]),
  );
  return Number(code) === 0;
});

/**
 * `ffmpeg` exited with an error; the GIF stays a GIF and the build warns.
 */
class GifConversionFailed extends Schema.TaggedError<GifConversionFailed>()('GifConversionFailed', {
  /**
   * The command that failed and what happens instead.
   */
  message: Schema.String,
}) {}
