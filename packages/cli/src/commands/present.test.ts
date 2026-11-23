import { FRAMEWORK_ROOT } from '@deckster/brand/node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Fiber } from 'effect';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { runCaptured } from '#cli.fixture.ts';
import { clampShellTitle, splitPresenterFlag } from '#commands/present-run.ts';
import { scratchWorkspace } from '#lint/scratch-workspace.fixture.ts';
import { fakeShell, testDisplay } from '#present/fake-shell.fixture.ts';

/**
 * Whether anything answers on a URL.
 *
 * @param url - The URL.
 */
async function answers(url: string): Promise<boolean> {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Polls until a condition holds, so a test can act once the command reached a point.
 *
 * @param condition - The condition.
 */
const until = Effect.fn('until')(function* (condition: () => boolean) {
  for (let attempt = 0; attempt < 400 && !condition(); attempt += 1) {
    yield* Effect.sleep('50 millis');
  }
});

describe('splitPresenterFlag', () => {
  it('lets --presenter stand alone or take a display', () => {
    expect(splitPresenterFlag(['hello', '--presenter'])).toEqual(['hello', '--presenter']);
    expect(splitPresenterFlag(['--presenter', '1', 'hello'])).toEqual([
      '--presenter',
      '--presenter-display=1',
      'hello',
    ]);
    expect(splitPresenterFlag(['--presenter=2'])).toEqual(['--presenter', '--presenter-display=2']);
    expect(splitPresenterFlag(['--presenter', 'hello'])).toEqual(['--presenter', 'hello']);
  });
});

describe('clampShellTitle', () => {
  it('keeps a title the shell accepts and cuts one of 201 characters to 200', () => {
    expect(clampShellTitle('Hello')).toBe('Hello');
    expect(clampShellTitle('x'.repeat(200))).toHaveLength(200);
    expect(clampShellTitle('x'.repeat(201))).toHaveLength(200);
  });

  it('never cuts an emoji in half', () => {
    const title = `${'x'.repeat(199)}🎉 and more`;
    expect(clampShellTitle(title)).toBe('x'.repeat(199));
  });
});

describe('deckster present', { timeout: 30_000 }, () => {
  it.live('lists displays as text and as JSON', () =>
    Effect.gen(function* () {
      const fake = fakeShell({ displays: [testDisplay(1, true), testDisplay(7, false)] });
      const text = yield* runCaptured(['present', '--list-displays'], { shell: fake.layer });
      expect(text.output).toContain('0: Display 1 1920x1080 @2x (primary)');
      expect(text.output).toContain('1: Display 7 1920x1080 @2x');
      const json = yield* runCaptured(['present', '--list-displays', '--json'], {
        shell: fake.layer,
      });
      const parsed = JSON.parse(json.output) as {
        ok: boolean;
        displays: { index: number; id: number }[];
      };
      expect(parsed.ok).toBe(true);
      expect(parsed.displays.map((display) => [display.index, display.id])).toEqual([
        [0, 1],
        [1, 7],
      ]);
      expect(fake.opened).toEqual([]);
      expect(fake.started).toEqual([]);
    }),
  );

  it.live('passes the placement flags to the shell and returns when the window closes', () =>
    Effect.gen(function* () {
      const fake = fakeShell({
        displays: [testDisplay(1, true), testDisplay(2, false)],
        closeImmediately: true,
      });
      const run = yield* runCaptured(
        ['present', 'hello', '--port', '5641', '--presenter', '--fullscreen'],
        { shell: fake.layer },
      );
      expect(run.code).toBe(0);
      const [opened] = fake.opened;
      expect(opened?.flags).toEqual({
        fullscreen: true,
        kiosk: false,
        display: undefined,
        presenter: true,
        presenterDisplay: undefined,
      });
      expect(opened?.url).toMatch(/^http:\/\/127\.0\.0\.1:5641\//);
      expect(opened?.title).toBe('Hello, deck');
      expect(opened?.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(opened?.stateFile).toMatch(/\.deck\/shell\/windows\.json$/);
      expect(opened?.stateKey).toBe('hello');
      expect(fake.started).toHaveLength(1);
      expect(fake.started[0]).not.toHaveProperty('url');
      expect(fake.quits.count).toBe(1);
      expect(run.output).toContain('Window open on display 1, presenter on display 0');
      expect(yield* Effect.promise(() => answers('http://127.0.0.1:5641/'))).toBe(false);
    }),
  );

  it.live('closes the window before the server when the window is closed', () =>
    Effect.gen(function* () {
      const seen: boolean[] = [];
      const fake = fakeShell({
        closeImmediately: true,
        onRelease: () =>
          Effect.promise(async () => {
            seen.push(await answers('http://127.0.0.1:5642/'));
          }),
      });
      yield* runCaptured(['present', 'hello', '--port', '5642'], { shell: fake.layer });
      expect(seen).toEqual([true]);
      expect(yield* Effect.promise(() => answers('http://127.0.0.1:5642/'))).toBe(false);
    }),
  );

  it.live('closes the window before the server on interrupt', () =>
    Effect.gen(function* () {
      const seen: boolean[] = [];
      const fake = fakeShell({
        onRelease: () =>
          Effect.promise(async () => {
            seen.push(await answers('http://127.0.0.1:5643/'));
          }),
      });
      const fiber = yield* Effect.forkChild(
        runCaptured(['present', 'hello', '--port', '5643'], { shell: fake.layer }),
      );
      yield* until(() => fake.opened.length > 0);
      yield* Effect.sleep('200 millis');
      yield* Fiber.interrupt(fiber);
      expect(seen).toEqual([true]);
      expect(yield* Effect.promise(() => answers('http://127.0.0.1:5643/'))).toBe(false);
    }),
  );

  it.live('fails with the shell timeout message and stops the server', () =>
    Effect.gen(function* () {
      const fake = fakeShell({ startTimesOut: true });
      const error = yield* Effect.flip(
        runCaptured(['present', 'hello', '--port', '5644'], { shell: fake.layer }),
      );
      expect(error.message).toContain('start-up timeout');
      expect(yield* Effect.promise(() => answers('http://127.0.0.1:5644/'))).toBe(false);
    }),
  );

  it.live(
    'names the fix for a missing binary before serving, and opens no browser on its own',
    () =>
      Effect.gen(function* () {
        const fake = fakeShell({ binaryMissing: true });
        const error = yield* Effect.flip(
          runCaptured(['present', 'hello', '--port', '5645'], { shell: fake.layer }),
        );
        expect(error.message).toContain('electron install');
        expect(error.message).toContain('--browser');
        expect(fake.started).toHaveLength(1);
        expect(fake.opened).toEqual([]);
        expect(fake.browserOpened).toEqual([]);
        expect(yield* Effect.promise(() => answers('http://127.0.0.1:5645/'))).toBe(false);
      }),
  );

  it.live('quits the shell and reports the original error when the deck is not found', () =>
    Effect.gen(function* () {
      const fake = fakeShell();
      const error = yield* Effect.flip(
        runCaptured(['present', 'no-such-deck', '--port', '5648'], { shell: fake.layer }),
      );
      expect(error.message).toContain('no-such-deck');
      expect(fake.started.map((options) => options.stateKey)).toEqual(['no-such-deck']);
      expect(fake.opened).toEqual([]);
      expect(fake.quits.count).toBe(1);
    }),
  );

  it.live('serves on a random 127.0.0.1 port and warns about a running dev server', () =>
    Effect.gen(function* () {
      const root = scratchWorkspace('deck-present-dev-running-');
      fs.cpSync(path.join(FRAMEWORK_ROOT, 'decks', 'hello'), path.join(root, 'decks', 'hello'), {
        recursive: true,
      });
      const records = path.join(root, '.deck', 'dev-servers');
      fs.mkdirSync(records, { recursive: true });
      fs.writeFileSync(
        path.join(records, `${process.ppid}.json`),
        JSON.stringify({ pid: process.ppid, url: 'http://127.0.0.1:5173/', deck: 'hello' }),
      );
      const fake = fakeShell({ closeImmediately: true });
      const run = yield* runCaptured(['present', 'hello'], { root, shell: fake.layer }).pipe(
        Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))),
      );
      expect(run.code).toBe(0);
      expect(run.output).toContain(
        `Warning: a dev server for "hello" is still running at http://127.0.0.1:5173/ (process ${process.ppid}).`,
      );
      const url = new URL(fake.opened[0]?.url ?? '');
      expect(url.hostname).toBe('127.0.0.1');
      expect(Number(url.port)).toBeGreaterThan(0);
      expect(url.port).not.toBe('5173');
    }),
  );

  it.live('quits the shell and reports the build error of a deck that does not load', () =>
    Effect.gen(function* () {
      const root = scratchWorkspace('deck-present-broken-');
      fs.mkdirSync(path.join(root, 'decks', 'broken', 'slides'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'decks', 'broken', 'deck.config.ts'),
        "import { defineDeck } from '@deckster/engine/config';\nexport default defineDeck({ title: 'Broken', slides: ['missing'] });\n",
      );
      const fake = fakeShell();
      const error = yield* Effect.flip(
        runCaptured(['present', 'broken', '--port', '5650'], { root, shell: fake.layer }),
      ).pipe(Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))));
      expect(error.message).toContain('missing');
      expect(fake.started).toHaveLength(1);
      expect(fake.opened).toEqual([]);
      expect(fake.quits.count).toBe(1);
    }),
  );

  it.live('quits the shell and reports the error when the port is taken', () =>
    Effect.gen(function* () {
      const fake = fakeShell();
      const blockers = ['127.0.0.1', '::1'].map(() => net.createServer());
      yield* Effect.promise(() =>
        Promise.all(
          blockers.map(
            (blocker, index) =>
              new Promise<void>((resolve) =>
                blocker.listen(5651, index === 0 ? '127.0.0.1' : '::1', resolve),
              ),
          ),
        ),
      );
      const error = yield* Effect.flip(
        runCaptured(['present', 'hello', '--port', '5651'], { shell: fake.layer }),
      ).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            for (const blocker of blockers) {
              blocker.close();
            }
          }),
        ),
      );
      expect(error._tag).toBe('ViteError');
      expect(String((error as { cause?: unknown }).cause)).toContain('5651');
      expect(fake.started).toHaveLength(1);
      expect(fake.opened).toEqual([]);
      expect(fake.quits.count).toBe(1);
    }),
  );

  it.live('quits the shell and stops the server when interrupted before the window opens', () =>
    Effect.gen(function* () {
      const fake = fakeShell({ holdOpen: true });
      const fiber = yield* Effect.forkChild(
        runCaptured(['present', 'hello', '--port', '5652'], { shell: fake.layer }),
      );
      yield* until(() => fake.opened.length > 0);
      yield* Fiber.interrupt(fiber);
      expect(fake.quits.count).toBe(1);
      expect(yield* Effect.promise(() => answers('http://127.0.0.1:5652/'))).toBe(false);
    }),
  );

  it.live('stops the server and quits the shell when it exits before the window opens', () =>
    Effect.gen(function* () {
      const fake = fakeShell({ exitsBeforeOpen: true });
      const error = yield* Effect.flip(
        runCaptured(['present', 'hello', '--port', '5649'], { shell: fake.layer }),
      );
      expect(error.message).toContain('exited with code 1');
      expect(fake.quits.count).toBe(1);
      expect(yield* Effect.promise(() => answers('http://127.0.0.1:5649/'))).toBe(false);
    }),
  );

  it.live('opens a browser instead of Electron with --browser, even without the binary', () =>
    Effect.gen(function* () {
      const fake = fakeShell({ binaryMissing: true });
      const fiber = yield* Effect.forkChild(
        runCaptured(['present', 'hello', '--port', '5646', '--browser'], { shell: fake.layer }),
      );
      yield* until(() => fake.browserOpened.length > 0);
      yield* Fiber.interrupt(fiber);
      expect(fake.browserOpened.map((opened) => opened.url)).toEqual([
        expect.stringMatching(/^http:\/\/127\.0\.0\.1:5646\//),
      ]);
      expect(fake.opened).toEqual([]);
      expect(fake.started).toEqual([]);
    }),
  );

  it.live('rejects flags that cannot work together or are malformed', () =>
    Effect.gen(function* () {
      const fake = fakeShell();
      const attempt = (...args: string[]) =>
        Effect.flip(runCaptured(['present', 'hello', ...args], { shell: fake.layer })).pipe(
          Effect.map((error) => error.message),
        );
      expect(yield* attempt('--display', 'x')).toContain('display index');
      expect(yield* attempt('--built', '--brand', 'default')).toContain('--built');
      expect(yield* attempt('--agent-panel', 'right')).toContain('need --agent');
      expect(yield* attempt('--browser', '--fullscreen')).toContain('--browser');
      expect(yield* attempt('--port', '0')).toContain('port number from 1 to 65535');
      expect(yield* attempt('--port', '99999999')).toContain('port number from 1 to 65535');
      expect(yield* attempt('--nope')).toContain('deckster present --help');
      const gemini = yield* attempt('--agent', 'gemini');
      expect(gemini).toContain('--agent must be claude or codex');
      expect(gemini).toContain('deckster present --help');
      expect(gemini).not.toContain('deckster dev');
      expect(fake.opened).toEqual([]);
      expect(fake.started).toEqual([]);
    }),
  );

  it.live('checks every flag with --list-displays and refuses the ones it ignores', () =>
    Effect.gen(function* () {
      const fake = fakeShell();
      const attempt = (...args: string[]) =>
        Effect.flip(
          runCaptured(['present', '--list-displays', ...args], { shell: fake.layer }),
        ).pipe(Effect.map((error) => error.message));
      expect(yield* attempt('--port', 'x')).toContain('port number');
      expect(yield* attempt('--brand', 'default')).toContain('leave out --brand');
      expect(yield* attempt('hello')).toContain('leave out hello');
      expect(yield* attempt('--agent', 'claude')).toContain('leave out --agent');
      expect(fake.started).toEqual([]);
    }),
  );

  it.live('reports a display index that does not exist before opening a window', () =>
    Effect.gen(function* () {
      const fake = fakeShell({ displays: [testDisplay(1, true)] });
      const error = yield* Effect.flip(
        runCaptured(['present', 'hello', '--port', '5647', '--display', '3'], {
          shell: fake.layer,
        }),
      );
      expect(error.message).toContain('--display 3 does not exist');
      expect(error.message).toContain('0: Display 1');
    }),
  );
});
