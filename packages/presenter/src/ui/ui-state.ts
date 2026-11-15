import { createStore, useStore } from '#state/store.ts';

/**
 * How the audience window is covered: black or white, or not covered.
 */
export type BlackoutMode = 'black' | 'white';

/**
 * Where the presenter's laser pointer is, as fractions of the slide: 0 to 1 from the top left.
 */
export type LaserPoint = {
  /**
   * Horizontal fraction.
   */
  x: number;

  /**
   * Vertical fraction.
   */
  y: number;
};

/**
 * The presenter tools' state, shared by the shortcuts and the components.
 */
export type UiState = {
  /**
   * Whether the sidebar filmstrip is open.
   */
  sidebarOpen: boolean;

  /**
   * Whether the overview grid is open.
   */
  overviewOpen: boolean;

  /**
   * The slide the overview has selected, zero-based.
   */
  overviewSelected: number;

  /**
   * How many thumbnails the overview shows per row, for the up and down arrows.
   */
  overviewColumns: number;

  /**
   * Whether the shortcut help is open.
   */
  helpOpen: boolean;

  /**
   * Whether the displays panel is open; only inside the desktop shell (`deck present`).
   */
  displaysOpen: boolean;

  /**
   * The digits typed after `g`, or `undefined` when the go-to prompt is closed.
   */
  gotoBuffer: string | undefined;

  /**
   * The cover over the audience window, if any.
   */
  blackout: BlackoutMode | undefined;

  /**
   * Whether this window's pointer is a laser: a dot following the cursor.
   */
  laser: boolean;

  /**
   * Where this window's laser points on the slide, set by the presenter window's current-slide pane
   * and sent to the audience window.
   */
  laserPoint: LaserPoint | undefined;

  /**
   * The laser point the presenter window sent, shown in the audience window.
   */
  remoteLaser: LaserPoint | undefined;

  /**
   * In the presenter window: whether the audience window has closed and none has come back.
   */
  audienceGone: boolean;
};

/**
 * The localStorage key that remembers whether the sidebar is open.
 */
const SIDEBAR_KEY = 'deck-presenter:sidebar';

/**
 * The presenter tools' state. Nothing is open at first, except a sidebar the user left open.
 */
export const uiState = createStore<UiState>({
  sidebarOpen: readSidebarPreference(),
  overviewOpen: false,
  overviewSelected: 0,
  overviewColumns: 1,
  helpOpen: false,
  displaysOpen: false,
  gotoBuffer: undefined,
  blackout: undefined,
  laser: false,
  laserPoint: undefined,
  remoteLaser: undefined,
  audienceGone: false,
});

/**
 * Reads the presenter tools' state in a component.
 */
export function useUiState(): UiState {
  return useStore(uiState);
}

/**
 * Merges changes into the state.
 *
 * @param changes - The fields to change.
 */
export function updateUi(changes: Partial<UiState>): void {
  uiState.set({ ...uiState.get(), ...changes });
}

/**
 * Opens or closes the sidebar and remembers the choice.
 *
 * @param open - The new state; toggles when omitted.
 */
export function setSidebarOpen(open: boolean = !uiState.get().sidebarOpen): void {
  updateUi({ sidebarOpen: open });
  try {
    window.localStorage.setItem(SIDEBAR_KEY, open ? 'open' : 'closed');
  } catch {
    // Storage can be blocked or full; the sidebar then forgets its state on reload.
  }
}

/**
 * Opens the overview with a slide selected.
 *
 * @param selected - The zero-based slide, normally the one on screen.
 */
export function openOverview(selected: number): void {
  updateUi({ overviewOpen: true, overviewSelected: selected });
}

/**
 * Covers the audience window, or clears the cover; pressing the same key twice clears it.
 *
 * @param mode - The cover, or `undefined` to clear it.
 */
export function setBlackout(mode: BlackoutMode | undefined): void {
  updateUi({ blackout: mode });
}

/**
 * Toggles a cover: the same mode again clears it, the other mode switches to it.
 *
 * @param mode - The cover the key asks for.
 */
export function toggleBlackout(mode: BlackoutMode): void {
  setBlackout(uiState.get().blackout === mode ? undefined : mode);
}

/**
 * Closes the topmost overlay, in the order they are stacked on screen: the blackout covers
 * everything, then the go-to prompt, the displays panel, the help and the overview.
 *
 * @returns `true` when something was open.
 */
export function closeTopOverlay(): boolean {
  const state = uiState.get();
  if (state.blackout !== undefined) {
    setBlackout(undefined);
    return true;
  }

  if (state.gotoBuffer !== undefined) {
    updateUi({ gotoBuffer: undefined });
    return true;
  }

  if (state.displaysOpen) {
    updateUi({ displaysOpen: false });
    return true;
  }

  if (state.helpOpen) {
    updateUi({ helpOpen: false });
    return true;
  }

  if (state.overviewOpen) {
    updateUi({ overviewOpen: false });
    return true;
  }

  return false;
}

/**
 * Whether a panel that takes the keyboard and pointer is open: the go-to prompt, help, the displays
 * panel or the overview.
 *
 * @param state - The presenter tools' state; the current one by default.
 */
export function isModalOpen(state: UiState = uiState.get()): boolean {
  return (
    state.gotoBuffer !== undefined || state.helpOpen || state.displaysOpen || state.overviewOpen
  );
}

/**
 * Whether the remembered sidebar state says open.
 */
function readSidebarPreference(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === 'open';
  } catch {
    return false;
  }
}
