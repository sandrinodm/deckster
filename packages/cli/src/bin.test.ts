import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

import { WORKSPACE_ROOT } from '#workspace.ts';

/**
 * Room for pnpm to start the CLI and list the layouts.
 */
const RUN_TIMEOUT_MS = 60_000;

describe('pnpm deck', () => {
  it('runs the workspace bin, not a script, so nothing is printed before the output', () => {
    const manifest: unknown = JSON.parse(
      fs.readFileSync(path.join(WORKSPACE_ROOT, 'package.json'), 'utf8'),
    );
    // A root `deck` script would make pnpm echo `$ node …` before the output.
    expect(manifest).not.toHaveProperty(['scripts', 'deck']);
    expect(manifest).toHaveProperty(['devDependencies', '@deckster/cli'], 'workspace:*');
  });

  it(
    'prints --json output that parses as JSON',
    () => {
      const output = execFileSync('pnpm', ['deck', 'layouts', '--json'], {
        cwd: WORKSPACE_ROOT,
        encoding: 'utf8',
      });
      expect(output.trimStart().startsWith('{')).toBe(true);
      expect(JSON.parse(output)).toMatchObject({ deck: 'hello', layouts: expect.any(Array) });
    },
    RUN_TIMEOUT_MS,
  );
});
