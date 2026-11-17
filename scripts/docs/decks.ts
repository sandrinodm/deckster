import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { DOCS_DECKS } from '#allowlist.ts';
import {
  elapsed,
  readOutDir,
  requireDocsBrands,
  runDeck,
  WORKSPACE_ROOT,
} from '#script-support.ts';

/**
 * A root-absolute `src` or `href` in a built page, which would break when the deck is served under
 * a sub-path such as `/decks/<deck>/`.
 */
const ROOT_ABSOLUTE_REFERENCE = /\b(?:src|href)="\/(?!\/)/;

await main();

/**
 * Builds each allowlisted deck with `deck build <deck>` and copies its `decks/<deck>/dist` to
 * `<out>/<deck>/`. `deck build --out` is not used because it replaces the whole destination and
 * writes a gallery `index.html`, which the docs site does not want. `--out` must be empty or not
 * exist yet: the site publishes the folder whole, so a deck an earlier run left there would stay
 * public after it left the allowlist. Refuses to start when an allowlisted deck renders with a
 * brand outside the allowlist. Exits with 1 when a build fails or a built page references a
 * root-absolute path; the other decks are still built.
 */
async function main(): Promise<void> {
  const start = performance.now();
  const out = readOutDir('decks.ts');
  await requireEmptyFolder(out);
  await requireDocsBrands();
  await mkdir(out, { recursive: true });
  const problems: string[] = [];
  for (const deck of DOCS_DECKS) {
    const problem = await buildDeck(out, deck);
    if (problem !== undefined) {
      problems.push(problem);
    }
  }

  console.log(
    `Built ${DOCS_DECKS.length - problems.length} deck(s) into ${out} in ${elapsed(start)}.`,
  );
  if (problems.length > 0) {
    console.error(`${problems.length} problem(s):\n${problems.join('\n')}`);
    process.exitCode = 1;
  }
}

/**
 * Fails unless a folder is empty or does not exist.
 *
 * @param folder - The output folder.
 * @throws Error naming the folder and what to do when it holds anything.
 */
async function requireEmptyFolder(folder: string): Promise<void> {
  const entries = await readdir(folder).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  });
  if (entries.length > 0) {
    throw new Error(
      `--out must be an empty or new folder, because the docs site publishes it whole and a deck ` +
        `an earlier run left there would stay public: ${folder} holds ${entries.length} ` +
        'entries. Remove it or pass another folder.',
    );
  }
}

/**
 * Builds one deck and copies its build into `<out>/<deck>/`. A failed build copies nothing, so a
 * stale `dist` never reaches the docs.
 *
 * @param out - The output folder.
 * @param deck - The deck folder name.
 * @returns A problem, or `undefined` when the deck was built and copied.
 */
async function buildDeck(out: string, deck: string): Promise<string | undefined> {
  const start = performance.now();
  const run = await runDeck(['build', deck]);
  if (run.code !== 0) {
    return `${deck}: deck build exited ${run.code}: ${run.stderr.trim()}`;
  }

  const target = path.join(out, deck);
  await cp(path.join(WORKSPACE_ROOT, 'decks', deck, 'dist'), target, { recursive: true });
  const html = await readFile(path.join(target, 'index.html'), 'utf8');
  if (ROOT_ABSOLUTE_REFERENCE.test(html)) {
    return `${deck}: index.html references a root-absolute path`;
  }

  console.log(`${deck}: built in ${elapsed(start)}`);
  return undefined;
}
