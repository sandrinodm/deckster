import { deckViteConfig, type DeckLocation } from '@deckster/vite-plugin';
import { Effect } from 'effect';
import path from 'node:path';
import { build } from 'vite-plus';

import type { CommandError, CommandServices } from '#command.ts';

import { ViteError } from '#cli-error.ts';
import { defaultExportOptions } from '#export/export-options.ts';
import { runExport } from '#export/run-export.ts';

/**
 * Builds one deck to `decks/<deck>/dist`, and with `withExports` also exports its PDF and PPTX
 * beside `index.html`.
 *
 * @param workspaceRoot - The workspace root.
 * @param deck - The deck to build.
 * @param withExports - Whether to write `<deck>.pdf` and `<deck>.pptx` into the build.
 * @throws ViteError in the error channel when the build fails; the export's own errors.
 */
export const buildDeck = Effect.fn('buildDeck')(function* (
  workspaceRoot: string,
  deck: DeckLocation,
  withExports: boolean,
): Effect.fn.Return<void, CommandError, CommandServices> {
  yield* Effect.tryPromise({
    try: () => build(deckViteConfig({ workspaceRoot, deck: deck.id })),
    catch: (cause) => new ViteError({ cause }),
  });
  if (withExports) {
    yield* runExport({ ...defaultExportOptions(deck.id), out: path.join(deck.dir, 'dist') });
  }
});
