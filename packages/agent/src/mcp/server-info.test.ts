import { NodeFileSystem } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect, Exit, FileSystem, Scope } from 'effect';
import path from 'node:path';

import type { ServerInfo } from '#protocol/mcp-endpoint.ts';

import { makeToken, publishServerInfo, readServerInfo } from '#mcp/server-info.ts';
import { serverInfoFile } from '#protocol/mcp-endpoint.ts';

/**
 * A server file for a deck, owned by this very process so it counts as running.
 *
 * @param overrides - Fields to change.
 */
function info(overrides: Partial<ServerInfo> = {}): ServerInfo {
  return {
    deck: 'hello',
    port: 5621,
    origin: 'http://127.0.0.1:5621',
    mcpUrl: 'http://127.0.0.1:5621/__deck/mcp',
    token: makeToken(),
    pid: process.pid,
    startedAt: '2026-11-14T00:00:00.000Z',
    ...overrides,
  };
}

layer(NodeFileSystem.layer)('server.json lifecycle', (it) => {
  it.effect('is written with mode 0600, read back, and removed when the scope closes', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const scope = yield* Scope.make();
      const written = info();
      const file = yield* publishServerInfo(root, written).pipe(Scope.provide(scope));
      expect(file).toBe(serverInfoFile(root, 'hello'));
      expect(file).toBe(path.join(root, '.deck', 'agent', 'hello', 'server.json'));
      expect((yield* fs.stat(file)).mode & 0o777).toBe(0o600);
      expect(yield* readServerInfo(root, 'hello')).toEqual(written);

      yield* Scope.close(scope, Exit.void);
      expect(yield* fs.exists(file)).toBe(false);
      const missing = yield* Effect.flip(readServerInfo(root, 'hello'));
      expect(missing.message).toContain('pnpm deckster dev hello --mcp');
    }).pipe(Effect.scoped),
  );

  it.effect('says how to start a server when the file is stale or not a server file', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* publishServerInfo(root, info({ pid: 2 ** 22 + 12345 }));
      const stale = yield* Effect.flip(readServerInfo(root, 'hello'));
      expect(stale.message).toContain('not running any more');
      expect(stale.message).toContain('pnpm deckster dev hello --mcp');

      yield* fs.writeFileString(serverInfoFile(root, 'hello'), '{"hello":1}');
      const broken = yield* Effect.flip(readServerInfo(root, 'hello'));
      expect(broken.message).toContain('is not a server file');
    }).pipe(Effect.scoped),
  );

  it.effect('makes a different URL-safe token each time', () =>
    Effect.sync(() => {
      const first = makeToken();
      expect(first).toMatch(/^[\w-]{43}$/);
      expect(makeToken()).not.toBe(first);
    }),
  );
});
