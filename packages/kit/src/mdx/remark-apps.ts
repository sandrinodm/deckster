import { fileExists } from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { attributeValue, walk, type MdastNode } from '#mdx/mdast.ts';
import { runKitEffect } from '#mdx/node-runtime.ts';

/**
 * The parts of a vfile the plugin uses.
 */
export type AppsFile = {
  /**
   * Throws a build error that names the slide and line of `place`.
   */
  fail: (reason: string, place?: unknown, origin?: string) => never;
};

/**
 * Options of {@link remarkKitApps}.
 */
export type RemarkAppsOptions = {
  /**
   * The absolute folder of the deck being compiled.
   */
  deckDir: string;
};

/**
 * The folder inside a deck that holds one folder per mini app.
 */
const APPS_DIR = 'apps';

/**
 * The page every app folder has.
 */
const APP_ENTRY = 'index.html';

/**
 * A remark plugin that fails the build when an `<AppFrame app="name">` names an app the deck does
 * not have (no `decks/<deck>/apps/<name>/index.html`). The message lists the apps the deck has and
 * how to create the missing one. A name that is not a literal is left to `deck lint`, which reports
 * `app-missing` from the rendered page.
 *
 * @param options - The deck folder.
 */
export function remarkKitApps(
  options: RemarkAppsOptions,
): (tree: MdastNode, file: AppsFile) => Promise<void> {
  return async (tree, file) => {
    const frames: { node: MdastNode; name: string }[] = [];
    walk(tree, (node) => {
      const name = node.name === 'AppFrame' ? attributeValue(node, 'app') : undefined;
      if (typeof name === 'string') {
        frames.push({ node, name });
      }

      return false;
    });
    if (frames.length === 0) {
      return;
    }

    const apps = await runKitEffect(listApps(options.deckDir));
    const deck = path.basename(options.deckDir);
    for (const { node, name } of frames) {
      if (!apps.includes(name)) {
        file.fail(missingAppReason(deck, name, apps), node, 'deck:app-missing');
      }
    }
  };
}

/**
 * The build error for an app the deck does not have.
 *
 * @param deck - The deck folder name.
 * @param name - The app the slide names.
 * @param apps - The apps the deck has.
 */
export function missingAppReason(deck: string, name: string, apps: readonly string[]): string {
  const known = apps.length === 0 ? 'The deck has no apps yet.' : `Its apps: ${apps.join(', ')}.`;
  return (
    `<AppFrame app="${name}"> names an app that does not exist: there is no ` +
    `decks/${deck}/${APPS_DIR}/${name}/${APP_ENTRY}. ${known} Create it with ` +
    `\`${deckCommand()} new app ${deck} ${name}\`, or fix the name.`
  );
}

/**
 * The names of a deck's apps: the folders under `apps/` that have an `index.html`.
 *
 * @param deckDir - The absolute deck folder.
 */
const listApps = Effect.fn('listApps')(function* (
  deckDir: string,
): Effect.fn.Return<string[], never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const appsDir = path.join(deckDir, APPS_DIR);
  const names = yield* fs.readDirectory(appsDir).pipe(Effect.orElseSucceed(() => []));
  const present = yield* Effect.forEach(
    names,
    (name) => fileExists(path.join(appsDir, name, APP_ENTRY)),
    { concurrency: 'unbounded' },
  );
  return names.filter((_, index) => present[index]).sort();
});
