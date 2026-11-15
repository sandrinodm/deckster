import { useDeck } from '@deckster/engine';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import type { Draft } from '#overlay/comments-state.ts';
import type { CanvasGeometry } from '#overlay/element-target.ts';

import { selectChild, selectParent } from '#overlay/comment-keys.ts';
import {
  closeDraft,
  discardDraft,
  showToast,
  updateComments,
  useCommentsState,
} from '#overlay/comments-state.ts';
import { draftRequest } from '#overlay/draft-request.ts';
import { sendFeedback } from '#overlay/feedback-client.ts';
import { targetLabel } from '#overlay/labels.ts';
import { TypePicker } from '#overlay/type-picker.tsx';

/**
 * The composer's width, in viewport pixels.
 */
const COMPOSER_WIDTH = 340;

/**
 * The height the composer needs below a box before it opens above it instead, in viewport pixels.
 */
const COMPOSER_ROOM = 250;

/**
 * The gap between the box and the composer, and between the composer and the window's edge.
 */
const GAP_PX = 12;

/**
 * The rows of the composer's text field.
 */
const COMPOSER_ROWS = 3;

/**
 * What Alt plus a key does in the text field.
 */
const ALT_ACTIONS: Readonly<Record<string, 'parent' | 'child'>> = {
  /**
   * Selects the parent element.
   */
  ArrowUp: 'parent',

  /**
   * Selects the child element.
   */
  ArrowDown: 'child',
};

/**
 * Props of {@link CommentComposer}.
 */
type CommentComposerProps = {
  /**
   * What the comment is about.
   */
  draft: Draft;

  /**
   * The box of the element or region, in viewport pixels; `undefined` for the whole slide.
   */
  box: DOMRect | undefined;

  /**
   * Where the canvas is.
   */
  geometry: CanvasGeometry;
};

/**
 * The popover a new comment is written in, next to the element it is about: its source label,
 * buttons to pick the parent or child element (Alt+Up and Alt+Down in the text field), the text, an
 * optional type, and Save (Cmd or Ctrl+Enter) or Discard. Escape closes it and keeps the text for
 * that target until it is saved or discarded.
 */
export function CommentComposer({ draft, box, geometry }: CommentComposerProps): ReactNode {
  const { draftText, draftType } = useCommentsState();
  const { save, saving } = useSaveDraft(draft, geometry);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, [draft]);

  return (
    <form
      className="dc-popover dc-composer"
      data-deck-interactive=""
      aria-label="New comment"
      style={composerPosition(box, geometry)}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}>
      <div className="dc-popover-head">
        <span className="dc-target-label">{draftLabel(draft)}</span>
        {draft.kind === 'element' ? <WalkButtons /> : null}
      </div>
      <textarea
        ref={input}
        className="dc-textarea"
        rows={COMPOSER_ROWS}
        placeholder="What should change?"
        aria-label="Comment"
        value={draftText}
        onChange={(event) => updateComments({ draftText: event.target.value })}
        onKeyDown={(event) => composerKey(event, save)}
      />
      <div className="dc-popover-foot">
        <TypePicker value={draftType} onChange={(type) => updateComments({ draftType: type })} />
        <span className="dc-spacer" />
        <button
          type="button"
          className="dp-button"
          title="Throw the draft away (Escape closes and keeps it)"
          onClick={discardDraft}>
          Discard
        </button>
        <button
          type="submit"
          className="dp-button"
          data-variant="primary"
          disabled={draftText.trim() === '' || saving}
          title="Save (Cmd or Ctrl+Enter)">
          Save
        </button>
      </div>
    </form>
  );
}

/**
 * Saving the draft: sends it with the slide and step on screen, then closes the composer.
 *
 * @param draft - What the comment is about.
 * @param geometry - Where the canvas is.
 * @returns The save function, and whether a save is running.
 */
function useSaveDraft(
  draft: Draft,
  geometry: CanvasGeometry,
): { save: () => Promise<void>; saving: boolean } {
  const deck = useDeck();
  const { draftText, draftType } = useCommentsState();
  const [saving, setSaving] = useState(false);
  const slide = deck.manifest.slides[deck.position.slide];

  /**
   * Saves the comment and closes the composer.
   */
  const save = async () => {
    const text = draftText.trim();
    if (text === '' || slide === undefined || saving) {
      return;
    }

    setSaving(true);
    const { step } = deck.position;
    const request = draftRequest({ draft, slide: slide.id, step, text, type: draftType, geometry });
    const saved = await sendFeedback(request);
    setSaving(false);
    if (saved) {
      discardDraft();
      showToast('Comment saved');
    }
  };
  return { save, saving };
}

/**
 * The buttons that move the selection to the parent or child element.
 */
function WalkButtons(): ReactNode {
  return (
    <span className="dc-walk">
      <button
        type="button"
        className="dp-button"
        data-variant="icon"
        title="Parent element (Alt+Up)"
        aria-label="Parent element"
        onClick={selectParent}>
        ↑
      </button>
      <button
        type="button"
        className="dp-button"
        data-variant="icon"
        title="Child element (Alt+Down)"
        aria-label="Child element"
        onClick={selectChild}>
        ↓
      </button>
    </span>
  );
}

/**
 * The text field's own keys: Cmd or Ctrl+Enter saves, Escape closes the composer and keeps the
 * draft for its target, Alt+Up and Alt+Down walk the element tree.
 *
 * @param event - The key press in the text field.
 * @param save - Saves the draft.
 */
function composerKey(event: KeyboardEvent<HTMLTextAreaElement>, save: () => Promise<void>): void {
  const action = composerAction(event);
  if (action === undefined) {
    return;
  }

  event.preventDefault();
  switch (action) {
    case 'save':
      void save();
      return;
    case 'cancel':
      closeDraft();
      return;
    case 'parent':
      selectParent();
      return;
    case 'child':
      selectChild();
  }
}

/**
 * What a key press in the text field asks for, if anything.
 *
 * @param event - The key press.
 */
function composerAction(
  event: KeyboardEvent<HTMLTextAreaElement>,
): 'save' | 'cancel' | 'parent' | 'child' | undefined {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    return 'save';
  }

  if (event.key === 'Escape') {
    return 'cancel';
  }

  if (!event.altKey) {
    return undefined;
  }

  return ALT_ACTIONS[event.key];
}

/**
 * The composer's heading: the element's source label, or what else the comment is about.
 *
 * @param draft - The draft.
 */
function draftLabel(draft: Draft): string {
  switch (draft.kind) {
    case 'element':
      return targetLabel(draft.target);
    case 'region':
      return 'Region of the slide';
    case 'slide':
      return 'Whole slide';
  }
}

/**
 * Where the composer goes: below the box when there is room, else above it, kept on screen; at the
 * top right of the canvas for the whole slide.
 *
 * @param box - The box in viewport pixels, or `undefined`.
 * @param geometry - Where the canvas is.
 */
function composerPosition(
  box: DOMRect | undefined,
  geometry: CanvasGeometry,
): { left: number; top: number } {
  const anchor =
    box ?? new DOMRect(geometry.canvas.right - COMPOSER_WIDTH - GAP_PX, geometry.canvas.top, 0, 0);
  const maxLeft = window.innerWidth - COMPOSER_WIDTH - GAP_PX;
  const left = Math.max(GAP_PX, Math.min(anchor.left, maxLeft));
  const roomBelow = window.innerHeight - anchor.bottom;
  const top =
    roomBelow > COMPOSER_ROOM
      ? anchor.bottom + GAP_PX
      : Math.max(GAP_PX, anchor.top - COMPOSER_ROOM);
  return { left, top };
}
