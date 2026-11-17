import * as NodeServices from '@effect/platform-node/NodeServices';
import { afterAll, describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseCommandList, readCliReference, usageLines } from '#data/cli-reference.ts';

/**
 * The root help of the fake `deck`, laid out as the real one is.
 */
const ROOT_HELP = [
  'Usage: deck <command> [options]',
  '',
  'Commands:',
  '  lint     Check a deck',
  '  present  Open a deck in its own window',
  '',
  'Run `deck <command> --help` for the options of one command.',
].join('\n');

/**
 * The help of each fake command: `present` has a wrapped first form, `lint` two forms.
 */
const COMMAND_HELP: Readonly<Record<string, string>> = {
  lint: ['Usage: deck lint [deck] [--json]', '       deck lint --all', '', 'Checks a deck.'].join(
    '\n',
  ),
  present: [
    'Usage: deck present [deck] [--port <n>]',
    '                    [--agent-web]',
    '       deck present --list',
    '',
    'Opens a deck.',
  ].join('\n'),
};

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-cli-reference-'));

/**
 * A stand-in for `deck` that prints the texts above for `--help`, `--version` and `<command>
 * --help`, the way the CLI does (one `console.log` each), and exits with 2 otherwise.
 */
const fakeDeck = path.join(folder, 'fake-deck.mjs');
fs.writeFileSync(
  fakeDeck,
  [
    `const rootHelp = ${JSON.stringify(ROOT_HELP)};`,
    `const commandHelp = ${JSON.stringify(COMMAND_HELP)};`,
    'const [first, second] = process.argv.slice(2);',
    "if (first === '--help') console.log(rootHelp);",
    "else if (first === '--version') console.log('1.2.3');",
    "else if (second === '--help' && first in commandHelp) console.log(commandHelp[first]);",
    'else process.exit(2);',
  ].join('\n'),
);

afterAll(() => {
  fs.rmSync(folder, { recursive: true, force: true });
});

describe('readCliReference', () => {
  it.effect('reads each listed command with its summary, usage forms and whole help', () =>
    Effect.gen(function* () {
      const deck = { executable: process.execPath, prefix: [fakeDeck] };
      const cli = yield* readCliReference(deck, folder);
      expect(cli.version).toBe('1.2.3');
      expect(cli.commands).toEqual([
        {
          name: 'lint',
          summary: 'Check a deck',
          usage: ['deck lint [deck] [--json]', 'deck lint --all'],
          help: COMMAND_HELP['lint'],
        },
        {
          name: 'present',
          summary: 'Open a deck in its own window',
          usage: ['deck present [deck] [--port <n>] [--agent-web]', 'deck present --list'],
          help: COMMAND_HELP['present'],
        },
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('fails with the command line and its exit code when a run fails', () =>
    Effect.gen(function* () {
      const deck = { executable: process.execPath, prefix: [fakeDeck, 'unknown'] };
      const error = yield* Effect.flip(readCliReference(deck, folder));
      expect(error.message).toContain('`deck --help` exited with 2');
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe('parseCommandList', () => {
  it('lists the commands under Commands: up to the first empty line', () => {
    expect(parseCommandList(ROOT_HELP).map((command) => command.name)).toEqual(['lint', 'present']);
  });

  it('gives no command for a text without a command list', () => {
    expect(parseCommandList('Usage: deck <command>')).toEqual([]);
  });
});

describe('usageLines', () => {
  it('joins a wrapped form and starts a new one at each program name', () => {
    expect(usageLines(COMMAND_HELP['present'] ?? '')).toEqual([
      'deck present [deck] [--port <n>] [--agent-web]',
      'deck present --list',
    ]);
  });
});
