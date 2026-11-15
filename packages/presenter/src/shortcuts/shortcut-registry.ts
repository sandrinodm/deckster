import type { DeckControls } from '@deckster/engine';

import { normalizeKey } from '#shortcuts/key-format.ts';
import { createStore, useStore } from '#state/store.ts';

/**
 * Which window a shortcut belongs to: the audience window shows the deck, the presenter window
 * shows notes and timers. A shortcut without a window works in both.
 */
export type ShortcutWindow = 'audience' | 'presenter';

/**
 * What a shortcut's handler gets.
 */
export type ShortcutContext = {
  /**
   * The key press.
   */
  event: KeyboardEvent;

  /**
   * The deck's controls.
   */
  deck: DeckControls;
};

/**
 * One keyboard shortcut. The help overlay lists every registered shortcut, so a plugin that adds a
 * key registers it here instead of listening on the window itself.
 */
export type Shortcut = {
  /**
   * A unique id such as `sidebar.toggle`. Registering an id again replaces the earlier shortcut,
   * which keeps hot reloads working.
   */
  id: string;

  /**
   * The `KeyboardEvent.key` values that trigger it, such as `['s']` or `['ArrowLeft', 'PageUp']`.
   * Letters match either case; Ctrl, Alt and Meta presses never match.
   */
  keys: readonly string[];

  /**
   * What it does, in a few words, as the help overlay shows it.
   */
  label: string;

  /**
   * The help overlay section it is listed under, such as `Navigation`.
   */
  group: string;

  /**
   * Restricts it to one window; both windows when omitted.
   */
  window?: ShortcutWindow;

  /**
   * Does the work. Return `false` to decline the key press, so navigation or another shortcut
   * handles it. A shortcut without a handler is documentation only, for keys the engine handles
   * itself.
   */
  run?: (context: ShortcutContext) => boolean | void;
};

/**
 * Every registered shortcut, in registration order.
 */
const shortcuts = createStore<readonly Shortcut[]>([]);

/**
 * Registers a shortcut, or replaces the one with the same id.
 *
 * @param shortcut - The shortcut.
 * @returns A function that removes it again.
 * @throws RangeError naming both shortcuts when one of its keys already belongs to another shortcut
 *   that works in the same window.
 */
export function registerShortcut(shortcut: Shortcut): () => void {
  const others = shortcuts.get().filter((existing) => existing.id !== shortcut.id);
  const clash = findClash(others, shortcut);
  if (clash !== undefined) {
    throw new RangeError(
      `The shortcut "${shortcut.id}" uses "${clash.key}", ` +
        `which "${clash.other.id}" already uses. Pick another key.`,
    );
  }

  shortcuts.set([...others, shortcut]);
  return () => shortcuts.set(shortcuts.get().filter((existing) => existing !== shortcut));
}

/**
 * Every registered shortcut, in registration order.
 */
export function listShortcuts(): readonly Shortcut[] {
  return shortcuts.get();
}

/**
 * Reads the registered shortcuts in a component and re-renders when one is added or removed.
 */
export function useShortcuts(): readonly Shortcut[] {
  return useStore(shortcuts);
}

/**
 * Runs the shortcut a key press triggers, if any.
 *
 * @param context - The key press and the deck.
 * @param shortcutWindow - The window the press happened in.
 * @returns `true` when a shortcut handled the key press and the engine must not navigate.
 */
export function dispatchShortcut(
  context: ShortcutContext,
  shortcutWindow: ShortcutWindow,
): boolean {
  const { event } = context;
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return false;
  }

  const key = normalizeKey(event.key);
  const match = shortcuts.get().find((shortcut) => matches(shortcut, key, shortcutWindow));
  if (match?.run === undefined) {
    return false;
  }

  return match.run(context) !== false;
}

/**
 * The shortcuts that apply in a window, grouped for the help overlay in registration order.
 *
 * @param shortcutWindow - The window the overlay is shown in.
 */
export function groupShortcuts(
  shortcutWindow: ShortcutWindow,
): readonly { group: string; shortcuts: readonly Shortcut[] }[] {
  const groups = new Map<string, Shortcut[]>();
  for (const shortcut of shortcuts.get()) {
    if (shortcut.window !== undefined && shortcut.window !== shortcutWindow) {
      continue;
    }

    groups.set(shortcut.group, [...(groups.get(shortcut.group) ?? []), shortcut]);
  }

  return [...groups].map(([group, members]) => ({ group, shortcuts: members }));
}

/**
 * Whether a shortcut answers a key in a window.
 *
 * @param shortcut - The shortcut.
 * @param key - The normalized key.
 * @param shortcutWindow - The window.
 */
function matches(shortcut: Shortcut, key: string, shortcutWindow: ShortcutWindow): boolean {
  const inWindow = shortcut.window === undefined || shortcut.window === shortcutWindow;
  return inWindow && shortcut.keys.some((candidate) => normalizeKey(candidate) === key);
}

/**
 * The first key `shortcut` shares with one of `others` in a window both work in.
 *
 * @param others - The registered shortcuts.
 * @param shortcut - The one being registered.
 */
function findClash(
  others: readonly Shortcut[],
  shortcut: Shortcut,
): { key: string; other: Shortcut } | undefined {
  for (const other of others) {
    const overlap =
      other.window === undefined ||
      shortcut.window === undefined ||
      other.window === shortcut.window;
    if (!overlap) {
      continue;
    }

    const key = shortcut.keys.find((candidate) =>
      other.keys.some((taken) => normalizeKey(taken) === normalizeKey(candidate)),
    );
    if (key !== undefined) {
      return { key, other };
    }
  }

  return undefined;
}

/**
 * Removes every shortcut; for tests.
 */
export function clearShortcuts(): void {
  shortcuts.set([]);
}
