import { pickElement, type PickedElement } from '@deckster/comments/picker';

import type {
  AgentEvent,
  AgentPanelPosition,
  ClientMessage,
  PromptMessage,
} from '#protocol/agent-events.ts';
import type { AgentConnectionState } from '#runtime/agent-connection.ts';

import {
  INITIAL_AGENT_STATE,
  reduceAgent,
  reduceConnection,
  requestDiffState,
  type AgentViewState,
} from '#runtime/agent-store.ts';
import {
  clampSize,
  defaultDockPrefs,
  loadDockPrefs,
  saveDockPrefs,
  type DockPrefs,
} from '#runtime/dock-prefs.ts';
import { createExternalStore } from '#runtime/external-store.ts';

/**
 * The panel's own state: the dock, the draft and what it attaches. It lives outside React so a
 * collapsed panel keeps its draft and a hot reload of a component keeps both.
 */
export type PanelState = DockPrefs & {
  /**
   * The deck id the dock settings are saved under, or an empty string before the plugin mounts.
   */
  readonly deck: string;

  /**
   * The text in the composer.
   */
  readonly draft: string;

  /**
   * The element picked on the slide, sent as the selection of the next prompt.
   */
  readonly picked: PickedElement | undefined;

  /**
   * The slide the picked element is on, or undefined.
   */
  readonly pickedSlide: string | undefined;

  /**
   * Whether the comment overlay's picker is choosing an element for the panel.
   */
  readonly picking: boolean;

  /**
   * The review comment ids attached to the next prompt.
   */
  readonly comments: readonly string[];

  /**
   * Whether the next prompt attaches a screenshot of the slide.
   */
  readonly screenshot: boolean;

  /**
   * Grows each time the composer should take focus.
   */
  readonly focusTick: number;
};

/**
 * The slide and step on screen, as a prompt names them.
 */
export type SlidePosition = {
  /**
   * The slide id.
   */
  readonly id: string;

  /**
   * The step, from 0.
   */
  readonly step: number;
};

/**
 * The conversation as the panel draws it, reduced from the event stream.
 */
export const agentView = createExternalStore<AgentViewState>(INITIAL_AGENT_STATE);

/**
 * The panel's own state.
 */
export const panelState = createExternalStore<PanelState>({
  ...defaultDockPrefs('right'),
  deck: '',
  draft: '',
  picked: undefined,
  pickedSlide: undefined,
  picking: false,
  comments: [],
  screenshot: true,
  focusTick: 0,
});

/**
 * The live connection, while the overlay holds one.
 */
let connection: { readonly send: (message: ClientMessage) => void } | undefined;

/**
 * Cancels the pick under way, if the panel started one.
 */
let cancelPick: (() => void) | undefined;

/**
 * Hands the panel a connection, or takes it away.
 *
 * @param next - The connection, or `undefined` when it closed.
 */
export function attachConnection(
  next: { readonly send: (message: ClientMessage) => void } | undefined,
): void {
  connection = next;
}

/**
 * Applies an event from the agent host.
 *
 * @param event - The event.
 */
export function receiveEvent(event: AgentEvent): void {
  agentView.update((state) => reduceAgent(state, event));
}

/**
 * Records where the connection is.
 *
 * @param phase - The connection's state.
 */
export function receiveConnectionState(phase: AgentConnectionState): void {
  agentView.update((state) => reduceConnection(state, phase));
}

/**
 * Sends a message to the agent host; dropped while there is no connection object (the connection
 * itself keeps messages until its socket opens).
 *
 * @param message - The message.
 */
export function sendAgent(message: ClientMessage): void {
  connection?.send(message);
}

/**
 * Loads the dock settings of a deck once the plugin knows which deck it is.
 *
 * @param deck - The deck id.
 * @param configured - The position the dev server asked for.
 */
export function initPanel(deck: string, configured: AgentPanelPosition): void {
  if (panelState.get().deck === deck) {
    return;
  }

  panelState.update((state) => ({ ...state, ...loadDockPrefs(deck, configured), deck }));
}

/**
 * Changes the dock settings and saves them for the deck.
 *
 * @param change - The fields to change.
 */
function updateDock(change: Partial<DockPrefs>): void {
  panelState.update((state) => ({ ...state, ...change }));
  const { deck, position, sizes, collapsed, configured } = panelState.get();
  if (deck !== '') {
    saveDockPrefs(deck, { position, sizes, collapsed, configured });
  }
}

/**
 * Opens or collapses the panel; opening puts the cursor in the composer.
 *
 * @param open - Whether to open it; toggles when omitted.
 */
export function togglePanel(open: boolean = panelState.get().collapsed): void {
  updateDock({ collapsed: !open });
  if (open) {
    focusComposer();
  }
}

/**
 * Asks the composer to take focus.
 */
export function focusComposer(): void {
  panelState.update((state) => ({ ...state, focusTick: state.focusTick + 1 }));
}

/**
 * Docks the panel to the right of the slide or below it.
 *
 * @param position - Where.
 */
export function setDockPosition(position: AgentPanelPosition): void {
  updateDock({ position });
}

/**
 * Resizes the panel at its current position.
 *
 * @param size - The width or height in CSS pixels.
 * @param windowSize - The window's width or height, to keep the slide visible.
 * @param save - Whether to save it (at the end of a drag).
 */
export function setDockSize(size: number, windowSize: number, save: boolean): void {
  const { position, sizes } = panelState.get();
  const next = { ...sizes, [position]: clampSize(position, size, windowSize) };
  if (save) {
    updateDock({ sizes: next });
  } else {
    panelState.update((state) => ({ ...state, sizes: next }));
  }
}

/**
 * Changes the composer's text.
 *
 * @param draft - The text.
 */
export function setDraft(draft: string): void {
  panelState.update((state) => ({ ...state, draft }));
}

/**
 * Starts the comment overlay's picker for the panel. Focus leaves the panel so the picker's keys
 * (Tab, Enter, Escape) reach it; it comes back to the composer when the pick ends.
 */
export function startPicking(): void {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  panelState.update((state) => ({ ...state, picking: true }));
  cancelPick = pickElement({
    onPick: (picked) => {
      cancelPick = undefined;
      const pickedSlide =
        picked.element.closest('[data-slide-id]')?.getAttribute('data-slide-id') ?? undefined;
      panelState.update((state) => ({ ...state, picked, pickedSlide, picking: false }));
      focusComposer();
    },
    onCancel: () => {
      cancelPick = undefined;
      panelState.update((state) => ({ ...state, picking: false }));
      focusComposer();
    },
  });
}

/**
 * Stops a pick the panel started.
 */
export function stopPicking(): void {
  cancelPick?.();
}

/**
 * Drops the picked element when the slide on screen is not the slide it was picked on.
 *
 * @param slideId - The slide on screen.
 */
export function dropPickedOffSlide(slideId: string | undefined): void {
  const { picked, pickedSlide } = panelState.get();
  if (picked !== undefined && pickedSlide !== undefined && slideId !== pickedSlide) {
    clearPicked();
  }
}

/**
 * Drops the picked element.
 */
export function clearPicked(): void {
  panelState.update((state) => ({ ...state, picked: undefined, pickedSlide: undefined }));
}

/**
 * Attaches a review comment to the next prompt, or detaches it.
 *
 * @param id - The comment id.
 */
export function toggleComment(id: string): void {
  panelState.update((state) => ({
    ...state,
    comments: state.comments.includes(id)
      ? state.comments.filter((comment) => comment !== id)
      : [...state.comments, id],
  }));
}

/**
 * Turns the screenshot attachment on or off.
 *
 * @param on - Whether to attach one.
 */
export function setScreenshot(on: boolean): void {
  panelState.update((state) => ({ ...state, screenshot: on }));
}

/**
 * The prompt message the composer would send now.
 *
 * @param text - The text.
 * @param slide - The slide and step on screen.
 * @param state - The panel state.
 */
export function promptMessage(
  text: string,
  slide: SlidePosition | undefined,
  state: Pick<PanelState, 'picked' | 'comments' | 'screenshot'>,
): PromptMessage {
  return {
    type: 'prompt',
    text,
    ...promptTarget(slide, state.picked),
    ...(state.comments.length === 0 ? {} : { comments: state.comments }),
    screenshot: state.screenshot && slide !== undefined,
  };
}

/**
 * The slide and the selection a prompt carries, each only when it is set.
 *
 * @param slide - The slide and step on screen.
 * @param picked - The element picked on the slide.
 */
function promptTarget(
  slide: SlidePosition | undefined,
  picked: PickedElement | undefined,
): Pick<PromptMessage, 'slide' | 'selection'> {
  return {
    ...(slide === undefined ? {} : { slide: { id: slide.id, step: slide.step } }),
    ...(picked === undefined ? {} : { selection: selectionOf(picked) }),
  };
}

/**
 * The selection a prompt sends for a picked element: its text, or its tag when it has none, and its
 * source location when it has one.
 *
 * @param picked - The element picked on the slide.
 */
function selectionOf(picked: PickedElement): NonNullable<PromptMessage['selection']> {
  return {
    text: picked.text === '' ? `<${picked.tag}>` : picked.text,
    ...(picked.stamp === undefined ? {} : { source: picked.stamp }),
  };
}

/**
 * Sends the composer's text as a prompt about the slide on screen, with the picked element, the
 * attached comments and the screenshot setting, then clears the draft and the comments; the picked
 * element stays. While a turn runs the host queues it.
 *
 * @param slide - The slide and step on screen.
 * @returns Whether anything was sent.
 */
export function submitPrompt(slide: SlidePosition | undefined): boolean {
  const state = panelState.get();
  const text = state.draft.trim();
  if (text === '') {
    return false;
  }

  sendAgent(promptMessage(text, slide, state));
  // The picked element stays (and stays outlined) for follow-ups, until it is removed or the
  // deck moves to another slide; attached comments go with this prompt only.
  panelState.update((current) => ({ ...current, draft: '', comments: [] }));
  return true;
}

/**
 * Sends a turn's prompt again, about the same slide.
 *
 * @param prompt - The prompt text.
 * @param slide - The slide it was about, or the one on screen.
 */
export function retryPrompt(prompt: string, slide: SlidePosition | undefined): void {
  sendAgent({
    type: 'prompt',
    text: prompt,
    ...(slide === undefined ? {} : { slide }),
    screenshot: panelState.get().screenshot && slide !== undefined,
  });
}

/**
 * Asks the host for a turn's diff, unless it is known or on its way.
 *
 * @param turn - The turn.
 */
export function requestDiff(turn: number): void {
  const before = agentView.get();
  const after = requestDiffState(before, turn);
  if (after === before) {
    return;
  }

  agentView.set(after);
  sendAgent({ type: 'diff', turn });
}
