import { definePlugin } from '@deckster/engine';
import { registerShortcut, registerToolButton } from '@deckster/presenter';

import { handleCommentKey } from '#overlay/comment-keys.ts';
import { CommentsOverlay } from '#overlay/comments-overlay.tsx';
import { CommentsStage } from '#overlay/comments-stage.tsx';
import { setCommentMode, useCommentsState } from '#overlay/comments-state.ts';
import '@deckster/presenter/tokens.css';

import '#styles/comments.css';

/**
 * A speech bubble with two lines of text, the comment-mode icon in a 24x24 box.
 */
const COMMENT_ICON = [
  'M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z',
  'M9 10h6',
  'M9 14h4',
] as const;

registerShortcut({
  id: 'comments.mode',
  keys: ['c'],
  label: 'Comment mode: click an element to comment on it',
  group: 'Comments',
  window: 'audience',
  run: () => setCommentMode(),
});

registerToolButton({
  id: 'comments.mode',
  label: 'Comment mode',
  shortcut: 'c',
  icon: COMMENT_ICON,
  order: 100,
  run: () => setCommentMode(),
  usePressed: () => useCommentsState().mode,
});

/**
 * Comments and feedback, loaded into every deck by `@deckster/vite-plugin` while it serves, never
 * in a build. `c` (or the speech bubble in the tool cluster) toggles comment mode: hover highlights
 * the element under the pointer with its source location, a click selects it (Alt-click or the
 * arrow keys walk to its parent or child), Tab picks elements by keyboard and Enter selects, a drag
 * selects a region, and a popover takes the comment (Cmd or Ctrl+Enter saves; Escape closes it and
 * keeps the draft). Comments show as numbered pins on their slide and step and in a docked panel,
 * where they are edited, resolved, reopened, deleted or copied for an agent; the sidebar and
 * overview badge each slide's open count. Comments are saved through the dev server to
 * `decks/<deck>/.feedback/<slide-id>.json`. It draws nothing in `?static` mode or in the presenter
 * window.
 */
export default definePlugin({
  name: '@deckster/comments',
  stage: CommentsStage,
  overlay: CommentsOverlay,
  onKeyDown: handleCommentKey,
});
