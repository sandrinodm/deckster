import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react';

import { Icon } from '#runtime/icons.tsx';

/**
 * The most lines the input grows to before it scrolls.
 */
const MAX_LINES = 6;

/**
 * The size of the icons on the screenshot, stop and send buttons, in CSS pixels.
 */
const BUTTON_ICON_PX = 14;

/**
 * The line height assumed when the browser reports none, in CSS pixels.
 */
const FALLBACK_LINE_HEIGHT_PX = 20;

/**
 * Props of {@link Composer}.
 */
export type ComposerProps = {
  /**
   * The text in the input.
   */
  readonly draft: string;

  /**
   * Changes the text.
   */
  readonly onDraft: (text: string) => void;

  /**
   * Sends the text as a prompt (queued by the host while a turn runs).
   */
  readonly onSubmit: () => void;

  /**
   * Stops the running turn and drops the queued ones.
   */
  readonly onStop: () => void;

  /**
   * Whether a turn runs.
   */
  readonly running: boolean;

  /**
   * How many prompts wait behind the running turn.
   */
  readonly queued: number;

  /**
   * Whether the next prompt attaches a screenshot.
   */
  readonly screenshot: boolean;

  /**
   * Turns the screenshot on or off.
   */
  readonly onScreenshot: (on: boolean) => void;

  /**
   * Grows each time the input should take focus.
   */
  readonly focusTick: number;

  /**
   * The provider's name, for the placeholder.
   */
  readonly provider: string;

  /**
   * The context row above the input.
   */
  readonly children?: ReactNode;
};

/**
 * The prompt input: it grows to six lines; Enter sends and Shift+Enter starts a new line; Escape
 * gives the keys back to the deck. While it has focus the deck never sees a key (the panel stops
 * them). While a turn runs the send button becomes Stop; text typed then is queued with Enter or
 * the Queue button, and the host runs it after the current turn.
 *
 * @param props - The draft, the actions and the context row.
 */
export function Composer(props: ComposerProps): ReactNode {
  const input = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(input, props.draft);
  useEffect(() => {
    if (props.focusTick > 0) {
      input.current?.focus();
    }
  }, [props.focusTick]);
  const empty = props.draft.trim() === '';
  const stopTitle =
    props.queued > 0 ? 'Stop the running turn and clear the queue' : 'Stop the running turn';
  const sendTitle = props.running ? 'Queue: runs after the current turn' : 'Send (Enter)';
  const sendLabel = props.running ? 'Queue' : 'Send';
  /**
   * Sends on Enter; returns the keys to the deck on Escape.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!empty) {
        props.onSubmit();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };
  /**
   * Sends from the button.
   */
  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!empty) {
      props.onSubmit();
    }
  };
  return (
    <form className="da-composer" onSubmit={onSubmit} aria-label="Prompt">
      {props.children}
      <div className="da-input">
        <textarea
          ref={input}
          className="da-textarea"
          rows={1}
          value={props.draft}
          placeholder={
            props.running ? 'Queue another request…' : `Ask ${props.provider} to change this slide…`
          }
          aria-label={`Message ${props.provider}`}
          aria-keyshortcuts="Enter Shift+Enter Escape"
          onChange={(event) => props.onDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="da-input-bar">
          <button
            type="button"
            className="da-toggle"
            aria-pressed={props.screenshot}
            title={
              props.screenshot
                ? 'A screenshot of the slide goes with the prompt'
                : 'No screenshot goes with the prompt'
            }
            onClick={() => props.onScreenshot(!props.screenshot)}>
            <Icon name="camera" size={BUTTON_ICON_PX} />
            Screenshot
          </button>
          <span className="da-input-hint" aria-hidden="true">
            {inputHint(props.queued, empty)}
          </span>
          {props.running ? (
            <button
              type="button"
              className="da-send"
              data-variant="stop"
              title={stopTitle}
              onClick={props.onStop}>
              <Icon name="stop" size={BUTTON_ICON_PX} />
              Stop
            </button>
          ) : null}
          {props.running && empty ? null : (
            <button
              type="submit"
              className="da-send"
              data-variant="send"
              disabled={empty}
              title={sendTitle}>
              <Icon name="send" size={BUTTON_ICON_PX} />
              {sendLabel}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

/**
 * The quiet hint beside the send button: how many prompts wait, or how to send.
 *
 * @param queued - How many prompts wait.
 * @param empty - Whether the input is empty.
 */
function inputHint(queued: number, empty: boolean): string {
  if (queued > 0) {
    return `${queued} queued`;
  }

  return empty ? 'Enter to send' : '';
}

/**
 * Grows a text area with its content up to {@link MAX_LINES} lines, then lets it scroll.
 *
 * @param ref - The text area.
 * @param value - Its text, to measure again when it changes.
 */
function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }

    const style = window.getComputedStyle(element);
    const lineHeight = Number.parseFloat(style.lineHeight) || FALLBACK_LINE_HEIGHT_PX;
    const padding =
      (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
    const max = lineHeight * MAX_LINES + padding;
    element.style.height = 'auto';
    const height = Math.min(element.scrollHeight, max);
    element.style.height = `${Math.max(height, lineHeight + padding)}px`;
    element.style.overflowY = element.scrollHeight > max ? 'auto' : 'hidden';
  }, [ref, value]);
}
