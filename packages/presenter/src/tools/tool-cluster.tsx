import { useDeck, type DeckControls } from '@deckster/engine';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { formatKey } from '#shortcuts/key-format.ts';
import { DEFAULT_ORDER, useToolButtons, type ToolButton } from '#tools/tool-registry.ts';
import { isInToolZone, TOOL_IDLE_MS, toolReveals, useToolReveal } from '#tools/tool-reveal.ts';
import { useUiState } from '#ui/ui-state.ts';

/**
 * The tool cluster: a small strip of buttons in the bottom-left corner of the audience window for
 * the tools that otherwise need a key: the sidebar, the overview, the presenter window, fullscreen,
 * help, and whatever other plugins register (`registerToolButton`). It appears while the pointer
 * moves near that corner, when a finger taps it, or when a key moves focus into it, and fades when
 * idle. It is fixed over the viewport, so the slide never moves.
 */
export function ToolCluster(): ReactNode {
  const deck = useDeck();
  const buttons = useToolButtons();
  const { sidebarOpen } = useUiState();
  const revealedAt = useToolReveal();
  const [nearCorner, setNearCorner] = useState(false);
  const [expired, setExpired] = useState<number | undefined>(undefined);
  const [hasFocus, setHasFocus] = useState(false);
  const [hovered, setHovered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    /**
     * Reveals the cluster while a mouse or pen moves near its corner.
     */
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        return;
      }

      const isNear = isInToolZone(event.clientX, event.clientY, window.innerHeight);
      setNearCorner(isNear);
      if (isNear) {
        toolReveals.set(Date.now());
      }
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const isFresh = revealedAt !== undefined && expired !== revealedAt;
  useEffect(() => {
    if (revealedAt === undefined) {
      return undefined;
    }

    const timer = window.setTimeout(() => setExpired(revealedAt), TOOL_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [revealedAt]);

  const isVisible = hasFocus || hovered || nearCorner || isFresh;
  return (
    <div
      ref={rootRef}
      className="dp-ui dp-tools"
      data-deck-interactive=""
      data-visible={isVisible}
      data-sidebar={sidebarOpen}
      role="toolbar"
      aria-label="Presenter tools"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHasFocus(true)}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || rootRef.current?.contains(next) !== true) {
          setHasFocus(false);
        }
      }}>
      {buttons.map((button, index) => (
        <ToolButtonView
          key={button.id}
          button={button}
          deck={deck}
          divided={index > 0 && isPlugin(button) && !isPlugin(buttons[index - 1])}
        />
      ))}
    </div>
  );
}

/**
 * Whether a button comes from another plugin, by its order: plugins' buttons sit at the default
 * order or later.
 *
 * @param button - The button, if any.
 */
function isPlugin(button: ToolButton | undefined): boolean {
  return (button?.order ?? DEFAULT_ORDER) >= DEFAULT_ORDER;
}

/**
 * Props of {@link ToolButtonView}.
 */
type ToolButtonViewProps = {
  /**
   * The button.
   */
  button: ToolButton;

  /**
   * The deck's controls, passed to the button's handler.
   */
  deck: DeckControls;

  /**
   * Whether a divider sits before it.
   */
  divided: boolean;
};

/**
 * One button: its icon, its label as the accessible name and tooltip, and its pressed state. A
 * mouse click does not move focus to it, so Space and a clicker keep navigating the deck
 * afterwards; Tab still reaches it.
 */
function ToolButtonView({ button, deck, divided }: ToolButtonViewProps): ReactNode {
  const pressed = usePressedOf(button);
  return (
    <>
      {divided ? <span className="dp-tools-divider" aria-hidden="true" /> : null}
      <button
        type="button"
        className="dp-tool"
        data-tool={button.id}
        aria-label={button.label}
        aria-pressed={button.usePressed === undefined ? undefined : pressed}
        aria-keyshortcuts={button.shortcut}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => button.run({ deck })}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {button.icon.map((path) => (
            <path key={path} d={path} />
          ))}
        </svg>
        <span className="dp-tool-tip" role="presentation">
          {button.label}
          {button.shortcut === undefined ? null : <kbd>{formatKey(button.shortcut)}</kbd>}
        </span>
      </button>
    </>
  );
}

/**
 * Calls the button's pressed hook, or says not pressed. A button keeps its hook for its lifetime,
 * because the cluster keys buttons by id.
 *
 * @param button - The button.
 */
function usePressedOf(button: ToolButton): boolean {
  const usePressed = button.usePressed ?? notPressed;
  return usePressed();
}

/**
 * The pressed state of a button that has none.
 */
function notPressed(): boolean {
  return false;
}
