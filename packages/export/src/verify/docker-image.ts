import type { ChildProcessSpawner } from 'effect/process';

import { Effect, FileSystem } from 'effect';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { exportError, type ExportError } from '#export-error.ts';
import { runProcess, type ProcessResult } from '#verify/run-process.ts';

/**
 * CSV delimiters that require quoting a Docker mount source field.
 */
const MOUNT_SOURCE_QUOTING_PATTERN = /[",]/;

/**
 * The folder with the Dockerfiles of the verification tools.
 */
export const DOCKER_DIR = path.resolve(import.meta.dirname, '../../docker');

/**
 * Hex digits of the content hash used as an image tag.
 */
const TAG_LENGTH = 12;

/**
 * The fix printed when Docker is missing or not running.
 */
export const DOCKER_FIX =
  'Start Docker (Docker Desktop, OrbStack or Colima) and run the command again, ' +
  'or leave out --verify.';

/**
 * Whether Docker can run the verification tools: `ready`, `missing` (no `docker` program) or
 * `stopped` (the program exists but the daemon does not answer).
 */
export type DockerStatus =
  | {
      /**
       * The daemon answers.
       */
      kind: 'ready';
    }
  | {
      /**
       * `docker` is not on the PATH.
       */
      kind: 'missing';

      /**
       * Why Docker cannot be used, as a sentence.
       */
      why: string;
    }
  | {
      /**
       * `docker` is installed but `docker info` fails.
       */
      kind: 'stopped';

      /**
       * Why Docker cannot be used, as a sentence.
       */
      why: string;
    };

/**
 * The sentence for a machine without the `docker` program.
 */
export const DOCKER_MISSING = 'Docker is not installed (docker not found on PATH)';

/**
 * The sentence for a `docker` program whose daemon does not answer.
 */
export const DOCKER_STOPPED = 'Docker is installed but not running';

/**
 * A `docker run --mount` value that bind-mounts a host folder. Unlike `-v`, whose `host:container`
 * form breaks on a host path with a colon, the `source` field takes any path; a path with a comma
 * or a double quote is written as a quoted CSV field, as Docker reads it.
 *
 * @param source - The host folder.
 * @param target - Where the container sees it.
 * @param readOnly - Whether the container may only read it.
 */
export function bindMount(source: string, target: string, readOnly: boolean): string {
  const field = `source=${source}`;
  const quoted = MOUNT_SOURCE_QUOTING_PATTERN.test(source)
    ? `"${field.replaceAll('"', '""')}"`
    : field;
  return `type=bind,${quoted},target=${target}${readOnly ? ',readonly' : ''}`;
}

/**
 * Whether Docker is installed and its daemon answers.
 *
 * @returns The status, with the reason when it cannot be used.
 */
export const dockerStatus = Effect.fn('dockerStatus')(function* (): Effect.fn.Return<
  DockerStatus,
  never,
  ChildProcessSpawner.ChildProcessSpawner
> {
  const result = yield* runProcess(
    'docker',
    ['info', '--format', '{{.ServerVersion}}'],
    DOCKER_FIX,
  ).pipe(Effect.orElseSucceed(() => null));
  return dockerStatusOf(result);
});

/**
 * The Docker status for the outcome of `docker info`.
 *
 * @param result - What `docker info` printed and exited with, or `null` when the program could not
 *   be started.
 */
export function dockerStatusOf(result: ProcessResult | null): DockerStatus {
  if (result === null) {
    return { kind: 'missing', why: DOCKER_MISSING };
  }

  if (result.code === 0 && result.stdout.trim() !== '') {
    return { kind: 'ready' };
  }

  const detail = (result.stderr.trim() || result.stdout.trim()).split('\n')[0] ?? '';
  return { kind: 'stopped', why: detail === '' ? DOCKER_STOPPED : `${DOCKER_STOPPED}: ${detail}` };
}

/**
 * Builds one of the tool images from `packages/export/docker/<name>` unless an image of the same
 * contents exists, and returns its tag. The tag is a hash of the folder's files, so a changed
 * Dockerfile builds a new image.
 *
 * @param name - The folder name, such as `libreoffice`.
 * @returns The image tag, such as `deck-export-libreoffice:3f2a...`.
 * @throws ExportError in the error channel when the files cannot be read or the build fails.
 */
export const ensureImage = Effect.fn('ensureImage')(function* (
  name: string,
): Effect.fn.Return<
  string,
  ExportError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> {
  const folder = path.join(DOCKER_DIR, name);
  const digest = yield* hashFolder(folder);
  const tag = `deck-export-${name}:${digest.slice(0, TAG_LENGTH)}`;
  const inspected = yield* runProcess('docker', ['image', 'inspect', tag], DOCKER_FIX);
  if (inspected.code === 0) {
    return tag;
  }

  const built = yield* runProcess('docker', ['build', '-q', '-t', tag, folder], DOCKER_FIX);
  if (built.code !== 0) {
    return yield* exportError(
      `build the ${name} image`,
      built.stderr.trim().split('\n').at(-1),
      'Check that Docker can pull debian and dotnet images, then run the command again.',
    );
  }

  return tag;
});

/**
 * The SHA-1 of a folder's files: each file's name and contents, in name order. A changed file
 * changes the digest.
 *
 * @param folder - The folder.
 * @returns The hex digest.
 * @throws ExportError in the error channel when a file cannot be read.
 */
const hashFolder = Effect.fn('hashFolder')(function* (
  folder: string,
): Effect.fn.Return<string, ExportError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const files = yield* fs
    .readDirectory(folder)
    .pipe(
      Effect.mapError((cause) =>
        exportError(
          `read ${folder}`,
          cause,
          'Reinstall the workspace; the Dockerfiles ship with @deckster/export.',
        ),
      ),
    );
  const hash = createHash('sha1');
  for (const file of [...files].sort()) {
    const content = yield* fs
      .readFile(path.join(folder, file))
      .pipe(
        Effect.mapError((cause) =>
          exportError(`read ${file}`, cause, 'Check the file permissions.'),
        ),
      );
    hash.update(file).update(content);
  }

  return hash.digest('hex');
});
