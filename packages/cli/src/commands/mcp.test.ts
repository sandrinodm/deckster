import { publishServerInfo } from '@deckster/agent/server-info';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';

import { runCaptured } from '#cli.fixture.ts';

/**
 * Publishes a server file for a deck in a scratch workspace owned by this process, runs the body
 * and removes the file when it ends.
 *
 * @param body - Receives the workspace root.
 */
const withServer = <A, E, R>(body: (root: string) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped();
    yield* publishServerInfo(root, {
      deck: 'hello',
      port: 5621,
      origin: 'http://127.0.0.1:5621',
      mcpUrl: 'http://127.0.0.1:5621/__deck/mcp',
      token: 'secret-token',
      pid: process.pid,
      startedAt: '2026-11-14T00:00:00.000Z',
    });
    return yield* body(root);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

describe('deck mcp', () => {
  it.effect('prints the Claude Code and Codex configuration of a running server', () =>
    withServer((root) =>
      Effect.gen(function* () {
        const { code, output } = yield* runCaptured(['mcp', 'hello'], { root });
        expect(code).toBe(0);
        expect(output).toContain("export DECK_MCP_TOKEN='secret-token'");
        expect(output).toContain('"url": "http://127.0.0.1:5621/__deck/mcp"');
        expect(output).toContain('"Authorization": "Bearer ${DECK_MCP_TOKEN}"');
        expect(output).toContain(
          "claude mcp add --transport http deck http://127.0.0.1:5621/__deck/mcp --header 'Authorization: Bearer secret-token'",
        );
        expect(output).toContain('[mcp_servers.deck]');
        expect(output).toContain('bearer_token_env_var = "DECK_MCP_TOKEN"');
        expect(output).toContain(
          'codex mcp add deck --url http://127.0.0.1:5621/__deck/mcp --bearer-token-env-var DECK_MCP_TOKEN',
        );
      }),
    ),
  );

  it.effect('prints the same as JSON', () =>
    withServer((root) =>
      Effect.gen(function* () {
        const { output } = yield* runCaptured(['mcp', 'hello', '--json'], { root });
        expect(JSON.parse(output)).toMatchObject({
          deck: 'hello',
          url: 'http://127.0.0.1:5621/__deck/mcp',
          tokenEnvVar: 'DECK_MCP_TOKEN',
          token: 'secret-token',
          claude: {
            mcpJson: {
              mcpServers: {
                deck: {
                  type: 'http',
                  url: 'http://127.0.0.1:5621/__deck/mcp',
                  headers: { Authorization: 'Bearer ${DECK_MCP_TOKEN}' },
                },
              },
            },
          },
          codex: {
            configToml:
              '[mcp_servers.deck]\nurl = "http://127.0.0.1:5621/__deck/mcp"\nbearer_token_env_var = "DECK_MCP_TOKEN"',
          },
        });
      }),
    ),
  );

  it.effect('says how to start a server when none runs, as text and as JSON', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const failure = yield* Effect.flip(runCaptured(['mcp', 'hello'], { root }));
      expect(failure).toMatchObject({ _tag: 'CliError' });
      expect(String((failure as { message: string }).message)).toContain(
        'pnpm deck dev hello --mcp',
      );
      const { code, output } = yield* runCaptured(['mcp', 'hello', '--json'], { root });
      expect(code).toBe(1);
      expect(JSON.parse(output)).toMatchObject({
        ok: false,
        error: { type: 'CliError', message: expect.stringContaining('pnpm deck dev hello --mcp') },
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('refuses a deck name that is a path, from the argument or from DECK', () =>
    withServer((root) =>
      Effect.gen(function* () {
        const failure = yield* Effect.flip(runCaptured(['mcp', '../agent/hello'], { root }));
        expect(failure).toMatchObject({ _tag: 'CliError' });
        expect(String((failure as { message: string }).message)).toContain(
          '"../agent/hello" is not a deck name',
        );
        const json = yield* runCaptured(['mcp', '../agent/hello', '--json'], { root });
        expect(json.code).toBe(1);
        expect(json.output).not.toContain('secret-token');
        const previous = process.env['DECK'];
        process.env['DECK'] = '../agent/hello';
        const fromEnv = yield* Effect.flip(runCaptured(['mcp'], { root })).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              if (previous === undefined) {
                delete process.env['DECK'];
              } else {
                process.env['DECK'] = previous;
              }
            }),
          ),
        );
        expect(String((fromEnv as { message: string }).message)).toContain('is not a deck name');
      }),
    ),
  );

  it.effect('lists itself in the root help', () =>
    Effect.gen(function* () {
      const { output } = yield* runCaptured([]);
      expect(output).toContain('mcp');
      const { output: help } = yield* runCaptured(['mcp', '--help']);
      expect(help).toContain('Usage: deck mcp [deck] [--json]');
    }),
  );
});
