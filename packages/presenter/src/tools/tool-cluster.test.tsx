// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import {
  click,
  find,
  renderPresenterDeck,
  type MountedPresenterDeck,
} from '#testing/presenter-deck.fixture.tsx';
import { registerToolButton } from '#tools/tool-registry.ts';
import { isInToolZone, revealToolsOnTap, toolReveals } from '#tools/tool-reveal.ts';
import { uiState } from '#ui/ui-state.ts';

/**
 * The deck under test, unmounted after each test.
 */
let mounted: MountedPresenterDeck | undefined;

/**
 * Removes the button a test registered.
 */
let unregister: (() => void) | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  unregister?.();
  unregister = undefined;
  toolReveals.set(undefined);
});

/**
 * The cluster's buttons by tool id.
 */
function toolIds(): (string | null)[] {
  return [...document.querySelectorAll('.dp-tool')].map((tool) => tool.getAttribute('data-tool'));
}

describe('ToolCluster', () => {
  it('offers the panels without keys, with plugin buttons after a divider', () => {
    let runs = 0;
    unregister = registerToolButton({
      id: 'test.thing',
      label: 'Thing',
      shortcut: 't',
      icon: ['M4 4h16'],
      run: () => {
        runs += 1;
      },
    });
    mounted = renderPresenterDeck('/#/1/0');
    expect(toolIds()).toEqual([
      'panels.sidebar',
      'panels.overview',
      'panels.presenter',
      'presenting.fullscreen',
      'panels.help',
      'test.thing',
    ]);
    expect(document.querySelectorAll('.dp-tools-divider')).toHaveLength(1);
    expect(find('[role="toolbar"]').hasAttribute('data-deck-interactive')).toBe(true);
    click(find('[data-tool="test.thing"]'));
    expect(runs).toBe(1);
  });

  it('opens panels and shows which are open', () => {
    mounted = renderPresenterDeck('/#/1/0');
    const sidebar = find('[data-tool="panels.sidebar"]');
    expect(sidebar.getAttribute('aria-pressed')).toBe('false');
    click(sidebar);
    expect(uiState.get().sidebarOpen).toBe(true);
    expect(find('[data-tool="panels.sidebar"]').getAttribute('aria-pressed')).toBe('true');
    click(find('[data-tool="panels.help"]'));
    expect(uiState.get().helpOpen).toBe(true);
  });

  it('shows on a tap in its corner, stays hidden until then, and fades when idle', () => {
    mounted = renderPresenterDeck('/#/1/0');
    expect(find('.dp-tools').dataset['visible']).toBe('false');
    const tap = new MouseEvent('click', { clientX: 20, clientY: window.innerHeight - 20 });
    Object.assign(tap, { pointerType: 'touch' });
    act(() => {
      expect(revealToolsOnTap(tap)).toBe(true);
    });
    expect(find('.dp-tools').dataset['visible']).toBe('true');
    const mouse = new MouseEvent('click', { clientX: 20, clientY: window.innerHeight - 20 });
    Object.assign(mouse, { pointerType: 'mouse' });
    expect(revealToolsOnTap(mouse)).toBe(false);
  });

  it('knows its corner', () => {
    expect(isInToolZone(10, 790, 800)).toBe(true);
    expect(isInToolZone(10, 100, 800)).toBe(false);
    expect(isInToolZone(900, 790, 800)).toBe(false);
  });

  it('is not drawn in the presenter window', () => {
    mounted = renderPresenterDeck('/?presenter#/1/0');
    expect(document.querySelector('.dp-tools')).toBeNull();
  });
});
