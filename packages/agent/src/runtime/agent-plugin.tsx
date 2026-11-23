import { findStamped } from '@deckster/comments/picker';
import { definePlugin, useDeck, type DeckControls } from '@deckster/engine';
import { registerShortcut, registerToolButton, windowKind } from '@deckster/presenter';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import config from 'virtual:deck/agent';
import '@deckster/presenter/tokens.css';

import type { AgentClientConfig, AgentEvent, ClientMessage } from '#protocol/agent-events.ts';
import type { AgentConnectionState } from '#runtime/agent-connection.ts';

import {
  agentView,
  attachConnection,
  dropPickedOffSlide,
  initPanel,
  panelState,
  receiveConnectionState,
  receiveEvent,
  togglePanel,
} from '#runtime/agent-client.ts';
import { agentSocketUrl, connectAgent } from '#runtime/agent-connection.ts';
import { AgentPanel } from '#runtime/agent-panel.tsx';
import { useExternalStore } from '#runtime/external-store.ts';
import { ICONS } from '#runtime/icons.tsx';
import '#runtime/agent.css';

/**
 * The distance from the viewport's top, in CSS pixels, under which an outlined element's label is
 * drawn below the element's top edge, because there is no room above it.
 */
const OUTLINE_LABEL_ROOM_PX = 28;

/**
 * How many events `window.__deckAgent.events` keeps; the oldest go first.
 */
const MAX_HANDLE_EVENTS = 2000;

/**
 * What the page exposes as `window.__deckAgent` while the agent is connected: tests read it, and it
 * is a handy console hook. It can send nothing the panel's own controls cannot (the host accepts
 * only prompts, cancel, undo, redo, new conversation, the model and diffs), and `send` exists only
 * with the test-only fake provider, which needs `DECK_TEST_FAKE_AGENT`.
 */
export type DeckAgentHandle = {
  /**
   * Sends a message to the agent host; only with the fake provider, for tests.
   */
  readonly send?: (message: ClientMessage) => void;

  /**
   * The recent events of the current conversation, in order; cleared when the conversation resets.
   */
  readonly events: AgentEvent[];

  /**
   * Where the connection is.
   */
  state: AgentConnectionState;

  /**
   * The provider and panel position from the dev server.
   */
  readonly config: Pick<AgentClientConfig, 'provider' | 'panel'>;
};

registerShortcut({
  id: 'agent.panel',
  keys: ['a'],
  label: 'Agent panel: ask an agent to change the slide',
  group: 'Agent',
  window: 'audience',
  run: () => togglePanel(),
});

registerToolButton({
  id: 'agent.panel',
  label: 'Agent',
  shortcut: 'a',
  icon: ICONS.agent,
  order: 110,
  run: () => togglePanel(),
  usePressed: () => !useExternalStore(panelState).collapsed,
});

/**
 * Whatever the dev server's config carries for authenticating the socket beyond the path, the
 * provider and the panel position, handed to `connectAgent` untouched. The panel never reads it
 * itself, so a change in how the page authenticates stays inside the connection.
 *
 * @param settings - The `virtual:deck/agent` config.
 */
function connectionCredentials(
  settings: AgentClientConfig,
): Omit<AgentClientConfig, 'path' | 'provider' | 'panel'> {
  const { path: _path, provider: _provider, panel: _panel, ...credentials } = settings;
  return credentials;
}

/**
 * Whether the panel belongs on this page: a dev server with `--agent`, the audience window, not
 * `?static`.
 *
 * @param deck - The deck's controls.
 */
function agentActive(deck: DeckControls): boolean {
  return !deck.isStatic && windowKind() !== 'presenter' && import.meta.hot !== undefined;
}

/**
 * Wraps the stage so the slide scales into the room the docked panel leaves, as it does beside the
 * sidebar, and draws the panel at the stage's right or bottom edge. Below about 900 px wide the
 * panel lies over the slide instead (see `agent.css`). While a turn runs, a thin line along the
 * dock edge says the agent is editing. In `?static` and the presenter window it adds nothing.
 *
 * @param props - The scaled canvas.
 */
function AgentStage({ children }: { children: ReactNode }): ReactNode {
  const deck = useDeck();
  const panel = useExternalStore(panelState);
  const view = useExternalStore(agentView);
  const active = agentActive(deck);
  useDockAttributes(
    active && !panel.collapsed ? panel.position : undefined,
    panel.sizes[panel.position],
  );
  if (!active) {
    return children;
  }

  const running = (view.status?.running ?? null) !== null;
  const style: CSSProperties & { [name: `--${string}`]: string } = {
    '--da-size': `${panel.sizes[panel.position]}px`,
  };
  return (
    <div
      className="da-stage"
      data-dock={panel.position}
      data-open={!panel.collapsed}
      data-picking={panel.picking}
      style={style}>
      <div className="da-slide-area">
        {children}
        {running ? <div className="dp-ui da-editing" aria-hidden="true" /> : null}
      </div>
      {panel.collapsed ? null : <AgentPanel provider={config.provider} />}
    </div>
  );
}

/**
 * Marks the document with the open dock's position and size, so chrome outside the stage (the tool
 * cluster in the bottom-left corner) can move clear of a bottom dock.
 *
 * @param position - The open dock's position, or undefined when the panel is hidden.
 * @param size - Its size in pixels.
 */
function useDockAttributes(position: string | undefined, size: number): void {
  useEffect(() => {
    const root = document.documentElement;
    if (position === undefined) {
      delete root.dataset.deckAgentDock;
      root.style.removeProperty('--deck-agent-size');
      return undefined;
    }

    root.dataset.deckAgentDock = position;
    root.style.setProperty('--deck-agent-size', `${size}px`);
    return () => {
      delete root.dataset.deckAgentDock;
      root.style.removeProperty('--deck-agent-size');
    };
  }, [position, size]);
}

/**
 * Connects the page to the agent endpoint, feeds the panel's store and exposes the connection as
 * `window.__deckAgent`; outlines the picked element on the slide while its chip exists. Draws
 * nothing in `?static` mode, in the presenter window or without a dev server.
 */
function AgentOverlay(): ReactNode {
  const deck = useDeck();
  const active = agentActive(deck);
  const deckId = deck.manifest.id;
  const slideId = deck.slides[deck.position.slide]?.id;
  useEffect(() => dropPickedOffSlide(slideId), [slideId]);
  useEffect(() => (active ? connectPanel(deckId) : undefined), [active, deckId]);
  if (!active) {
    return null;
  }

  return <PickedOutline />;
}

/**
 * Opens the connection for a deck, exposes it as `window.__deckAgent` and hands it to the panel.
 * The returned function closes it and removes the handle again.
 *
 * @param deckId - The deck id the dock settings are saved under.
 */
function connectPanel(deckId: string): () => void {
  initPanel(deckId, config.panel);
  const handle: DeckAgentHandle = {
    events: [],
    state: 'connecting',
    config: { provider: config.provider, panel: config.panel },
  };
  const connection = connectAgent({
    url: agentSocketUrl(window.location, config.path),
    ...connectionCredentials(config),
    onEvent: (event) => {
      if (event.type === 'conversation-reset') {
        handle.events.length = 0;
      }

      handle.events.push(event);
      if (handle.events.length > MAX_HANDLE_EVENTS) {
        handle.events.splice(0, handle.events.length - MAX_HANDLE_EVENTS);
      }

      receiveEvent(event);
    },
    onState: (state) => {
      handle.state = state;
      receiveConnectionState(state);
    },
  });
  if (config.provider === 'fake') {
    Object.assign(handle, { send: connection.send });
  }

  Object.assign(window, { __deckAgent: handle });
  attachConnection(connection);
  return () => {
    attachConnection(undefined);
    connection.close();
    Reflect.deleteProperty(window, '__deckAgent');
  };
}

/**
 * The outline of the picked element, drawn while its chip exists and its slide is on screen. Hot
 * reload replaces the element when the agent edits the slide; the outline then finds it again by
 * its source stamp. It follows the element every frame, since the slide scales and moves.
 */
function PickedOutline(): ReactNode {
  const { picked, pickedSlide } = useExternalStore(panelState);
  const box = useTrackedBox(picked?.element, picked?.stamp, pickedSlide);
  if (picked === undefined || box === undefined) {
    return null;
  }

  return (
    <div className="dp-ui da-outline-root" aria-hidden="true">
      <div
        className="da-outline"
        style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
        <span
          className="da-outline-label"
          data-below={box.top < OUTLINE_LABEL_ROOM_PX || undefined}>
          Agent · {picked.label}
        </span>
      </div>
    </div>
  );
}

/**
 * The box of an element in viewport pixels, every frame, or undefined when its slide is not on
 * screen. A detached element is found again by its stamp.
 *
 * @param element - The element.
 * @param stamp - Its source stamp.
 * @param slideId - The slide it is on.
 */
function useTrackedBox(
  element: Element | undefined,
  stamp: string | undefined,
  slideId: string | undefined,
): DOMRect | undefined {
  const [box, setBox] = useState<DOMRect | undefined>(undefined);
  useEffect(() => {
    if (element === undefined) {
      return undefined;
    }

    let current = element;
    let frame = 0;
    /**
     * Measures the element and schedules the next frame.
     */
    const measure = () => {
      if (!current.isConnected && stamp !== undefined) {
        current = findStamped(stamp) ?? current;
      }

      const onScreen =
        current.isConnected &&
        current.closest('.deck-slide[data-slide-active="true"]') !== null &&
        (slideId === undefined ||
          current.closest('[data-slide-id]')?.getAttribute('data-slide-id') === slideId);
      const next = onScreen ? current.getBoundingClientRect() : undefined;
      setBox((previous) => (sameBox(previous, next) ? previous : next));
      frame = window.requestAnimationFrame(measure);
    };
    frame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(frame);
  }, [element, stamp, slideId]);
  return element === undefined ? undefined : box;
}

/**
 * Whether two boxes are the same, to the pixel.
 *
 * @param left - One box.
 * @param right - The other.
 */
function sameBox(left: DOMRect | undefined, right: DOMRect | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }

  return (
    Math.round(left.left) === Math.round(right.left) &&
    Math.round(left.top) === Math.round(right.top) &&
    Math.round(left.width) === Math.round(right.width) &&
    Math.round(left.height) === Math.round(right.height)
  );
}

/**
 * The agent chat panel for `deckster dev --agent` and `deckster present --agent`: `a` (or the chat
 * button in the tool cluster) shows or hides it. Loaded only while serving with `--agent`.
 */
export default definePlugin({
  name: '@deckster/agent/panel',
  stage: AgentStage,
  overlay: AgentOverlay,
});
