import type { AgentPanelPosition } from '#protocol/agent-events.ts';

/**
 * The sizes of each dock position, in CSS pixels: the width of the right dock, the height of the
 * bottom one.
 */
export const DOCK_SIZES: Readonly<
  Record<
    AgentPanelPosition,
    {
      /**
       * The size a new panel opens at.
       */
      readonly initial: number;

      /**
       * The smallest size a drag leaves.
       */
      readonly min: number;

      /**
       * The largest size a drag leaves.
       */
      readonly max: number;
    }
  >
> = {
  /**
   * The width beside the slide.
   */
  right: { initial: 400, min: 320, max: 640 },

  /**
   * The height below the slide.
   */
  bottom: { initial: 280, min: 200, max: 560 },
};

/**
 * The share of the window the panel may take at most, so the slide never disappears.
 */
const MAX_WINDOW_SHARE = 0.7;

/**
 * What the panel remembers per deck.
 */
export type DockPrefs = {
  /**
   * Where it docks.
   */
  readonly position: AgentPanelPosition;

  /**
   * The size of each position.
   */
  readonly sizes: Readonly<Record<AgentPanelPosition, number>>;

  /**
   * Whether it is collapsed.
   */
  readonly collapsed: boolean;

  /**
   * The position the dev server asked for when these were saved: a different `--agent-panel` later
   * wins over the remembered position.
   */
  readonly configured: AgentPanelPosition;
};

/**
 * The storage key of a deck's panel settings.
 *
 * @param deck - The deck id.
 */
function storageKey(deck: string): string {
  return `deck-agent-panel:${deck}`;
}

/**
 * The settings of a fresh panel.
 *
 * @param configured - The position the dev server asked for.
 */
export function defaultDockPrefs(configured: AgentPanelPosition): DockPrefs {
  return {
    position: configured,
    sizes: { right: DOCK_SIZES.right.initial, bottom: DOCK_SIZES.bottom.initial },
    collapsed: false,
    configured,
  };
}

/**
 * Reads a deck's panel settings. Missing, unreadable or blocked storage gives the defaults, and a
 * dev server started with another `--agent-panel` than last time resets the position.
 *
 * @param deck - The deck id.
 * @param configured - The position the dev server asked for.
 * @param storage - Where they are kept; `localStorage` by default.
 */
export function loadDockPrefs(
  deck: string,
  configured: AgentPanelPosition,
  storage: Pick<Storage, 'getItem'> | undefined = safeStorage(),
): DockPrefs {
  const fallback = defaultDockPrefs(configured);
  try {
    const saved: unknown = JSON.parse(storage?.getItem(storageKey(deck)) ?? 'null');
    if (typeof saved !== 'object' || saved === null) {
      return fallback;
    }

    const value: Partial<Record<keyof DockPrefs, unknown>> = saved;
    const sizes: Partial<Record<AgentPanelPosition, unknown>> =
      typeof value.sizes === 'object' && value.sizes !== null ? value.sizes : {};
    const sameConfig = value.configured === configured;
    return {
      position:
        sameConfig && (value.position === 'right' || value.position === 'bottom')
          ? value.position
          : configured,
      sizes: {
        right: clampSize('right', numberOr(sizes.right, fallback.sizes.right)),
        bottom: clampSize('bottom', numberOr(sizes.bottom, fallback.sizes.bottom)),
      },
      collapsed: value.collapsed === true,
      configured,
    };
  } catch {
    return fallback;
  }
}

/**
 * Saves a deck's panel settings; does nothing when storage is unavailable.
 *
 * @param deck - The deck id.
 * @param prefs - The settings.
 * @param storage - Where they are kept; `localStorage` by default.
 */
export function saveDockPrefs(
  deck: string,
  prefs: DockPrefs,
  storage: Pick<Storage, 'setItem'> | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(storageKey(deck), JSON.stringify(prefs));
  } catch {
    // Storage full or blocked: the panel works without remembering.
  }
}

/**
 * A size kept inside its position's limits and, given the window, inside the share of it the panel
 * may take.
 *
 * @param position - The dock position.
 * @param size - The wanted size.
 * @param windowSize - The window's width (right dock) or height (bottom dock), if known.
 */
export function clampSize(position: AgentPanelPosition, size: number, windowSize?: number): number {
  const limits = DOCK_SIZES[position];
  const max =
    windowSize === undefined
      ? limits.max
      : Math.max(limits.min, Math.min(limits.max, Math.round(windowSize * MAX_WINDOW_SHARE)));
  return Math.round(Math.min(max, Math.max(limits.min, size)));
}

/**
 * A finite number, or a fallback.
 *
 * @param value - Anything.
 * @param fallback - The fallback.
 */
function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * `localStorage`, or `undefined` where reading it throws (blocked site data, a sandboxed frame).
 */
function safeStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
