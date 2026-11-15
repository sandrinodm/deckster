import { describe, expect, it } from 'vite-plus/test';

import { createPowerGuard } from '#main/power.ts';
import { createQuitGate, QUIT_CONFIRM_MS } from '#main/quit-gate.ts';

describe('the power guard', () => {
  it('blocks display sleep only while a window is fullscreen', () => {
    const calls: string[] = [];
    const guard = createPowerGuard({
      start: () => {
        calls.push('start');
        return 7;
      },
      stop: (id) => calls.push(`stop ${id}`),
    });
    guard.update(true);
    guard.update(true);
    guard.update(false);
    guard.update(false);
    guard.update(true);
    guard.release();
    guard.release();
    expect(calls).toEqual(['start', 'stop 7', 'start', 'stop 7']);
  });
});

describe('the kiosk quit gate', () => {
  it('needs two presses within the window', () => {
    const gate = createQuitGate();
    expect(gate.press(0)).toBe(false);
    expect(gate.press(500)).toBe(true);
  });

  it('forgets a first press that is too old', () => {
    const gate = createQuitGate();
    expect(gate.press(0)).toBe(false);
    expect(gate.press(QUIT_CONFIRM_MS + 1)).toBe(false);
    expect(gate.press(QUIT_CONFIRM_MS + 100)).toBe(true);
  });
});
