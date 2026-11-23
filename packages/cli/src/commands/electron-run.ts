import { deckCommand } from '@deckster/engine/command';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { Console, Effect } from 'effect';

import { usageError } from '#cli-error.ts';
import { EXIT_FAILED, EXIT_OK, type Command } from '#command.ts';
import { printJson, withJsonErrors } from '#json-output.ts';
import { parseCommandArgs } from '#parse-command-args.ts';
import {
  electronInstallCommand,
  installElectron,
  readElectronStatus,
  type ElectronStatus,
} from '#present/electron-install.ts';
import { findElectronPackage } from '#present/shell-binary.ts';

/**
 * The subcommands, in the order the help lists them.
 */
const SUBCOMMANDS = ['install', 'update', 'status'] as const;

/**
 * One subcommand of `deckster electron`.
 */
type Subcommand = (typeof SUBCOMMANDS)[number];

/**
 * Runs `install`, `update` or `status` and succeeds with the exit code.
 */
export const run: Command['run'] = (argv): ReturnType<Command['run']> =>
  withJsonErrors(argv, runElectron(argv).pipe(Effect.provide(NodeServices.layer)));

/**
 * Whether a word names a subcommand.
 *
 * @param word - The first positional.
 */
function isSubcommand(word: string | undefined): word is Subcommand {
  return SUBCOMMANDS.some((name) => name === word);
}

/**
 * Parses the arguments and runs the subcommand.
 *
 * @param argv - The arguments after `electron`.
 */
const runElectron = Effect.fn('deck.electron')(function* (argv: readonly string[]) {
  const { values, positionals } = yield* parseCommandArgs('electron', argv, {
    force: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  });
  const [subcommand, ...extra] = positionals;
  if (!isSubcommand(subcommand) || extra.length > 0) {
    return yield* usageError(
      subcommand === undefined
        ? `Which electron command? One of: ${SUBCOMMANDS.join(', ')}.`
        : `Unknown electron command "${positionals.join(' ')}". One of: ${SUBCOMMANDS.join(', ')}.`,
      'electron',
    );
  }

  if (values.force && subcommand !== 'install') {
    return yield* usageError('--force goes with install only.', 'electron');
  }

  const directory = yield* findElectronPackage();
  if (subcommand === 'status') {
    const status = yield* readElectronStatus(directory);
    yield* values.json
      ? printJson({ ok: status.ready, downloaded: false, electron: status })
      : Console.log(describeStatus(status));
    return status.ready ? EXIT_OK : EXIT_FAILED;
  }

  const before = yield* readElectronStatus(directory);
  const force = values.force;
  if (!values.json && (force || !before.ready)) {
    // On stderr, so the line never mixes with output a script reads.
    yield* Console.error(
      `Downloading Electron ${before.version} for ${process.platform}-${process.arch} (about 120 MB)...`,
    );
  }

  const result = yield* installElectron(directory, force);
  if (values.json) {
    yield* printJson({ ok: true, downloaded: result.downloaded, electron: result.status });
  } else if (result.downloaded) {
    yield* Console.log(
      `Downloaded Electron ${result.status.version}.\n  ${result.status.executable ?? ''}`,
    );
  } else {
    yield* Console.log(
      `Electron ${result.status.version} is already downloaded` +
        (subcommand === 'update' ? ' and up to date.' : '.') +
        `\n  ${result.status.executable ?? ''}`,
    );
  }

  return EXIT_OK;
});

/**
 * The lines `status` prints: the version and path, or what is wrong and the command that fixes it.
 *
 * @param status - What is on disk.
 */
export function describeStatus(status: ElectronStatus): string {
  if (status.ready) {
    return `Electron ${status.version} is downloaded.\n  ${status.executable ?? ''}`;
  }

  if (status.downloadedVersion !== null && status.downloadedVersion !== status.version) {
    return (
      `Electron ${status.downloadedVersion} is downloaded, but this CLI needs ${status.version}.\n` +
      `Run \`${deckCommand()} electron update\`.`
    );
  }

  return (
    `Electron ${status.version} is not downloaded, so \`${deckCommand()} present\` cannot open a window.\n` +
    `Run \`${electronInstallCommand()}\` (about 120 MB).`
  );
}
