import { FRAMEWORK_ROOT } from '@deckster/brand/node';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

import { scratchWorkspace } from '#lint/scratch-workspace.fixture.ts';

/**
 * The CLI fixture.
 */
const FIXTURE = fileURLToPath(new URL('./dev-shutdown.fixture.ts', import.meta.url));

/**
 * The first port of the suite; each case takes the next.
 */
const FIRST_PORT = 5760;

/**
 * The port of the agent check case.
 */
const DOCTOR_PORT = 5390;

/**
 * How long the agent's processes and files may outlive the CLI, in milliseconds.
 */
const GRACE_MS = 2000;

/**
 * The fake agents running in a workspace.
 *
 * @param root - The workspace.
 */
function fakeAgents(root: string): string[] {
  try {
    return execFileSync('pgrep', ['-f', `fake-agent\\.fixture\\.ts.*`], { encoding: 'utf8' })
      .split('\n')
      .filter((pid) => pid.trim() !== '')
      .filter((pid) => {
        try {
          return execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], {
            encoding: 'utf8',
          }).includes(root);
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

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

/**
 * Waits until the CLI prints a line that contains a text.
 *
 * @param child - The CLI.
 * @param text - What to wait for.
 */
function printed(child: ChildProcess, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(text)) {
        resolve();
      }
    });
    child.once('exit', (code) => reject(new Error(`the CLI exited with ${code}: ${output}`)));
  });
}

/**
 * Opens the deck page like a browser (which sets the dev session cookie), connects to the agent
 * socket with it and starts a long fake turn; resolves once the turn streams.
 *
 * @param base - The server's URL.
 */
async function startLongTurn(base: string): Promise<WebSocket> {
  const page = await fetch(base, {
    headers: { 'sec-fetch-dest': 'document', 'sec-fetch-site': 'none' },
  });
  const cookie = (page.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  expect(cookie).toMatch(/^deck-session-\d+=/);
  const socket = new WebSocket(`${base.replace('http', 'ws')}__deck/agent`, {
    protocols: ['deck-agent.v1'],
    headers: { cookie },
  } as unknown as string[]);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', () => reject(new Error('the agent socket refused')));
  });
  const streaming = new Promise<void>((resolve) => {
    socket.addEventListener('message', (event) => {
      if (String(event.data).includes('"type":"text-delta"')) {
        resolve();
      }
    });
  });
  socket.send(
    JSON.stringify({ type: 'prompt', text: 'Long [fake:long]', slide: { id: 'title', step: 0 } }),
  );
  await streaming;
  return socket;
}

describe('deck dev --agent shutdown', () => {
  it.each([
    ['SIGINT', 0],
    ['SIGTERM', 1],
    ['SIGHUP', 2],
    ['SIGKILL', 3],
  ] as const)(
    'on %s leaves no agent process and no server.json behind',
    async (signal, index) => {
      const root = scratchWorkspace('deck-shutdown-');
      cpSync(path.join(FRAMEWORK_ROOT, 'decks/hello'), path.join(root, 'decks/hello'), {
        recursive: true,
        filter: (source) => !/[/\\](?:node_modules|dist)$/.test(source),
      });
      const port = FIRST_PORT + index;
      const cli = spawn(process.execPath, [FIXTURE, root, String(port)], {
        cwd: path.join(FRAMEWORK_ROOT, 'packages/cli'),
        stdio: ['ignore', 'pipe', 'inherit'],
        env: { ...process.env, DECK_TEST_FAKE_AGENT: '1', DECK_FAKE_DELAY_MS: '200' },
      });
      const serverJson = path.join(root, '.deck/agent/hello/server.json');
      try {
        await printed(cli, 'MCP:');
        expect(existsSync(serverJson)).toBe(true);
        const socket = await startLongTurn(`http://127.0.0.1:${port}/`);
        expect(fakeAgents(root).length).toBe(1);
        const exited = new Promise((resolve) => cli.once('exit', resolve));
        cli.kill(signal);
        socket.close();
        expect(await eventually(() => fakeAgents(root).length === 0, GRACE_MS)).toBe(true);
        expect(await eventually(() => !existsSync(serverJson), GRACE_MS)).toBe(true);
        await exited;
      } finally {
        cli.kill('SIGKILL');
        rmSync(root, { recursive: true, force: true });
      }
    },
    60_000,
  );

  it('prints the agent check after the server is listening, without holding the server up', async () => {
    const root = scratchWorkspace('deck-doctor-');
    cpSync(path.join(FRAMEWORK_ROOT, 'decks/hello'), path.join(root, 'decks/hello'), {
      recursive: true,
      filter: (source) => !/[/\\](?:node_modules|dist)$/.test(source),
    });
    const cli = spawn(process.execPath, [FIXTURE, root, String(DOCTOR_PORT)], {
      cwd: path.join(FRAMEWORK_ROOT, 'packages/cli'),
      stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, DECK_TEST_FAKE_AGENT: '1' },
    });
    try {
      await expect(printed(cli, 'Agent:')).resolves.toBeUndefined();
    } finally {
      cli.kill('SIGKILL');
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
