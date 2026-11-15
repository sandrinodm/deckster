/**
 * The deck CLI's watchdog, a tiny process of its own (`node watchdog-main.ts`), started beside a
 * dev server that runs an agent or MCP endpoint. Its standard input is a pipe from the CLI carrying
 * one JSON object per line: `{ group, live }` for a provider process group, `{ file, live }` for a
 * file that holds a token, and `{ done: true }` when the CLI is shutting down cleanly. When the
 * pipe closes without `done` (the CLI was killed, even with SIGKILL, which runs no finalizer and no
 * `exit` hook), it sends SIGTERM to every live group, SIGKILL a second later, removes the files,
 * and exits. It uses only Node's own modules, so it starts in milliseconds.
 */
import { rmSync } from 'node:fs';

/**
 * How long a group gets between SIGTERM and SIGKILL, in milliseconds.
 */
const KILL_AFTER_MS = 1000;

/**
 * The live provider process groups, by leader pid.
 */
const groups = new Set<number>();

/**
 * The token files to remove.
 */
const files = new Set<string>();
let done = false;
let buffered = '';

/**
 * Applies one line from the CLI.
 *
 * @param line - A JSON object.
 */
function apply(line: string): void {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (typeof message !== 'object' || message === null) {
    return;
  }

  const record = message as { group?: unknown; file?: unknown; live?: unknown; done?: unknown };
  if (record.done === true) {
    done = true;
  } else if (
    typeof record.group === 'number' &&
    Number.isInteger(record.group) &&
    record.group > 1
  ) {
    if (record.live === true) {
      groups.add(record.group);
    } else {
      groups.delete(record.group);
    }
  } else if (typeof record.file === 'string' && record.file.startsWith('/')) {
    if (record.live === true) {
      files.add(record.file);
    } else {
      files.delete(record.file);
    }
  }
}

/**
 * Sends a signal to every live group.
 *
 * @param signal - The signal.
 */
function signalGroups(signal: NodeJS.Signals): void {
  for (const group of groups) {
    try {
      process.kill(-group, signal);
    } catch {
      groups.delete(group);
    }
  }
}

/**
 * Cleans up after a CLI that went away, then exits.
 */
function orphaned(): void {
  if (done) {
    process.exit(0);
  }

  for (const file of files) {
    try {
      rmSync(file, { force: true });
    } catch {
      // Nothing else to try.
    }
  }

  signalGroups('SIGTERM');
  if (groups.size === 0) {
    process.exit(0);
  }

  setTimeout(() => {
    signalGroups('SIGKILL');
    process.exit(0);
  }, KILL_AFTER_MS);
}

process.on('SIGINT', () => undefined);
process.on('SIGTERM', () => process.exit(0));
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buffered += chunk;
  const lines = buffered.split('\n');
  buffered = lines.pop() ?? '';
  for (const line of lines) {
    apply(line);
  }
});
process.stdin.on('end', orphaned);
process.stdin.on('close', orphaned);
process.stdin.on('error', orphaned);
process.stdout.write('watchdog ready\n');
