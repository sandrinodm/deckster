import { createHash } from 'node:crypto';
import path from 'node:path';

import { readStaticModule, type StaticCallee } from '#node/static-module.ts';

/**
 * One hold on the code under some folders: an agent turn in flight there, from before its provider
 * starts until the turn guard has put back everything the turn may not change.
 */
type ActiveHold = {
  /**
   * The absolute folders held.
   */
  readonly roots: readonly string[];

  /**
   * The contents the framework itself vouches for while the hold lasts, as SHA-256 hashes by
   * absolute file: a file's content when the turn began, and the slide-list edits the deck tools
   * made since.
   */
  readonly accepted: Map<string, Set<string>>;
};

/**
 * What a hold lets the turn guard do.
 */
export type CodeHold = {
  /**
   * Vouches for a content of a file under the held folders, so a loader may read it as data while
   * the hold lasts.
   *
   * @param file - The absolute path.
   * @param text - The content.
   */
  readonly accept: (file: string, text: string) => void;

  /**
   * Ends the hold and tells the listeners, so a server loads the files under it again.
   */
  readonly release: () => void;
};

/**
 * The gate's state for this process: the holds, who hears about released folders and the value each
 * loaded file's default export had.
 */
const STATE = {
  /**
   * The holds in force.
   */
  holds: new Set<ActiveHold>(),

  /**
   * Called with an absolute folder whose hold ended.
   */
  listeners: new Set<(root: string) => void>(),

  /**
   * Called with the absolute folders of a hold that began.
   */
  heldListeners: new Set<(roots: readonly string[]) => void>(),

  /**
   * The default export each file had when it was last loaded, by absolute path.
   */
  loaded: new Map<string, unknown>(),
};

/**
 * How a loader gets a file's default export: `import` it; use the `value` read without running the
 * file (data the framework vouches for) or kept from the last load; or `held`, when the file may
 * not run now and there is no earlier value.
 */
export type GatedLoad =
  | {
      /**
       * Import the module.
       */
      readonly kind: 'import';
    }
  | {
      /**
       * Use this value.
       */
      readonly kind: 'value';

      /**
       * The default export.
       */
      readonly value: unknown;
    }
  | {
      /**
       * Nothing may load.
       */
      readonly kind: 'held';
    };

/**
 * The SHA-256 of a text, hex.
 *
 * @param text - The content.
 */
function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * The holds that cover a file.
 *
 * @param file - An absolute path.
 */
function holdsOf(file: string): ActiveHold[] {
  const resolved = path.resolve(file);
  return [...STATE.holds].filter((hold) =>
    hold.roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`)),
  );
}

/**
 * Holds the code under some folders: until the hold is released, a deck config or brand file under
 * them is never imported (an agent process could change it under the import); a loader reads it as
 * data when its content is one the framework vouches for, and otherwise keeps the value it loaded
 * last. An agent host holds the deck and brand folders for the whole of a turn, until the turn
 * guard has restored what the turn may not change.
 *
 * @param roots - The absolute folders.
 */
export function holdCode(roots: readonly string[]): CodeHold {
  const hold: ActiveHold = { roots: roots.map((root) => path.resolve(root)), accepted: new Map() };
  STATE.holds.add(hold);
  for (const listener of STATE.heldListeners) {
    listener(hold.roots);
  }

  let released = false;
  return {
    accept: (file, text) => {
      const resolved = path.resolve(file);
      const hashes = hold.accepted.get(resolved) ?? new Set<string>();
      hashes.add(hashText(text));
      hold.accepted.set(resolved, hashes);
    },
    release: () => {
      if (released) {
        return;
      }

      released = true;
      STATE.holds.delete(hold);
      for (const root of hold.roots) {
        for (const listener of STATE.listeners) {
          listener(root);
        }
      }
    },
  };
}

/**
 * Whether a file lies under a folder an agent turn holds.
 *
 * @param file - An absolute path.
 */
export function isCodeHeld(file: string): boolean {
  return holdsOf(file).length > 0;
}

/**
 * Listens for folders whose hold ended, so a server can load their files again.
 *
 * @param listener - Called with the absolute folder.
 * @returns Stops listening.
 */
export function onCodeReleased(listener: (root: string) => void): () => void {
  STATE.listeners.add(listener);
  return () => {
    STATE.listeners.delete(listener);
  };
}

/**
 * Listens for holds that begin, so a loader can stop code it is running under the held folders at
 * once instead of when it next looks. The hold is in force when the listener is called.
 *
 * @param listener - Called with the absolute folders held.
 * @returns Stops listening.
 */
export function onCodeHeld(listener: (roots: readonly string[]) => void): () => void {
  STATE.heldListeners.add(listener);
  return () => {
    STATE.heldListeners.delete(listener);
  };
}

/**
 * Decides how a loader gets the default export of a deck config or brand file. Outside a held
 * folder: import it. Inside one, the module never runs: a content the framework vouches for (the
 * file as the turn found it, or a slide-list edit by the deck tools) that is a plain data literal
 * is read without running it; anything else keeps the value of the last load.
 *
 * @param file - The absolute path.
 * @param text - Its content now.
 * @param callee - The function its literal may be wrapped in.
 */
export function gatedLoad(file: string, text: string, callee: StaticCallee): GatedLoad {
  const holds = holdsOf(file);
  if (holds.length === 0) {
    return { kind: 'import' };
  }

  const resolved = path.resolve(file);
  const hash = hashText(text);
  const vouched = holds.every((hold) => hold.accepted.get(resolved)?.has(hash) === true);
  if (vouched) {
    const read = readStaticModule(text, callee);
    if (read.ok) {
      STATE.loaded.set(resolved, read.value);
      return { kind: 'value', value: read.value };
    }
  }

  return STATE.loaded.has(resolved)
    ? { kind: 'value', value: STATE.loaded.get(resolved) }
    : { kind: 'held' };
}

/**
 * Records the default export a loader imported, so a load during a hold can keep it.
 *
 * @param file - The absolute path.
 * @param value - The default export.
 */
export function rememberLoaded(file: string, value: unknown): void {
  STATE.loaded.set(path.resolve(file), value);
}

/**
 * Forgets the default export kept for a file, because the file is gone: a file deleted during a
 * hold and created again must not answer with the value it had before.
 *
 * @param file - The absolute path.
 */
export function forgetLoaded(file: string): void {
  STATE.loaded.delete(path.resolve(file));
}

/**
 * Forgets everything, for tests.
 */
export function resetCodeGate(): void {
  STATE.holds.clear();
  STATE.listeners.clear();
  STATE.heldListeners.clear();
  STATE.loaded.clear();
}
