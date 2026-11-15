import { describe, expect, it } from 'vite-plus/test';

import {
  activeCommand,
  MAX_TYPING_MS,
  planTerminal,
  typingMs,
  type TerminalItem,
} from '#code/terminal-script.ts';

const SESSION: TerminalItem[] = [
  { kind: 'out', text: 'Welcome' },
  { kind: 'cmd', text: 'pnpm test' },
  { kind: 'out', text: '64 passed' },
  { kind: 'cmd', text: 'pnpm build' },
  { kind: 'out', text: 'built' },
];

/**
 * The state of every line, as a string.
 *
 * @param active - The latest reached command.
 * @param typed - Characters typed of it, or `undefined` for complete.
 */
function states(active: number, typed?: number): string[] {
  return planTerminal(SESSION, active, typed).map((line) => line.state);
}

describe('planTerminal', () => {
  it('shows only leading output before the first command', () => {
    expect(states(-1)).toEqual(['shown', 'hidden', 'hidden', 'hidden', 'hidden']);
  });

  it('types the active command and holds its output back until it is complete', () => {
    const lines = planTerminal(SESSION, 0, 4);
    expect(lines[1]).toMatchObject({ state: 'typing', text: 'pnpm' });
    expect(lines[2]?.state).toBe('hidden');
  });

  it('shows a complete command with its output, and later commands hidden', () => {
    expect(states(0)).toEqual(['shown', 'shown', 'shown', 'hidden', 'hidden']);
  });

  it('shows everything up to the last command in static mode, where nothing is mid-typing', () => {
    expect(states(1)).toEqual(['shown', 'shown', 'shown', 'shown', 'shown']);
    expect(planTerminal(SESSION, 1, undefined).map((line) => line.text)).toEqual(
      SESSION.map((item) => item.text),
    );
  });

  it('treats a typed count past the command as complete', () => {
    expect(planTerminal(SESSION, 0, 99)[1]?.state).toBe('shown');
  });
});

describe('activeCommand', () => {
  it('is the latest command whose step has been reached, -1 for none', () => {
    expect(activeCommand([1, 2, 3], 0)).toBe(-1);
    expect(activeCommand([1, 2, 3], 2)).toBe(1);
    expect(activeCommand([1, 2, 3], 9)).toBe(2);
  });
});

describe('typingMs', () => {
  it('scales with the length and caps for long commands', () => {
    expect(typingMs(5)).toBeLessThan(typingMs(10));
    expect(typingMs(500)).toBe(MAX_TYPING_MS);
    expect(typingMs(0)).toBe(0);
  });
});
