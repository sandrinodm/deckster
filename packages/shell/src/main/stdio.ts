import {
  decodeCommand,
  encodeMessage,
  type ShellCommand,
  type ShellEvent,
} from '#protocol/shell-messages.ts';

/**
 * The part of a writable stream the shell uses.
 */
export type WritableLike = {
  /**
   * Whether the stream has been destroyed.
   */
  readonly destroyed: boolean;

  /**
   * Writes a chunk.
   *
   * @param chunk - The text.
   * @param callback - Called when the write finished or failed.
   */
  write: (chunk: string, callback?: (error?: Error | null) => void) => boolean;

  /**
   * Listens for stream errors such as `EPIPE`.
   *
   * @param event - `error`.
   * @param listener - Called with the error.
   */
  on: (event: 'error', listener: (error: Error) => void) => unknown;
};

/**
 * Writes protocol events to the CLI. A write after the pipe broke is dropped silently, and a broken
 * pipe (`EPIPE`) calls `onClosed` once, because it means the CLI is gone.
 */
export type EventWriter = {
  /**
   * Sends one event; never throws.
   *
   * @param event - The event.
   */
  send: (event: ShellEvent) => void;

  /**
   * Whether the pipe is known to be broken.
   */
  readonly closed: () => boolean;
};

/**
 * Wraps the shell's standard output as an {@link EventWriter}.
 *
 * @param stream - Standard output.
 * @param onClosed - Called once when the pipe breaks.
 */
export function createEventWriter(stream: WritableLike, onClosed: () => void): EventWriter {
  let broken = false;
  /**
   * Records that the pipe is broken and tells the owner, once.
   */
  const markBroken = (): void => {
    if (broken) {
      return;
    }

    broken = true;
    onClosed();
  };
  stream.on('error', markBroken);
  return {
    send: (event) => {
      if (broken || stream.destroyed) {
        return;
      }

      try {
        stream.write(encodeMessage(event), (error) => {
          if (error) {
            markBroken();
          }
        });
      } catch {
        markBroken();
      }
    },
    closed: () => broken,
  };
}

/**
 * The longest command line the shell accepts, in characters. A plan is a few hundred; anything
 * longer is not the CLI, and buffering it without a bound would let a writer exhaust memory.
 */
export const MAX_COMMAND_LINE = 1024 * 1024;

/**
 * Splits a byte stream into lines and decodes each as a command; the CLI's side of the pipe. A line
 * that is not a command, a line over {@link MAX_COMMAND_LINE} characters (dropped up to its
 * newline, reported once) and a command whose handler throws are reported through `onBadLine`;
 * nothing a writer sends makes the reader throw.
 *
 * @param onCommand - Called with each valid command.
 * @param onBadLine - Called with the reason when a line is not a valid command or fails.
 */
export function createCommandReader(
  onCommand: (command: ShellCommand) => void,
  onBadLine: (reason: string) => void,
): {
  /**
   * Feeds a chunk of text.
   *
   * @param chunk - Text from standard input.
   */
  push: (chunk: string) => void;

  /**
   * How many characters wait for their newline.
   */
  buffered: () => number;
} {
  let buffer = '';
  let skipping = false;
  /**
   * Decodes one complete line and applies it.
   */
  const apply = (raw: string): void => {
    const line = raw.trim();
    if (line === '') {
      return;
    }

    const decoded = decodeCommand(line);
    if (!decoded.ok) {
      onBadLine(decoded.reason);
      return;
    }

    try {
      onCommand(decoded.message);
    } catch (error) {
      onBadLine(
        `${decoded.message.type} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  return {
    push: (chunk) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (skipping) {
          skipping = false;
        } else if (line.length > MAX_COMMAND_LINE) {
          onBadLine(`a line longer than ${MAX_COMMAND_LINE} characters was dropped`);
        } else {
          apply(line);
        }

        newline = buffer.indexOf('\n');
      }

      if (buffer.length > MAX_COMMAND_LINE) {
        buffer = '';
        if (!skipping) {
          skipping = true;
          onBadLine(`a line longer than ${MAX_COMMAND_LINE} characters was dropped`);
        }
      }
    },
    buffered: () => buffer.length,
  };
}
