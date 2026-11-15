// @vitest-environment happy-dom
import type { DeckShellApi } from '@deckster/shell/api';
import type { ShellDisplay } from '@deckster/shell/protocol';

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { shellFullscreen } from '#shell/deck-shell.ts';
import {
  click,
  find,
  press,
  renderPresenterDeck,
  type MountedPresenterDeck,
} from '#testing/presenter-deck.fixture.tsx';
import { registerBuiltinTools, toggleFullscreen } from '#tools/builtin-tools.ts';
import { listToolButtons } from '#tools/tool-registry.ts';
import { uiState } from '#ui/ui-state.ts';
import { openPresenterWindow } from '#ui/window-kind.ts';

const RECT = { x: 0, y: 0, width: 1920, height: 1080 };
const DISPLAYS: ShellDisplay[] = [
  { id: 7, label: 'Built-in', bounds: RECT, workArea: RECT, scaleFactor: 2, primary: true },
  {
    id: 9,
    label: '',
    bounds: { ...RECT, x: 1920 },
    workArea: RECT,
    scaleFactor: 1,
    primary: false,
  },
];

/**
 * A fake `window.deckShell` whose calls are spies.
 */
function fakeShellApi() {
  const listeners = new Set<(on: boolean) => void>();
  const api = {
    isShell: true,
    displays: vi.fn(() => Promise.resolve(DISPLAYS)),
    openPresenter: vi.fn((_displayId?: number) => Promise.resolve()),
    setFullscreen: vi.fn((_on: boolean) => Promise.resolve()),
    isFullscreen: vi.fn(() => Promise.resolve(false)),
    onFullscreenChange: vi.fn((listener: (on: boolean) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    moveToDisplay: vi.fn((_displayId: number) => Promise.resolve()),
  } satisfies DeckShellApi;
  return {
    api,
    emitFullscreen: (on: boolean) => {
      for (const listener of listeners) {
        listener(on);
      }
    },
  };
}

/**
 * The ids of the registered tool buttons.
 */
function toolIds(): string[] {
  return listToolButtons().map((button) => button.id);
}

let mounted: MountedPresenterDeck | undefined;

beforeEach(() => {
  shellFullscreen.set(false);
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  Reflect.deleteProperty(window, 'deckShell');
  registerBuiltinTools();
  vi.restoreAllMocks();
});

describe('inside the desktop shell', () => {
  it('asks the shell for the presenter window instead of opening a popup', () => {
    const { api } = fakeShellApi();
    window.deckShell = api;
    const open = vi.spyOn(window, 'open');
    openPresenterWindow();
    expect(api.openPresenter).toHaveBeenCalledWith();
    expect(open).not.toHaveBeenCalled();
  });

  it('opens the presenter popup as before without the shell', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    openPresenterWindow();
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0]?.[1]).toBe('deck-presenter');
  });

  it('goes fullscreen through the shell and follows its state', async () => {
    const { api, emitFullscreen } = fakeShellApi();
    window.deckShell = api;
    registerBuiltinTools();
    toggleFullscreen();
    expect(api.setFullscreen).toHaveBeenLastCalledWith(true);
    act(() => emitFullscreen(true));
    expect(shellFullscreen.get()).toBe(true);
    toggleFullscreen();
    expect(api.setFullscreen).toHaveBeenLastCalledWith(false);
  });

  it('shows the pressed state of the fullscreen button from the shell', () => {
    const { api, emitFullscreen } = fakeShellApi();
    window.deckShell = api;
    registerBuiltinTools();
    mounted = renderPresenterDeck('/#/1/0');
    expect(find('[data-tool="presenting.fullscreen"]').getAttribute('aria-pressed')).toBe('false');
    act(() => emitFullscreen(true));
    expect(find('[data-tool="presenting.fullscreen"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('adds a Displays entry only inside the shell', () => {
    expect(toolIds()).not.toContain('shell.displays');
    const { api } = fakeShellApi();
    window.deckShell = api;
    registerBuiltinTools();
    expect(toolIds()).toContain('shell.displays');
    Reflect.deleteProperty(window, 'deckShell');
    registerBuiltinTools();
    expect(toolIds()).not.toContain('shell.displays');
  });

  it('lists the displays and moves windows from the Displays panel', async () => {
    const { api } = fakeShellApi();
    window.deckShell = api;
    registerBuiltinTools();
    mounted = renderPresenterDeck('/#/1/0');
    click(find('[data-tool="shell.displays"]'));
    expect(uiState.get().displaysOpen).toBe(true);
    await act(async () => {
      await Promise.resolve();
    });
    const rows = [...document.querySelectorAll('.dp-display-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('0: Built-in (primary)');
    expect(rows[0]?.textContent).toContain('1920×1080');
    expect(rows[1]?.textContent).toContain('1: Display');
    const buttons = rows[1]?.querySelectorAll('button') ?? [];
    click(buttons[0] as Element);
    expect(api.moveToDisplay).toHaveBeenCalledWith(9);
    click(buttons[1] as Element);
    expect(api.openPresenter).toHaveBeenCalledWith(9);
    press('ArrowRight');
    expect(window.location.hash).toBe('#/1/0');
    press('Escape');
    expect(uiState.get().displaysOpen).toBe(false);
  });
});
