import type { Plugin } from 'vite';

import { realpathSync } from 'node:fs';
import path from 'node:path';

/**
 * The message a module under the workspace's `.deck/` folder fails to load with.
 *
 * @param file - The module.
 */
export function deckStateMessage(file: string): string {
  return (
    `${file} is in the workspace's .deck/ folder (the agent's working copies, journal, tokens and ` +
    'screenshots), which slides may not import. Import files from the deck folder instead.'
  );
}

/**
 * The workspace's `.deck/` folder, as written and as its real path, each with a trailing separator
 * and in lower case.
 *
 * @param workspaceRoot - The absolute workspace root.
 */
function stateFolders(workspaceRoot: string): readonly string[] {
  const written = path.join(workspaceRoot, '.deck');
  let real = written;
  try {
    real = path.join(realpathSync(workspaceRoot), '.deck');
  } catch {
    // A workspace that cannot be resolved keeps the written path only.
  }

  return [...new Set([written, real])].map((folder) => `${folder}${path.sep}`.toLowerCase());
}

/**
 * The ways a module path is compared with the `.deck/` folder, in lower case: as written, and as
 * its real path when it exists. A case-insensitive file system (macOS, Windows) opens `.DECK/` as
 * `.deck/`, and a link elsewhere can point into it, so neither the spelling nor the place it is
 * reached from may decide.
 *
 * @param file - The module's path, without a query.
 */
function comparedPaths(file: string): readonly string[] {
  const paths = [file];
  try {
    paths.push(realpathSync.native(file));
  } catch {
    // A module that does not exist on disk is compared as written.
  }

  return paths.map((candidate) => candidate.toLowerCase());
}

/**
 * Refuses to load any module from the workspace's `.deck/` folder, in the dev server and in a
 * build: an agent turn's working copy lives there (as do the MCP token and the journal), and its
 * files reach the deck only through the framework's sync, never through an import. The path is
 * compared in lower case and by its real path, so `.DECK/` on a case-insensitive file system or a
 * link into `.deck/` is refused too; Vite's `server.fs.deny` does not cover a stylesheet a module
 * imports, so this hook is what keeps one out. The dev server also never serves `.deck/` otherwise
 * (`server.fs.deny`) and does not watch it.
 *
 * @param workspaceRoot - The absolute workspace root.
 */
export function deckStateGuardPlugin(workspaceRoot: string): Plugin {
  const folders = stateFolders(workspaceRoot);
  return {
    name: 'deck:state-guard',
    enforce: 'pre',

    load(id) {
      const file = id.split('?')[0] ?? id;
      if (
        comparedPaths(file).some((candidate) =>
          folders.some((folder) => candidate.startsWith(folder)),
        )
      ) {
        this.error(deckStateMessage(file));
      }

      return null;
    },
  };
}
