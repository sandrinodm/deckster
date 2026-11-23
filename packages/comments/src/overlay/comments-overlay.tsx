import { useDeck } from '@deckster/engine';
import { clearSlideBadges, setSlideBadges, windowKind, type SlideBadge } from '@deckster/presenter';
import { useEffect, type ReactNode } from 'react';

import type { AgentComment } from '#model/agent-comment.ts';
import type { FeedbackAnswer } from '#model/feedback-api.ts';

import { COMMENTS_CHANGED_EVENT } from '#model/feedback-api.ts';
import { CaptureLayer } from '#overlay/capture-layer.tsx';
import { CommentComposer } from '#overlay/comment-composer.tsx';
import { CommentPanel } from '#overlay/comment-panel.tsx';
import { commentBox, CommentPins } from '#overlay/comment-pins.tsx';
import { CommentToolbar } from '#overlay/comment-toolbar.tsx';
import {
  updateComments,
  useCommentsState,
  type CommentsState,
  type Draft,
} from '#overlay/comments-state.ts';
import { toViewportRect, type CanvasGeometry } from '#overlay/element-target.ts';
import { loadComments } from '#overlay/feedback-client.ts';
import { targetLabel } from '#overlay/labels.ts';
import { TargetOutline } from '#overlay/target-outline.tsx';
import { useGeometry } from '#overlay/use-geometry.ts';

/**
 * The badge source name the sidebar and overview show open-comment counts under.
 */
const BADGE_SOURCE = 'comments';

/**
 * How long an element flashes after a jump from the panel, in milliseconds.
 */
const FLASH_MS = 1600;

/**
 * Everything the comments plugin draws over the deck in dev. It draws nothing in static mode (`deck
 * shot`, `deckster lint`, export) or in the presenter window.
 */
export function CommentsOverlay(): ReactNode {
  const deck = useDeck();
  if (deck.isStatic || windowKind() === 'presenter') {
    return null;
  }

  return <CommentsUi />;
}

/**
 * The overlay proper: loads the comments, keeps the badges current and draws comment mode, the
 * pins, the composer and the panel.
 */
function CommentsUi(): ReactNode {
  const deck = useDeck();
  const state = useCommentsState();
  const active = state.mode || state.panelOpen;
  const { geometry } = useGeometry(active);
  useCommentsLoader();
  useCommentBadges(state.answer);
  useFlashTimeout(state.flashId);
  const slide = deck.manifest.slides[deck.position.slide];
  const onSlide = (state.answer?.comments ?? []).filter(
    (comment) =>
      comment.slide === slide?.id && comment.step <= deck.position.step && showsPin(comment, state),
  );
  const deckDir = state.answer?.deckDir ?? '';
  const draftBox = geometry === undefined ? undefined : boxOfDraft(state.draft, geometry);
  const flashed = onSlide.find((comment) => comment.id === state.flashId);
  const flashBox =
    geometry === undefined || flashed === undefined
      ? undefined
      : commentBox(flashed, deckDir, geometry);
  return (
    <div className="dp-ui dc-root" data-deck-interactive="">
      {state.mode && geometry !== undefined ? <CaptureLayer geometry={geometry} /> : null}
      {state.mode && state.hover !== undefined && state.draft === undefined ? (
        <TargetOutline
          box={state.hover.element.getBoundingClientRect()}
          label={targetLabel(state.hover)}
          tone="hover"
        />
      ) : null}
      {draftBox === undefined || state.draft === undefined ? null : (
        <DraftOutline draft={state.draft} box={draftBox} />
      )}
      {flashBox === undefined ? null : <TargetOutline box={flashBox} tone="flash" />}
      {active && geometry !== undefined ? (
        <CommentPins comments={onSlide} deckDir={deckDir} geometry={geometry} />
      ) : null}
      {state.mode ? <CommentToolbar geometry={geometry} /> : null}
      {state.draft === undefined || geometry === undefined ? null : (
        <CommentComposer draft={state.draft} box={draftBox} geometry={geometry} />
      )}
      {state.panelOpen ? <CommentPanel /> : null}
      {state.toast === undefined ? null : <output className="dc-toast">{state.toast}</output>}
    </div>
  );
}

/**
 * The outline of what the draft is about: the selected element with its label, or the region.
 *
 * @param props - The draft and its box in viewport pixels.
 */
function DraftOutline({ draft, box }: { draft: Draft; box: DOMRect }): ReactNode {
  if (draft.kind === 'element') {
    return <TargetOutline box={box} label={targetLabel(draft.target)} tone="selected" />;
  }

  return <TargetOutline box={box} tone={draft.kind === 'region' ? 'region' : 'selected'} />;
}

/**
 * Loads the comments once and again whenever the dev server says a feedback file changed.
 */
function useCommentsLoader(): void {
  useEffect(() => {
    void loadComments();
    /**
     * Loads the comments again after a feedback file changed.
     */
    const reload = () => void loadComments();
    import.meta.hot?.on(COMMENTS_CHANGED_EVENT, reload);
    return () => import.meta.hot?.off(COMMENTS_CHANGED_EVENT, reload);
  }, []);
}

/**
 * Shows each slide's open-comment count as a badge in the sidebar and the overview.
 *
 * @param answer - The comments, once loaded.
 */
function useCommentBadges(answer: FeedbackAnswer | undefined): void {
  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const comment of answer?.comments ?? []) {
      if (comment.status === 'open') {
        counts[comment.slide] = (counts[comment.slide] ?? 0) + 1;
      }
    }

    const badges: Record<string, SlideBadge[]> = {};
    for (const [slide, count] of Object.entries(counts)) {
      badges[slide] = [{ label: `${count}`, title: openTitle(count), tone: 'accent' }];
    }

    setSlideBadges(BADGE_SOURCE, badges);
  }, [answer]);
  useEffect(() => () => clearSlideBadges(BADGE_SOURCE), []);
}

/**
 * Stops the flash after a moment.
 *
 * @param flashId - The comment whose element flashes.
 */
function useFlashTimeout(flashId: string | undefined): void {
  useEffect(() => {
    if (flashId === undefined) {
      return undefined;
    }

    const timer = window.setTimeout(() => updateComments({ flashId: undefined }), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flashId]);
}

/**
 * Whether a comment on the slide gets a pin: open ones always, resolved ones while the panel lists
 * them.
 *
 * @param comment - The comment.
 * @param state - The overlay's state.
 */
function showsPin(comment: AgentComment, state: CommentsState): boolean {
  if (comment.status === 'open') {
    return state.status !== 'resolved' || !state.panelOpen;
  }

  return state.panelOpen && state.status !== 'open';
}

/**
 * The box of what a draft is about, in viewport pixels; `undefined` for the whole slide.
 *
 * @param draft - The draft.
 * @param geometry - Where the canvas is.
 */
function boxOfDraft(draft: Draft | undefined, geometry: CanvasGeometry): DOMRect | undefined {
  switch (draft?.kind) {
    case 'element':
      return draft.target.element.getBoundingClientRect();
    case 'region':
      return toViewportRect(draft.rect, geometry);
    case 'slide':
    case undefined:
      return undefined;
  }
}

/**
 * The badge tooltip for a count of open comments.
 *
 * @param count - The count.
 */
function openTitle(count: number): string {
  return `${count} open comment${count === 1 ? '' : 's'}`;
}
