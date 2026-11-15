import type { ChildProcessSpawner } from 'effect/process';

import { Effect, FileSystem, Schema } from 'effect';
import path from 'node:path';

import { exportError, type ExportError } from '#export-error.ts';
import { bindMount, DOCKER_FIX, ensureImage } from '#verify/docker-image.ts';
import { runProcess } from '#verify/run-process.ts';

/**
 * The most errors a validation reports.
 */
const MAX_ERRORS = 50;

/**
 * One problem the validator found.
 */
const ValidationProblem = Schema.Struct({
  id: Schema.NullOr(Schema.String),
  description: Schema.String,
  part: Schema.NullOr(Schema.String),
  path: Schema.NullOr(Schema.String),
  type: Schema.String,
});

/**
 * The validator's output: one result per file.
 */
const ValidatorOutput = Schema.Array(
  Schema.Struct({
    file: Schema.String,
    ok: Schema.Boolean,
    errors: Schema.Array(ValidationProblem),
  }),
);

/**
 * The outcome of validating a PPTX against the Office Open XML schemas.
 */
export type OoxmlValidation = {
  /**
   * The validator: the Open XML SDK version and the file format it checked against.
   */
  validator: string;

  /**
   * Whether the file has no schema or semantic errors.
   */
  ok: boolean;

  /**
   * The errors, at most fifty: what is wrong, in which part, and where.
   */
  errors: { description: string; part: string | null; path: string | null }[];
};

/**
 * Validates a PPTX with Microsoft's Open XML SDK validator (DocumentFormat.OpenXml 3.3, checking
 * against the Microsoft 365 file format) in Docker: the schema and semantic checks PowerPoint's own
 * reader is built on. A file that passes opens without a repair prompt as far as the schemas can
 * tell; it does not prove PowerPoint renders it as intended.
 *
 * @param file - The PPTX.
 * @returns Whether it is valid, and its errors.
 * @throws ExportError in the error channel when Docker or the validator does not run.
 */
export const validateOoxml = Effect.fn('validateOoxml')(function* (
  file: string,
): Effect.fn.Return<
  OoxmlValidation,
  ExportError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> {
  const image = yield* ensureImage('ooxml-validator');
  const result = yield* runProcess('docker', validatorRunArgs(file, image), DOCKER_FIX);
  const parsed = parseValidatorOutput(result.stdout);
  if (parsed === null) {
    return yield* exportError(
      'read the validator output',
      result.stderr.trim() ||
        result.stdout.trim() ||
        `the validator printed nothing and exited with code ${result.code}`,
      'Run the command again.',
    );
  }

  return parsed;
});

/**
 * The `docker run` arguments of a validation: the PPTX's folder mounted read-only at `/work`.
 *
 * @param file - The PPTX.
 * @param image - The image tag.
 */
export function validatorRunArgs(file: string, image: string): string[] {
  return [
    'run',
    '--rm',
    // Validation uses local files. Avoid creating host interfaces that interrupt Chromium requests.
    '--network=none',
    '--mount',
    bindMount(path.dirname(file), '/work', true),
    image,
    `/work/${path.basename(file)}`,
  ];
}

/**
 * Reads the validator's JSON output: the first file's verdict and at most {@link MAX_ERRORS} of its
 * errors.
 *
 * @param stdout - What the validator printed.
 * @returns The validation, or `null` when the output is not the validator's JSON. A verdict that is
 *   not `ok` always carries at least one error saying why.
 */
export function parseValidatorOutput(stdout: string): OoxmlValidation | null {
  const decoded = Schema.decodeUnknownExit(Schema.fromJsonString(ValidatorOutput))(stdout.trim());
  if (decoded._tag === 'Failure') {
    return null;
  }

  const [first] = decoded.value;
  const errors = (first?.errors ?? []).slice(0, MAX_ERRORS).map((error) => ({
    description: error.description,
    part: error.part,
    path: error.path,
  }));
  const ok = first?.ok ?? false;
  if (!ok && errors.length === 0) {
    const description =
      first === undefined
        ? 'The validator returned no result for the file (it printed an empty list), so the file ' +
          'is not known to be valid.'
        : 'The validator marked the file invalid without saying what is wrong.';
    errors.push({ description, part: null, path: null });
  }

  return { validator: 'Open XML SDK 3.3 validator (Microsoft 365 format)', ok, errors };
}
