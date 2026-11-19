import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The checkout containing the CLI entry and the fixture brand.
 */
const FRAMEWORK = path.resolve(import.meta.dirname, '../../../..');

/**
 * The text on the first deck’s opening slide.
 */
const FIRST_COVER = 'First deck opening';

/**
 * The text on the second deck’s opening slide.
 */
const SECOND_COVER = 'Second deck opening';

/**
 * The accent color on the test decks’ opening slides.
 */
const PAINT = '#d3ab18';

/**
 * The temporary workspaces and browser-facing URLs used by the chooser suite.
 */
export type ChooserWorkspace = {
  /**
   * The absolute temporary workspace directory.
   */
  readonly root: string;

  /**
   * The browser-facing chooser URL.
   */
  readonly url: string;

  /**
   * Rewrites the opening slide on disk, to drive Vite hot updates and refresh the cover.
   */
  readonly updateOpening: (deck: 'hello' | 'second', title: string) => Promise<void>;

  /**
   * Signals the real CLI and waits for it to exit.
   */
  readonly stop: () => Promise<void>;
};

/**
 * Starts the real CLI in a two-deck workspace; rejects if the chooser does not start.
 */
export async function startChooser(port: number): Promise<ChooserWorkspace> {
  const base = await realpath(await mkdtemp(path.join(tmpdir(), 'deck-chooser-test-')));
  await setUpWorkspace(base);

  const cli = path.join(FRAMEWORK, 'packages/cli/src/bin.ts');
  const child = spawn(process.execPath, [cli, 'dev', '--agent', 'fake', '--port', String(port)], {
    cwd: base,
    env: {
      ...process.env,
      DECK_ROOT: base,
      DECK: '',
      DECK_TEST_FAKE_AGENT: '1',
      DECK_FAKE_DELAY_MS: '100',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  let output = '';

  /**
   * Retains the CLI output for a useful startup failure.
   */
  const record = (chunk: Buffer) => {
    output += chunk.toString();
  };
  child.stdout.on('data', record);
  child.stderr.on('data', record);

  /**
   * Requests graceful shutdown so the web ports and the MCP publication close.
   */
  const stop = async () => {
    child.kill('SIGTERM');
    await exited;
  };

  const url = `http://127.0.0.1:${port}/__deck/chooser/`;
  try {
    await Promise.race([
      new Promise<void>((resolve) => {
        child.stdout.on('data', () => {
          if (output.includes(url)) {
            resolve();
          }
        });
      }),
      exited.then(() => {
        throw new Error(output);
      }),
    ]);
  } catch (error) {
    await rm(base, { recursive: true, force: true });
    throw error;
  }

  return {
    root: base,
    url,
    updateOpening: (deck, title) => writeOpening(base, deck, title),
    stop,
  };
}

/**
 * Copies a test brand and creates two independent decks in the temporary workspace.
 */
async function setUpWorkspace(root: string): Promise<void> {
  await symlink(path.join(FRAMEWORK, 'packages/cli/node_modules'), path.join(root, 'node_modules'));
  await mkdir(path.join(root, 'brands'));
  await cp(path.join(FRAMEWORK, 'brands/default'), path.join(root, 'brands/default'), {
    recursive: true,
    filter: (file) => path.basename(file) !== 'node_modules',
  });
  await Promise.all([
    makeDeck(root, 'hello', 'First deck', FIRST_COVER),
    makeDeck(root, 'second', 'Second deck', SECOND_COVER),
  ]);
}

/**
 * Writes a deck config with a hidden slide before the visible opening slide.
 */
async function makeDeck(root: string, id: string, title: string, opening: string): Promise<void> {
  const directory = path.join(root, 'decks', id);
  await mkdir(path.join(directory, 'slides'), { recursive: true });
  await writeFile(
    path.join(directory, 'deck.config.ts'),
    `export default { title: ${JSON.stringify(title)}, slides: ['hidden', 'opening'] };\n`,
  );
  await writeFile(
    path.join(directory, 'slides/hidden.mdx'),
    '---\nhidden: true\n---\n\n# Hidden slide\n',
  );
  await writeOpening(root, id, opening);
}

/**
 * Writes an opening slide with a build step that stays hidden at the initial position.
 */
async function writeOpening(root: string, id: string, title: string): Promise<void> {
  const body = [
    '---',
    'surface: inverse',
    '---',
    '',
    `# ${title}`,
    '',
    '<Step at={1}>Later content</Step>',
    '',
    `<div style={{ background: '${PAINT}', width: 160, height: 160 }} />`,
    '',
  ].join('\n');
  await writeFile(path.join(root, 'decks', id, 'slides/opening.mdx'), body);
}
