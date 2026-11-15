import { describe, expect, it } from 'vite-plus/test';

import { CONNECTING_STATE, reduceDeckMessage } from '#client/app-state.ts';
import { envelope, type DeckMessage } from '#protocol/messages.ts';

/**
 * A `step` message.
 *
 * @param step - The step.
 */
function stepMessage(step: number): DeckMessage {
  return envelope({ type: 'step', step });
}

describe('reduceDeckMessage', () => {
  it('connects on init and keeps the deck state it carries', () => {
    const init = envelope({
      type: 'init',
      brand: {
        name: 'nocturne',
        label: 'Nocturne',
        surface: 'inverse',
        scheme: 'dark',
        roles: {},
        background: '#000000',
        fonts: {},
        type: {},
        radius: {},
        stroke: {},
        space: {},
        shadow: {},
        data: { categorical: [], context: '#777777' },
      },
      cssVariables: {},
      fontFaces: '',
      scheme: 'dark',
      slide: { index: 4, id: 'agent' },
      step: 2,
      active: true,
      static: false,
    } as const);
    const state = reduceDeckMessage(CONNECTING_STATE, init);
    expect(state.status).toBe('connected');
    expect(state.scheme).toBe('dark');
    expect(state.slide).toEqual({ index: 4, id: 'agent' });
    expect(state.step).toBe(2);
    expect(state.active).toBe(true);
  });

  it('toggles activity and tracks steps', () => {
    const active = reduceDeckMessage(CONNECTING_STATE, envelope({ type: 'activate' }));
    expect(active.active).toBe(true);
    const stepped = reduceDeckMessage(active, stepMessage(3));
    expect(stepped.step).toBe(3);
    const paused = reduceDeckMessage(stepped, envelope({ type: 'deactivate' }));
    expect(paused.active).toBe(false);
    expect(paused.step).toBe(3);
  });

  it('returns the same object for a message that changes nothing', () => {
    const active = reduceDeckMessage(CONNECTING_STATE, envelope({ type: 'activate' }));
    expect(reduceDeckMessage(active, envelope({ type: 'activate' }))).toBe(active);
    expect(reduceDeckMessage(active, stepMessage(0))).toBe(active);
    expect(reduceDeckMessage(active, envelope({ type: 'static', static: false }))).toBe(active);
  });
});
