import { useOpenComments } from '@deckster/comments/picker';
import { useDeck } from '@deckster/engine';
import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

import type { AgentPanelPosition, ProviderId } from '#protocol/agent-events.ts';
import type { TurnView } from '#runtime/agent-store.ts';

import {
  agentView,
  clearPicked,
  focusComposer,
  panelState,
  requestDiff,
  retryPrompt,
  sendAgent,
  setDockPosition,
  setDockSize,
  setDraft,
  setScreenshot,
  startPicking,
  stopPicking,
  submitPrompt,
  toggleComment,
  togglePanel,
} from '#runtime/agent-client.ts';
import {
  isBusy,
  lintFindingsFor,
  queuedTurns,
  redoTarget,
  undoTarget,
  type AgentViewState,
} from '#runtime/agent-store.ts';
import { Composer } from '#runtime/composer.tsx';
import { ContextChips } from '#runtime/context-chips.tsx';
import { DOCK_SIZES } from '#runtime/dock-prefs.ts';
import { useExternalStore } from '#runtime/external-store.ts';
import { Icon } from '#runtime/icons.tsx';
import { providerLabel, StatusBanner } from '#runtime/status.tsx';
import { slideSuggestions } from '#runtime/suggestions.ts';
import { Transcript } from '#runtime/transcript.tsx';
import { TurnFooter } from '#runtime/turn-footer.tsx';

/**
 * How far one arrow key press resizes the panel, in pixels; Shift moves four times as far.
 */
const RESIZE_STEP_PX = 16;

/**
 * How much farther Shift+arrow resizes.
 */
const RESIZE_SHIFT_FACTOR = 4;

/**
 * The label of the button that starts a new conversation, and of its confirm button.
 */
const NEW_CONVERSATION_LABEL = 'New conversation';

/**
 * Props of {@link AgentPanel}.
 */
export type AgentPanelProps = {
  /**
   * The provider the dev server was started with, until the host's status names it.
   */
  readonly provider: ProviderId;
};

/**
 * The agent chat panel: a labelled region docked beside or below the slide, with the header
 * (provider, model, new conversation, dock position, hide), the connection and provider state, the
 * conversation, and the composer with its context row. Keys pressed inside it never reach the deck;
 * Escape gives them back.
 *
 * @param props - The provider from the dev server.
 */
export function AgentPanel(props: AgentPanelProps): ReactNode {
  const deck = useDeck();
  const view = useExternalStore(agentView);
  const panel = useExternalStore(panelState);
  const summary = deck.slides[deck.position.slide];
  const comments = useOpenComments(summary?.id);
  const provider = providerLabel(view.status?.provider ?? props.provider);
  const deckName = view.status?.deck ?? '';
  const busy = isBusy(view);
  const running = (view.status?.running ?? null) !== null;
  const undo = undoTarget(view);
  const redo = redoTarget(view);
  const lastFinished = view.turns.findLast(
    (turn) => turn.provider !== null && turn.phase !== 'queued' && turn.phase !== 'running',
  );
  const slide = summary === undefined ? undefined : { id: summary.id, step: deck.position.step };
  const suggestions = slideSuggestions({
    title: summary?.title ?? '',
    findings: summary === undefined ? [] : lintFindingsFor(view, summary.id),
    comments,
  });
  /**
   * The footer of a finished turn.
   *
   * @param turn - The turn.
   */
  const footer = (turn: TurnView) => (
    <TurnFooter
      turn={turn}
      deck={deckName}
      diff={view.diffs[turn.turn]}
      linting={
        turn.lint === null &&
        turn.changedFiles.length > 0 &&
        turn.phase !== 'cancelled' &&
        view.status?.running === turn.turn
      }
      busy={busy}
      canUndo={undo === turn.turn}
      canRedo={redo === turn.turn}
      problem={turn === lastFinished ? view.requestProblem : null}
      past={turn !== lastFinished}
      provider={provider}
      onDiff={() => requestDiff(turn.turn)}
      onUndo={() => sendAgent({ type: 'undo', turn: turn.turn })}
      onRedo={() => sendAgent({ type: 'redo', turn: turn.turn })}
    />
  );
  return (
    <section
      className="dp-ui da-panel"
      data-dock={panel.position}
      data-deck-interactive=""
      aria-label={`${provider} agent`}
      onKeyDown={keepKeysInPanel}>
      <ResizeHandle position={panel.position} size={panel.sizes[panel.position]} />
      <PanelHeader
        view={view}
        provider={provider}
        position={panel.position}
        busy={busy}
        running={running}
      />
      <StatusBanner
        view={view}
        shownInline={
          view.status?.problem !== null &&
          view.turns.at(-1)?.error?.kind === view.status?.problem?.kind
        }
      />
      <div className="da-body">
        <Transcript
          turns={view.turns}
          deck={deckName}
          provider={provider}
          announcement={view.announcement}
          footer={footer}
          suggestions={suggestions}
          onSuggestion={(suggestion) => {
            setDraft(suggestion.prompt);
            if (suggestion.comment !== undefined && !panel.comments.includes(suggestion.comment)) {
              toggleComment(suggestion.comment);
            }

            focusComposer();
          }}
          onRetry={(turn) =>
            retryPrompt(
              turn.prompt,
              turn.slide === null ? slide : { id: turn.slide.id, step: turn.slide.step },
            )
          }
        />
        <Composer
          draft={panel.draft}
          onDraft={setDraft}
          onSubmit={() => submitPrompt(slide)}
          onStop={() => sendAgent({ type: 'cancel' })}
          running={running}
          queued={queuedTurns(view).length}
          screenshot={panel.screenshot}
          onScreenshot={setScreenshot}
          focusTick={panel.focusTick}
          provider={provider}>
          <ContextChips
            slide={
              summary === undefined
                ? undefined
                : {
                    number: deck.position.slide + 1,
                    title: summary.title,
                    file: summary.file,
                    step: deck.position.step,
                    stepCount: deck.stepCount,
                  }
            }
            picked={panel.picked}
            pickedElsewhere={
              panel.picked !== undefined &&
              panel.pickedSlide !== undefined &&
              panel.pickedSlide !== summary?.id
            }
            picking={panel.picking}
            comments={comments}
            attached={panel.comments}
            onPick={() => (panel.picking ? stopPicking() : startPicking())}
            onClearPicked={clearPicked}
            onToggleComment={toggleComment}
          />
        </Composer>
      </div>
    </section>
  );
}

/**
 * Keeps every key pressed inside the panel away from the deck's window listener, so typing, arrows
 * and Space never navigate; Escape outside the input gives focus back to the deck.
 *
 * @param event - The key press.
 */
export function keepKeysInPanel(event: KeyboardEvent<HTMLElement>): void {
  event.stopPropagation();
  if (
    event.key === 'Escape' &&
    !event.defaultPrevented &&
    document.activeElement instanceof HTMLElement
  ) {
    document.activeElement.blur();
  }
}

/**
 * The header: provider and model, New conversation (with a confirm), the dock position switch and
 * hide.
 *
 * @param props - The view state, the provider's name, the dock and whether a turn runs.
 */
function PanelHeader({
  view,
  provider,
  position,
  busy,
  running,
}: {
  view: AgentViewState;
  provider: string;
  position: AgentPanelPosition;
  busy: boolean;
  running: boolean;
}): ReactNode {
  const [confirming, setConfirming] = useState(false);
  const other: AgentPanelPosition = position === 'right' ? 'bottom' : 'right';
  const state = headState(view, running);
  const stopNote = busy ? ' The running turn stops and the queue is cleared.' : '';
  return (
    <>
      <div className="da-head">
        <span className="da-head-dot" data-state={state} aria-hidden="true" />
        <span className="da-head-name">{provider}</span>
        <ModelField
          model={view.status?.model ?? null}
          used={view.turns.findLast((turn) => turn.model !== null)?.model ?? null}
        />
        <span className="da-head-state" role="status">
          {state === 'running' ? 'Working…' : ''}
        </span>
        <span className="da-spacer" />
        <button
          type="button"
          className="da-icon-button"
          aria-label={NEW_CONVERSATION_LABEL}
          title={NEW_CONVERSATION_LABEL}
          aria-expanded={confirming}
          disabled={view.turns.length === 0 && !busy}
          onClick={() => setConfirming(!confirming)}>
          <Icon name="compose" />
        </button>
        <button
          type="button"
          className="da-icon-button"
          aria-label={dockLabel(other)}
          title={dockLabel(other)}
          onClick={() => setDockPosition(other)}>
          <Icon name={other === 'bottom' ? 'dockBottom' : 'dockRight'} />
        </button>
        <button
          type="button"
          className="da-icon-button"
          aria-label="Hide the agent panel"
          title="Hide (A)"
          onClick={() => togglePanel(false)}>
          <Icon name="close" />
        </button>
      </div>
      {confirming ? (
        <div className="da-confirm" role="alertdialog" aria-label="Start a new conversation?">
          <div className="da-confirm-text">
            <strong>Start a new conversation?</strong> {provider} forgets this one; the files stay
            as they are.{stopNote}
          </div>
          <div className="da-confirm-actions">
            <button type="button" className="da-text-button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="da-text-button"
              data-variant="primary"
              autoFocus
              onClick={() => {
                sendAgent({ type: 'new-conversation' });
                setConfirming(false);
              }}>
              {NEW_CONVERSATION_LABEL}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * The label of the dock button: where the panel goes when the button is pressed.
 *
 * @param position - The position the button moves the panel to.
 */
function dockLabel(position: AgentPanelPosition): string {
  return position === 'bottom' ? 'Dock below the slide' : 'Dock beside the slide';
}

/**
 * The state the header dot shows.
 *
 * @param view - The view state.
 * @param running - Whether a turn runs.
 */
function headState(
  view: AgentViewState,
  running: boolean,
): 'connecting' | 'problem' | 'running' | 'ready' {
  if (view.connection !== 'open') {
    return 'connecting';
  }

  if ((view.status?.problem ?? null) !== null && view.status?.problem?.kind !== 'mcp-unavailable') {
    return 'problem';
  }

  return running ? 'running' : 'ready';
}

/**
 * The model of the next turns: a button that turns into a field. With no model chosen it shows the
 * one the provider's default resolved to in the last turn, when known. Enter sets it (empty for the
 * provider's default), Escape leaves it as it was.
 *
 * @param props - The chosen model (null for the default) and the model the last turn used.
 */
function ModelField({ model, used }: { model: string | null; used: string | null }): ReactNode {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  if (!editing) {
    return (
      <button
        type="button"
        className="da-model"
        title={
          model === null && used !== null
            ? `The provider's default (${used} last turn); ` +
              'click to change the model of the next turns'
            : 'Change the model of the next turns'
        }
        onClick={() => {
          setValue(model ?? '');
          setEditing(true);
        }}>
        {model ?? used ?? 'default model'}
      </button>
    );
  }

  return (
    <input
      className="da-model-input"
      aria-label="Model for the next turns (empty for the default)"
      placeholder="default"
      value={value}
      // The field opens on a click that asks for it, so taking focus is what the person expects.
      // oxlint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
      spellCheck={false}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => setEditing(false)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          sendAgent({ type: 'set-model', model: value.trim() === '' ? null : value.trim() });
          setEditing(false);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          setEditing(false);
        }
      }}
    />
  );
}

/**
 * The edge of the panel that resizes it: drag it, or focus it and use the arrow keys.
 *
 * @param props - The dock position and its size.
 */
function ResizeHandle({
  position,
  size,
}: {
  position: AgentPanelPosition;
  size: number;
}): ReactNode {
  const limits = DOCK_SIZES[position];
  /**
   * The stage the panel sits in.
   *
   * @param element - The handle.
   */
  const stageOf = (element: Element) => element.closest('.da-stage')?.getBoundingClientRect();
  /**
   * Follows a drag until the pointer comes up.
   */
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    /**
     * The size for a pointer position.
     *
     * @param moved - The pointer event.
     */
    const measure = (moved: globalThis.PointerEvent) => {
      const stage = stageOf(handle);
      if (stage === undefined) {
        return undefined;
      }

      return position === 'right'
        ? { size: stage.right - moved.clientX, window: stage.width }
        : { size: stage.bottom - moved.clientY, window: stage.height };
    };
    /**
     * Resizes while dragging.
     *
     * @param moved - The pointer event.
     */
    const onMove = (moved: globalThis.PointerEvent) => {
      const next = measure(moved);
      if (next !== undefined) {
        setDockSize(next.size, next.window, false);
      }
    };
    /**
     * Saves the size at the end.
     *
     * @param ended - The pointer event.
     */
    const onUp = (ended: globalThis.PointerEvent) => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      const next = measure(ended);
      if (next !== undefined) {
        setDockSize(next.size, next.window, true);
      }
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };
  /**
   * Resizes with the arrow keys.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const grow = position === 'right' ? 'ArrowLeft' : 'ArrowUp';
    const shrink = position === 'right' ? 'ArrowRight' : 'ArrowDown';
    if (event.key !== grow && event.key !== shrink) {
      return;
    }

    event.preventDefault();
    const step = RESIZE_STEP_PX * (event.shiftKey ? RESIZE_SHIFT_FACTOR : 1);
    const stage = stageOf(event.currentTarget);
    const windowSize = position === 'right' ? stage?.width : stage?.height;
    setDockSize(size + (event.key === grow ? step : -step), windowSize ?? Infinity, true);
  };
  return (
    <div
      className="da-resize"
      role="separator"
      tabIndex={0}
      aria-label="Resize the agent panel"
      aria-orientation={position === 'right' ? 'vertical' : 'horizontal'}
      aria-valuenow={size}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}
