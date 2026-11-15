import { rmSync } from 'node:fs';

/**
 * One change to what must be cleaned up if this process dies, as the watchdog reads it (one JSON
 * object per line).
 */
export type CleanupMessage =
  | {
      /**
       * A process group that must not outlive this process.
       */
      readonly group: number;

      /**
       * Whether it is tracked (true) or gone (false).
       */
      readonly live: boolean;
    }
  | {
      /**
       * A file that must not outlive this process (it holds a token).
       */
      readonly file: string;

      /**
       * Whether it is tracked (true) or gone (false).
       */
      readonly live: boolean;
    };

/**
 * What must not outlive this process: provider process groups and token files, and who hears about
 * changes (the watchdog, when one runs).
 */
const REGISTRY = {
  /**
   * Live process groups, by leader pid.
   */
  groups: new Set<number>(),

  /**
   * Files to remove, absolute.
   */
  files: new Set<string>(),

  /**
   * Hear every change.
   */
  listeners: new Set<(message: CleanupMessage) => void>(),

  /**
   * Whether the `exit` hook is installed.
   */
  hooked: false,
};

/**
 * Tells the listeners about a change.
 *
 * @param message - The change.
 */
function announce(message: CleanupMessage): void {
  for (const listener of REGISTRY.listeners) {
    listener(message);
  }
}

/**
 * Installs, once, the last-resort `exit` hook: whatever way the process ends (`process.exit()` from
 * a library, an uncaught error, the end of the event loop), it kills the live provider process
 * groups and removes the token files synchronously. Finalizers normally do this first; the hook
 * only catches what they could not.
 */
function hook(): void {
  if (REGISTRY.hooked) {
    return;
  }

  REGISTRY.hooked = true;
  process.once('exit', cleanupNow);
}

/**
 * Tracks a provider process group until {@link untrackGroup}.
 *
 * @param pid - The group leader's pid.
 */
export function trackGroup(pid: number): void {
  hook();
  REGISTRY.groups.add(pid);
  announce({ group: pid, live: true });
}

/**
 * Stops tracking a process group that ended.
 *
 * @param pid - The group leader's pid.
 */
export function untrackGroup(pid: number): void {
  REGISTRY.groups.delete(pid);
  announce({ group: pid, live: false });
}

/**
 * Tracks a file that holds a secret (`server.json`, a provider's MCP config) until
 * {@link untrackFile}.
 *
 * @param file - The absolute path.
 */
export function trackFile(file: string): void {
  hook();
  REGISTRY.files.add(file);
  announce({ file, live: true });
}

/**
 * Stops tracking a file that was removed.
 *
 * @param file - The absolute path.
 */
export function untrackFile(file: string): void {
  REGISTRY.files.delete(file);
  announce({ file, live: false });
}

/**
 * Hears every change, starting with what is tracked now (the watchdog mirrors the registry).
 *
 * @param listener - Receives each change.
 * @returns Stops listening.
 */
export function watchCleanup(listener: (message: CleanupMessage) => void): () => void {
  for (const group of REGISTRY.groups) {
    listener({ group, live: true });
  }

  for (const file of REGISTRY.files) {
    listener({ file, live: true });
  }

  REGISTRY.listeners.add(listener);
  return () => {
    REGISTRY.listeners.delete(listener);
  };
}

/**
 * Kills every tracked process group and removes every tracked file, synchronously (it runs from the
 * `exit` hook, where nothing asynchronous happens any more).
 */
export function cleanupNow(): void {
  for (const group of REGISTRY.groups) {
    try {
      process.kill(-group, 'SIGKILL');
    } catch {
      // The group is already gone.
    }
  }

  for (const file of REGISTRY.files) {
    try {
      rmSync(file, { force: true });
    } catch {
      // Nothing more can be done while exiting.
    }
  }

  REGISTRY.groups.clear();
  REGISTRY.files.clear();
}
