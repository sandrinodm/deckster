import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

import { processesWith } from '#session/sessions.fixture.ts';

/**
 * The host fixture.
 */
const HOST = fileURLToPath(new URL('./watchdog-host.fixture.ts', import.meta.url));

/**
 * How long the provider group may outlive a killed host, in milliseconds.
 */
const GRACE_MS = 2000;

/**
 * Polls until a condition holds or the time is up.
 *
 * @param condition - What to wait for.
 * @param ms - How long to wait.
 */
async function eventually(condition: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (condition()) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return condition();
}

describe('the watchdog', () => {
  it.each(['SIGKILL', 'SIGTERM', 'SIGINT', 'SIGHUP'] as const)(
    'kills the provider group and removes the token file when the host dies by %s',
    async (signal) => {
      const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'deck-watchdog-')));
      const file = path.join(root, 'server.json');
      const sessionId = `watchdog-${signal}-${process.pid}-${Date.now()}`;
      const host = spawn(process.execPath, [HOST, root, file, sessionId], {
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      try {
        await new Promise<void>((resolve, reject) => {
          host.stdout.on('data', (chunk: Buffer) => {
            if (chunk.toString().includes('started')) {
              resolve();
            }
          });
          host.once('exit', () => reject(new Error('the host exited early')));
        });
        const fake = `fake-agent\\.fixture\\.ts.*${sessionId}`;
        expect(processesWith(fake).length).toBe(1);
        expect(existsSync(file)).toBe(true);
        host.kill(signal);
        expect(await eventually(() => processesWith(fake).length === 0, GRACE_MS)).toBe(true);
        expect(await eventually(() => !existsSync(file), GRACE_MS)).toBe(true);
      } finally {
        host.kill('SIGKILL');
        rmSync(root, { recursive: true, force: true });
      }
    },
    20_000,
  );
});
