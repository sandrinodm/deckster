import type { ReactNode } from 'react';

import type { CanvasGeometry } from '#overlay/element-target.ts';

import {
  cancelPick,
  setCommentMode,
  startDraft,
  updateComments,
  useCommentsState,
} from '#overlay/comments-state.ts';
import { targetLabel } from '#overlay/labels.ts';

/**
 * The space kept between the toolbar and the stage's sides, in viewport pixels.
 */
const SIDE_GAP_PX = 12;

/**
 * Props of {@link CommentToolbar}.
 */
type CommentToolbarProps = {
  /**
   * Where the stage is, so the toolbar centres on it rather than on the window (a docked panel or
   * the sidebar takes part of the window); `undefined` before it is measured.
   */
  geometry: CanvasGeometry | undefined;
};

/**
 * The bar at the top of the stage while comment mode is on: what to do, a button for a comment on
 * the whole slide, the panel toggle with the open count, and Done. It centres on the stage and
 * wraps onto more lines when the stage is narrow, so it never runs under the panel.
 */
export function CommentToolbar({ geometry }: CommentToolbarProps): ReactNode {
  const { pick } = useCommentsState();
  const style = toolbarStyle(geometry);
  if (pick !== undefined) {
    return <PickToolbar style={style} />;
  }

  return <ModeToolbar style={style} />;
}

/**
 * Where the toolbar goes: centred on the stage, no wider than the stage less a gap at each side.
 *
 * @param geometry - Where the stage is, or `undefined` before it is measured.
 */
function toolbarStyle(
  geometry: CanvasGeometry | undefined,
): { left: number; maxWidth: number } | undefined {
  const stage = geometry?.stage;
  if (stage === undefined) {
    return undefined;
  }

  return {
    left: stage.left + stage.width / 2,
    maxWidth: Math.max(0, stage.width - 2 * SIDE_GAP_PX),
  };
}

/**
 * Props of the toolbar's two variants.
 */
type ToolbarVariantProps = {
  /**
   * Where the toolbar goes, from {@link toolbarStyle}.
   */
  style: { left: number; maxWidth: number } | undefined;
};

/**
 * The bar shown while an element is being picked for another tool: its hint, and Cancel.
 *
 * @param props - Where the toolbar goes.
 */
function PickToolbar({ style }: ToolbarVariantProps): ReactNode {
  const { hover } = useCommentsState();
  return (
    <div
      className="dc-toolbar"
      data-deck-interactive=""
      data-pick=""
      role="toolbar"
      aria-label="Pick an element"
      style={style}>
      <span className="dc-toolbar-lead">
        <span className="dc-toolbar-dot" aria-hidden="true" />
        <span className="dc-toolbar-title">Pick an element for the agent</span>
      </span>
      <span className="dc-toolbar-hint">
        Click an element · Alt-click its parent · Tab to pick by keyboard
      </span>
      <span className="dc-toolbar-buttons">
        <button type="button" className="dp-button" title="Cancel (Esc)" onClick={cancelPick}>
          Cancel
        </button>
      </span>
      <span className="dc-sr-only" aria-live="polite">
        {hover === undefined ? '' : targetLabel(hover)}
      </span>
    </div>
  );
}

/**
 * The bar shown in comment mode: what to do, the whole-slide and panel buttons, and Done.
 *
 * @param props - Where the toolbar goes.
 */
function ModeToolbar({ style }: ToolbarVariantProps): ReactNode {
  const { answer, panelOpen, hover, draft } = useCommentsState();
  const open = answer?.counts.open ?? 0;
  return (
    <div
      className="dc-toolbar"
      data-deck-interactive=""
      role="toolbar"
      aria-label="Comment mode"
      style={style}>
      <span className="dc-toolbar-lead">
        <span className="dc-toolbar-dot" aria-hidden="true" />
        <span className="dc-toolbar-title">Commenting</span>
      </span>
      <span className="dc-toolbar-hint">
        Click an element · Alt-click its parent · drag a region · Tab to pick by keyboard
      </span>
      <span className="dc-toolbar-buttons">
        <button type="button" className="dp-button" onClick={() => startDraft({ kind: 'slide' })}>
          Whole slide
        </button>
        <button
          type="button"
          className="dp-button"
          aria-pressed={panelOpen}
          onClick={() => updateComments({ panelOpen: !panelOpen })}>
          Comments
          <span className="dp-chip" data-tone={open > 0 ? 'accent' : 'neutral'}>
            {open}
          </span>
        </button>
        <button
          type="button"
          className="dp-button"
          data-variant="primary"
          title="Leave comment mode (C or Esc)"
          onClick={() => setCommentMode(false)}>
          Done
        </button>
      </span>
      <span className="dc-sr-only" aria-live="polite">
        {hover === undefined || draft !== undefined ? '' : targetLabel(hover)}
      </span>
    </div>
  );
}
