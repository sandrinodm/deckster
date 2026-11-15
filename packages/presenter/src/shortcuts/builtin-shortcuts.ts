import { registerShortcut } from '#shortcuts/shortcut-registry.ts';
import { toggleFullscreen } from '#tools/builtin-tools.ts';
import {
  closeTopOverlay,
  openOverview,
  setSidebarOpen,
  toggleBlackout,
  uiState,
  updateUi,
} from '#ui/ui-state.ts';
import { openPresenterWindow } from '#ui/window-kind.ts';

/**
 * The help group for moving through the deck.
 */
const NAVIGATION = 'Navigation';

/**
 * The help group for what happens on screen while presenting.
 */
const PRESENTING = 'Presenting';

/**
 * The help group for the panels around the slide.
 */
const PANELS = 'Panels';

/**
 * Registers the shortcuts the presenter tools provide, and lists the engine's navigation keys so
 * the help overlay shows them too. Registering again replaces each shortcut, so a hot reload is
 * safe.
 */
export function registerBuiltinShortcuts(): void {
  registerShortcut({
    id: 'navigation.next',
    keys: ['ArrowRight', 'ArrowDown', 'PageDown', ' '],
    label: 'Next step or slide',
    group: NAVIGATION,
  });
  registerShortcut({
    id: 'navigation.prev',
    keys: ['ArrowLeft', 'ArrowUp', 'PageUp'],
    label: 'Previous step or slide',
    group: NAVIGATION,
  });
  registerShortcut({
    id: 'navigation.ends',
    keys: ['Home', 'End'],
    label: 'First or last slide',
    group: NAVIGATION,
  });
  registerShortcut({
    id: 'navigation.goto',
    keys: ['g'],
    label: 'Go to slide: type its number, then Enter',
    group: NAVIGATION,
    run: () => updateUi({ gotoBuffer: '' }),
  });
  registerShortcut({
    id: 'presenting.fullscreen',
    keys: ['f'],
    label: 'Fullscreen',
    group: PRESENTING,
    run: toggleFullscreen,
  });
  registerShortcut({
    id: 'presenting.blackout',
    keys: ['b'],
    label: 'Black out the screen',
    group: PRESENTING,
    run: () => toggleBlackout('black'),
  });
  registerShortcut({
    id: 'presenting.whiteout',
    keys: ['w'],
    label: 'White out the screen',
    group: PRESENTING,
    run: () => toggleBlackout('white'),
  });
  registerShortcut({
    id: 'presenting.laser',
    keys: ['l'],
    label: 'Laser pointer',
    group: PRESENTING,
    run: () => updateUi({ laser: !uiState.get().laser, laserPoint: undefined }),
  });
  registerShortcut({
    id: 'panels.presenter',
    keys: ['p'],
    label: 'Open the presenter window',
    group: PANELS,
    window: 'audience',
    run: openPresenterWindow,
  });
  registerShortcut({
    id: 'panels.sidebar',
    keys: ['s'],
    label: 'Slide sidebar',
    group: PANELS,
    window: 'audience',
    run: () => setSidebarOpen(),
  });
  registerShortcut({
    id: 'panels.overview',
    keys: ['o'],
    label: 'Overview',
    group: PANELS,
    window: 'audience',
    run: ({ deck }) => {
      if (uiState.get().overviewOpen) {
        updateUi({ overviewOpen: false });
        return;
      }

      openOverview(deck.position.slide);
    },
  });
  registerShortcut({
    id: 'panels.help',
    keys: ['?'],
    label: 'This help',
    group: PANELS,
    run: () => updateUi({ helpOpen: !uiState.get().helpOpen }),
  });
  registerShortcut({
    id: 'panels.close',
    keys: ['Escape'],
    label: 'Close the open panel',
    group: PANELS,
    run: closeTopOverlay,
  });
}
