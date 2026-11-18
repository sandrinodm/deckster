import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { runCaptured } from '#cli.fixture.ts';

describe('deck brand add', () => {
  it.effect('needs exactly one source, and refuses --force on the other brand commands', () =>
    Effect.gen(function* () {
      const missing = yield* runCaptured(['brand', 'add', '--json']);
      expect(missing.code).toBe(1);
      expect(JSON.parse(missing.output)).toMatchObject({
        ok: false,
        error: { type: 'CliError', message: expect.stringContaining('Name one brand source') },
      });
      const extra = yield* runCaptured(['brand', 'add', 'gh:a/b', 'gh:c/d', '--json']);
      expect(extra.code).toBe(1);
      const forced = yield* runCaptured(['brand', 'default', '--force', '--json']);
      expect(forced.code).toBe(1);
    }),
  );

  it.effect('refuses a source with another protocol before running git', () =>
    Effect.gen(function* () {
      const run = yield* runCaptured(['brand', 'add', 'file:///etc//x', '--json']);
      expect(run.code).toBe(1);
      expect(JSON.parse(run.output)).toMatchObject({
        ok: false,
        error: { message: expect.stringContaining('only https:// and ssh://') },
      });
    }),
  );
});
