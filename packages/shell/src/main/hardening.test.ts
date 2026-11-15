import { describe, expect, it } from 'vite-plus/test';

import { installHardening, type HardeningTarget } from '#main/hardening.ts';

function fakeTarget() {
  const listeners = new Map<string, (error: unknown) => void>();
  const exits: number[] = [];
  const reports: string[] = [];
  const target: HardeningTarget = {
    dialog: { showErrorBox: () => reports.push('dialog shown') },
    app: { exit: (code) => exits.push(code) },
    process: { on: (event, listener) => listeners.set(event, listener) },
    report: (message) => reports.push(message),
  };
  return { target, listeners, exits, reports };
}

describe('hardening', () => {
  it('replaces the native error box with a no-op', () => {
    const { target, reports } = fakeTarget();
    installHardening(target);
    target.dialog.showErrorBox('title', 'content');
    expect(reports).toEqual([]);
  });

  it('exits with code 1 on an uncaught exception and on an unhandled rejection', () => {
    const { target, listeners, exits, reports } = fakeTarget();
    installHardening(target);
    listeners.get('uncaughtException')?.(new Error('boom'));
    listeners.get('unhandledRejection')?.('plain reason');
    expect(exits).toEqual([1, 1]);
    expect(reports[0]).toContain('boom');
    expect(reports[1]).toContain('plain reason');
  });
});
