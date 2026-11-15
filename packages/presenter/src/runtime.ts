import { definePlugin } from '@deckster/engine';

import { registerBuiltinShortcuts } from '#shortcuts/builtin-shortcuts.ts';
import { handleKey } from '#shortcuts/handle-key.ts';
import { PresenterStage } from '#stage/presenter-stage.tsx';
import { registerBuiltinTools } from '#tools/builtin-tools.ts';
import { handlePointer } from '#ui/handle-pointer.ts';
import { PresenterOverlay } from '#ui/presenter-overlay.tsx';
import '#styles/tokens.css';
import '#styles/sidebar.css';
import '#styles/overview.css';
import '#styles/panels.css';
import '#styles/presenter.css';
import '#styles/tools.css';

registerBuiltinShortcuts();
registerBuiltinTools();

/**
 * The presenter tools, loaded into every deck by `@deckster/vite-plugin` after the kit: the slide
 * sidebar, the overview, the presenter window, blackout, go-to, the laser pointer, swipe, the
 * shortcut help and the tool cluster that reaches them without keys. Other plugins add shortcuts
 * with `registerShortcut`, cluster buttons with `registerToolButton` and slide badges with
 * `setSlideBadges`, all from `@deckster/presenter`. In `?static` mode it renders nothing.
 */
export default definePlugin({
  name: '@deckster/presenter',
  stage: PresenterStage,
  overlay: PresenterOverlay,
  onKeyDown: handleKey,
  onPointer: handlePointer,
});
