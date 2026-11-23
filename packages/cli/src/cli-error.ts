import type { PlatformError } from 'effect';

import { playwrightInstallCommand } from '@deckster/brand/node';
import { Predicate, Schema } from 'effect';

/**
 * What the process is told when it may not touch a path, in both the `EACCES` and `EPERM` case.
 */
const PERMISSION_DENIED = 'permission denied';

/**
 * Error codes Node reports in a file system error's description, with what they mean in a message.
 */
const SYSTEM_ERROR_MEANINGS: Readonly<Record<string, string>> = {
  /**
   * A path segment that should be a folder is a file.
   */
  ENOTDIR: 'a part of the path is a file, not a folder',

  /**
   * The path is a file where a folder is needed, or the reverse.
   */
  EISDIR: 'the path is a folder',

  /**
   * The path already exists.
   */
  EEXIST: 'something already exists at that path',

  /**
   * The path does not exist.
   */
  ENOENT: 'the path does not exist',

  /**
   * The process may not write there.
   */
  EACCES: PERMISSION_DENIED,

  /**
   * The process may not write there.
   */
  EPERM: PERMISSION_DENIED,

  /**
   * The disk is full.
   */
  ENOSPC: 'the disk is full',

  /**
   * The file system is read-only.
   */
  EROFS: 'the file system is read-only',
};

/**
 * Matches a Node error code such as `ENOTDIR` in a description.
 */
const ERROR_CODE_PATTERN = /\bE[A-Z]{3,}\b/;

/**
 * A failure the author can fix. The message says what went wrong and what to run or edit next, so
 * the CLI prints it without a stack trace.
 */
export class CliError extends Schema.TaggedError<CliError>()('CliError', {
  /**
   * What went wrong and what to run or edit next.
   */
  message: Schema.String,
}) {}

/**
 * A Vite server or build that failed. Its cause is what Vite threw, which may wrap the deck's own
 * build errors; the CLI prints those without a stack trace and anything else with one.
 */
export class ViteError extends Schema.TaggedError<ViteError>()('ViteError', {
  /**
   * What Vite threw.
   */
  cause: Schema.Defect(),
}) {}

/**
 * A file or folder the CLI could not read, write, create or remove.
 */
export class FileSystemError extends Schema.TaggedError<FileSystemError>()('FileSystemError', {
  /**
   * The absolute path at fault.
   */
  path: Schema.String,

  /**
   * What failed, why, and what to do about it.
   */
  message: Schema.String,
}) {}

/**
 * Headless Chromium failed while driving a deck: it would not start, a page crashed or a call timed
 * out.
 */
export class BrowserError extends Schema.TaggedError<BrowserError>()('BrowserError', {
  /**
   * What failed and what to run next.
   */
  message: Schema.String,
}) {}

/**
 * `window.__deck.ready()` gave up because components kept holding slides with `useReadyHold`.
 */
export class SlideNotReadyError extends Schema.TaggedError<SlideNotReadyError>()(
  'SlideNotReadyError',
  {
    /**
     * The held slides, by 1-based number, as the page reported them.
     */
    slides: Schema.Array(Schema.Number),

    /**
     * Which slides are held, why, and how to release them.
     */
    message: Schema.String,
  },
) {}

/**
 * The desktop shell (`deckster present`) could not start, crashed, or is not installed.
 */
export class ShellError extends Schema.TaggedError<ShellError>()('ShellError', {
  /**
   * What failed and what to run next.
   */
  message: Schema.String,
}) {}

/**
 * Every error the CLI prints as its message alone, without a stack trace.
 */
export type ReadableError =
  | CliError
  | FileSystemError
  | BrowserError
  | SlideNotReadyError
  | ShellError;

/**
 * Builds a {@link CliError} from its message.
 *
 * @param message - What went wrong and what to do next.
 */
export function cliError(message: string): CliError {
  return new CliError({ message });
}

/**
 * Builds a {@link ShellError} from its message.
 *
 * @param message - What went wrong and what to do next.
 */
export function shellError(message: string): ShellError {
  return new ShellError({ message });
}

/**
 * Builds the error for a bad command line.
 *
 * @param problem - What is wrong with the arguments.
 * @param command - The command whose `--help` explains the usage; empty for the root help.
 */
export function usageError(problem: string, command: string): CliError {
  const help = command === '' ? 'deckster --help' : `deckster ${command} --help`;
  return cliError(`${problem}\nRun \`${help}\` for the usage.`);
}

/**
 * Builds a {@link FileSystemError} for a failed file operation, naming the path, Node's reason in
 * plain words and the fix.
 *
 * @param action - What the CLI tried, such as `create the output folder`.
 * @param file - The absolute path.
 * @param error - What the file system failed with.
 * @param fix - What the author can do, as a sentence.
 */
export function fileSystemError(
  action: string,
  file: string,
  error: PlatformError.PlatformError,
  fix: string,
): FileSystemError {
  return new FileSystemError({
    path: file,
    message: `Could not ${action} ${file}: ${describeReason(error)}.\n${fix}`,
  });
}

/**
 * Builds a {@link BrowserError} for a Playwright call that failed.
 *
 * @param action - What the CLI asked the browser to do, such as `take the screenshot`.
 * @param cause - What Playwright threw.
 */
export function browserError(action: string, cause: unknown): BrowserError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new BrowserError({
    message:
      `Chromium failed to ${action}: ${firstLine(detail)}\n` +
      'Run the command again; if it keeps failing, reinstall the browser with ' +
      `\`${playwrightInstallCommand()}\`.`,
  });
}

/**
 * The first line of a message, without Playwright's call log.
 *
 * @param text - Any message.
 */
export function firstLine(text: string): string {
  return text.split('\n')[0] ?? text;
}

/**
 * Node's reason for a file system failure in plain words, with its error code.
 *
 * @param error - What the file system failed with.
 */
function describeReason(error: PlatformError.PlatformError): string {
  const { reason } = error;
  const description = reason.description ?? reason._tag;
  const cause = reason.cause;
  const causeCode =
    Predicate.hasProperty(cause, 'code') && typeof cause.code === 'string' ? cause.code : undefined;
  const code = causeCode ?? ERROR_CODE_PATTERN.exec(description)?.[0];
  const meaning = code === undefined ? undefined : SYSTEM_ERROR_MEANINGS[code];
  if (code === undefined || meaning === undefined) {
    return firstLine(description);
  }

  return `${meaning} (${code})`;
}
