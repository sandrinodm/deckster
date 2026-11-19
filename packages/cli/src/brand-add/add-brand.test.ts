import { FRAMEWORK_ROOT } from '@deckster/brand/node';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { afterAll, beforeAll, describe, expect, it, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { execFileSync, fork, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { addBrand, type AddBrandRequest } from '#brand-add/add-brand.ts';
import { parseBrandSource } from '#brand-add/brand-source.ts';
import { NETWORK_PROTOCOLS } from '#brand-add/fetch-brand.ts';

/**
 * The address the tests name; a `url.<base>.insteadOf` rule sends it to the repository on disk, as
 * a user's git configuration may send an https address to SSH.
 */
const ADDRESS = 'https://example.test/acme/brand-kit.git';

/**
 * The address the CLI uses to exercise its normal SSH transport against the fixture.
 */
const SSH_ADDRESS = 'ssh://git@example.test/acme/brand-kit.git';

/**
 * The brand the test repository holds, copied from the framework.
 */
const BRAND = 'default';

/**
 * Workspace-relative path where each variant's layouts will be published.
 */
const LAYOUTS_FILE = `brands/${BRAND}/layouts.ts`;

/**
 * A variable Fontsource package that none of the scratch workspaces has installed by default.
 */
const TEST_FONT = '@fontsource-variable/deckster-import-fixture';

/**
 * A layout that fulfils the kit's split layout contract.
 */
const SPLIT_LAYOUT = {
  name: 'acme-split',
  label: 'Split page',
  description: 'Text next to a picture.',
  fallback: 'split',
  title: { box: [120, 80, 1680, 160] },
  regions: [
    { bind: { slot: 'body' }, kind: 'text', box: [120, 300, 720, 600] },
    { bind: { slot: 'media' }, kind: 'media', box: [920, 300, 880, 600] },
  ],
};

/**
 * The media region drawn as text, which the catalog reports as a warning.
 */
const TEXT_MEDIA_REGION = { bind: { slot: 'media' }, kind: 'text', box: [920, 300, 880, 600] };

/**
 * The protocols the tests allow: the network ones and `file`, for the repository on disk.
 */
const TEST_PROTOCOLS = [...NETWORK_PROTOCOLS, 'file'] as const;

/**
 * The environment variables the tests set for git, with the values to restore.
 */
const GIT_VARIABLES = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'] as const;

/**
 * The folders the tests made, removed after them.
 */
const made: string[] = [];

/**
 * The environment before the tests, restored after them.
 */
const saved = new Map(GIT_VARIABLES.map((name) => [name, process.env[name]]));

/**
 * The repository on disk.
 */
let remote = '';
let fixtureSsh = '';

/**
 * Runs git synchronously for the fixture, with a fixed identity.
 *
 * @param cwd - The folder to run in.
 * @param args - The arguments after `git`.
 */
function git(cwd: string, args: readonly string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args],
    { cwd, encoding: 'utf8' },
  );
}

/**
 * A new empty folder in the temp folder, by its real path.
 *
 * @param prefix - The start of its name.
 */
function scratch(prefix: string): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  made.push(dir);
  return dir;
}

/**
 * A workspace with an empty `decks/` and the framework's catalog.
 */
function workspace(): string {
  const root = scratch('deck-brand-add-ws-');
  fs.mkdirSync(path.join(root, 'decks'));
  fs.copyFileSync(
    path.join(FRAMEWORK_ROOT, 'pnpm-workspace.yaml'),
    path.join(root, 'pnpm-workspace.yaml'),
  );
  return root;
}

/**
 * Builds the repository: `brands/default` from the framework, plus files a brand never brings (a
 * helper module, a hidden file, a symbolic link) and a `code` brand whose `brand.ts` is not data.
 */
function makeRemote(): string {
  const repo = scratch('deck-brand-add-remote-');
  const brandDir = path.join(repo, 'brands', BRAND);
  fs.cpSync(path.join(FRAMEWORK_ROOT, 'brands', BRAND), brandDir, {
    recursive: true,
    filter: (source) => !source.includes('node_modules'),
  });
  fs.writeFileSync(path.join(brandDir, 'helper.ts'), 'export const x = 1;\n');
  fs.writeFileSync(path.join(brandDir, '.env'), 'TOKEN=secret\n');
  fs.writeFileSync(path.join(brandDir, 'logos', 'Package.JSON'), '{ "type": "commonjs" }\n');
  fs.symlinkSync('/etc/hosts', path.join(brandDir, 'logos', 'hosts.svg'));
  const codeDir = path.join(repo, 'brands', 'code');
  fs.mkdirSync(codeDir, { recursive: true });
  fs.writeFileSync(
    path.join(codeDir, 'brand.ts'),
    [
      "import { defineBrand } from '@deckster/brand';",
      "const name = 'code';",
      'export default defineBrand({ name });',
      '',
    ].join('\n'),
  );
  writeLayoutVariants(repo, brandDir);
  git(repo, ['init', '--quiet', '--initial-branch=main']);
  git(repo, ['config', 'uploadpack.allowFilter', 'true']);
  git(repo, ['config', 'uploadpack.allowAnySHA1InWant', 'true']);
  git(repo, ['add', '--all']);
  git(repo, ['commit', '--quiet', '--message', 'brands']);
  git(repo, ['tag', 'v1']);
  git(repo, ['tag', '--annotate', 'v2', '--message', 'v2']);
  return repo;
}

/**
 * Gives each fixture folder the same brand name so a broken import can replace a good one.
 */
function writeLayoutVariants(repo: string, brandDir: string): void {
  const variants = {
    'valid-layout': layoutModule(SPLIT_LAYOUT),
    'warn-layout': layoutModule({
      ...SPLIT_LAYOUT,
      regions: SPLIT_LAYOUT.regions.map((region) =>
        region.bind.slot === 'media' ? TEXT_MEDIA_REGION : region,
      ),
    }),
    'unknown-fallback': layoutModule({ ...SPLIT_LAYOUT, fallback: 'unknown-fallback' }),
    'unbound-slot': layoutModule({
      ...SPLIT_LAYOUT,
      regions: SPLIT_LAYOUT.regions.filter((region) => region.bind.slot !== 'media'),
    }),
    'invalid-layout': layoutModule({ ...SPLIT_LAYOUT, title: { box: [-120, 80, 1680, 160] } }),
    'code-layout': [
      `throw new Error('The layouts module was executed');`,
      layoutModule(SPLIT_LAYOUT),
    ].join('\n'),
  };
  const original = fs.readFileSync(path.join(brandDir, 'brand.ts'), 'utf8');
  const newFont = original.replace('@fontsource-variable/inter', TEST_FONT);
  for (const [name, layouts] of Object.entries(variants)) {
    const dir = path.join(repo, 'brands', name);
    fs.cpSync(path.join(brandDir, 'logos'), path.join(dir, 'logos'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'brand.ts'), newFont);
    fs.writeFileSync(path.join(dir, 'layouts.ts'), layouts);
  }

  const missingAsset = path.join(repo, 'brands', 'missing-asset');
  fs.cpSync(path.join(repo, 'brands', 'valid-layout'), missingAsset, { recursive: true });
  fs.rmSync(path.join(missingAsset, 'logos', 'mark.svg'));

  const missingFont = path.join(repo, 'brands', 'missing-font-file');
  fs.cpSync(path.join(repo, 'brands', 'valid-layout'), missingFont, { recursive: true });
  const withLocalFont = newFont.replace(
    "{ kind: 'fontsource', package: '@fontsource-variable/jetbrains-mono' }",
    "{ kind: 'files', files: [{ path: 'fonts/mono.woff2', weight: [100, 900] }] }",
  );
  fs.writeFileSync(path.join(missingFont, 'brand.ts'), withLocalFont);
}

/**
 * Writes a layout manifest in the same static syntax an imported module uses.
 */
function layoutModule(layout: object): string {
  return [
    "import { defineBrandLayouts } from '@deckster/brand';",
    `export default defineBrandLayouts(${JSON.stringify([layout])});`,
    '',
  ].join('\n');
}

/**
 * The request for a source in the test repository.
 *
 * @param source - The source after the address, such as `//brands/default#v1`.
 * @param options - Request fields to change.
 */
function request(source: string, options: Partial<AddBrandRequest> = {}): AddBrandRequest {
  return {
    source: Effect.runSync(parseBrandSource(`${ADDRESS}${source}`)),
    force: false,
    installed: false,
    protocols: TEST_PROTOCOLS,
    ...options,
  };
}

beforeAll(() => {
  remote = makeRemote();
  const gitDirectory = scratch('deck-brand-add-git-');
  const config = path.join(gitDirectory, 'gitconfig');
  fixtureSsh = path.join(gitDirectory, 'fixture-ssh');
  fs.writeFileSync(fixtureSsh, '#!/bin/sh\nexec git-upload-pack "$DECK_TEST_GIT_REMOTE"\n', {
    mode: 0o700,
  });
  fs.writeFileSync(config, `[url "file://${remote}"]\n\tinsteadOf = ${ADDRESS}\n`);
  process.env['GIT_CONFIG_GLOBAL'] = config;
  process.env['GIT_CONFIG_NOSYSTEM'] = '1';
});

afterAll(() => {
  for (const [name, value] of saved) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, name);
    } else {
      process.env[name] = value;
    }
  }

  for (const dir of made) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

layer(NodeServices.layer)('addBrand', (it) => {
  it.effect('copies the brand data and assets, and writes the package files of a checkout', () =>
    Effect.gen(function* () {
      const root = workspace();
      const added = yield* addBrand(root, request(`//brands/${BRAND}#v1`));
      const dir = path.join(root, 'brands', BRAND);
      expect(added).toMatchObject({
        brand: BRAND,
        dir: `brands/${BRAND}`,
        replaced: false,
        source: `${ADDRESS}//brands/${BRAND}#v1`,
      });
      expect(added.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(added.files).toContain('brand.ts');
      expect(added.written).toEqual(['package.json', 'tsconfig.json']);
      expect(added.skipped).toEqual(
        expect.arrayContaining([
          { path: '.env', reason: 'hidden' },
          { path: 'helper.ts', reason: 'code' },
          { path: 'logos/hosts.svg', reason: 'symlink' },
          { path: 'package.json', reason: 'package file' },
          { path: 'logos/Package.JSON', reason: 'package file' },
        ]),
      );
      expect(added.next).toEqual(['pnpm install', `pnpm deck brand check ${BRAND}`]);
      expect(fs.readFileSync(path.join(dir, 'brand.ts'), 'utf8')).toBe(
        fs.readFileSync(path.join(FRAMEWORK_ROOT, 'brands', BRAND, 'brand.ts'), 'utf8'),
      );
      for (const left of ['.env', 'helper.ts', 'logos/hosts.svg', 'logos/Package.JSON']) {
        expect(fs.existsSync(path.join(dir, left)), left).toBe(false);
      }

      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      expect(manifest).toMatchObject({
        name: `@deckster/brand-${BRAND}`,
        dependencies: { '@deckster/brand': 'workspace:*' },
      });
    }),
  );

  it.effect('writes no package files in a published CLI workspace', () =>
    Effect.gen(function* () {
      const root = workspace();
      const added = yield* addBrand(root, request(`//brands/${BRAND}`, { installed: true }));
      expect(added.written).toEqual([]);
      expect(added.next.at(-1)).toBe(`pnpm deck brand check ${BRAND}`);
      expect(fs.existsSync(path.join(root, 'brands', BRAND, 'package.json'))).toBe(false);
    }),
  );

  it.effect('publishes a layout that works with its kit fallback and lists fonts to install', () =>
    Effect.gen(function* () {
      const root = workspace();
      const added = yield* addBrand(root, request('//brands/valid-layout'));
      expect(added.files).toContain('layouts.ts');
      expect(fs.readFileSync(path.join(root, LAYOUTS_FILE), 'utf8')).toBe(
        layoutModule(SPLIT_LAYOUT),
      );
      expect(added.fonts).toContainEqual({ name: TEST_FONT, version: undefined, installed: false });
      expect(added.next).toEqual([
        'pnpm install',
        `pnpm --filter @deckster/brand-${BRAND} add ${TEST_FONT}`,
        `pnpm deck brand check ${BRAND}`,
      ]);
      const installed = yield* addBrand(
        workspace(),
        request('//brands/valid-layout', { installed: true }),
      );
      expect(installed.next[0]).toContain(TEST_FONT);
      expect(installed.next[0]).toMatch(/^npm install /u);
    }),
  );

  it.effect('returns layout warnings even when a Fontsource package needs to be installed', () =>
    Effect.gen(function* () {
      const added = yield* addBrand(workspace(), request('//brands/warn-layout'));
      expect(added.warnings).toContainEqual({
        file: LAYOUTS_FILE,
        path: 'layouts[0].regions[1]',
        message: expect.stringContaining('The text region binds "media"'),
        fix: expect.stringContaining('kind: "media"'),
      });
    }),
  );

  it.effect('rejects an unknown fallback even when Fontsource packages are missing', () =>
    Effect.gen(function* () {
      const root = workspace();
      const error = yield* Effect.flip(addBrand(root, request('//brands/unknown-fallback')));
      expect(error).toMatchObject({
        _tag: 'BrandError',
        source: LAYOUTS_FILE,
        problems: [
          { path: 'layouts[0].fallback', message: expect.stringContaining('unknown-fallback') },
        ],
      });
      expect(error.message).toContain(LAYOUTS_FILE);
      expect(fs.existsSync(path.join(root, 'brands', BRAND))).toBe(false);
    }),
  );

  it.effect(
    'leaves an existing brand intact when its forced replacement omits a required slot',
    () =>
      Effect.gen(function* () {
        const root = workspace();
        yield* addBrand(root, request('//brands/valid-layout'));
        const layouts = path.join(root, LAYOUTS_FILE);
        const previous = fs.readFileSync(layouts, 'utf8');
        const error = yield* Effect.flip(
          addBrand(root, request('//brands/unbound-slot', { force: true })),
        );
        expect(error.message).toContain('requires the slot "media"');
        expect(fs.readFileSync(layouts, 'utf8')).toBe(previous);
      }),
  );

  it.effect(
    'checks layout geometry and rejects a layout module that contains executable code',
    () =>
      Effect.gen(function* () {
        const root = workspace();
        const geometry = yield* Effect.flip(addBrand(root, request('//brands/invalid-layout')));
        expect(geometry).toMatchObject({ source: LAYOUTS_FILE });
        expect(geometry.message).toContain('layouts[0].title.box');
        const code = yield* Effect.flip(addBrand(root, request('//brands/code-layout')));
        expect(code).toMatchObject({ source: LAYOUTS_FILE });
        expect(code.message).toContain('is read as data without running it');
        expect(fs.existsSync(path.join(root, 'brands', BRAND))).toBe(false);
      }),
  );

  it.effect('rejects missing local assets alongside missing Fontsource packages', () =>
    Effect.gen(function* () {
      const root = workspace();
      const error = yield* Effect.flip(addBrand(root, request('//brands/missing-asset')));
      expect(error).toMatchObject({ source: `brands/${BRAND}/brand.ts` });
      expect(error.message).toContain('logos/mark.svg');
      expect(error.message).not.toContain('is not installed');
      expect(fs.existsSync(path.join(root, 'brands', BRAND))).toBe(false);

      const font = yield* Effect.flip(addBrand(root, request('//brands/missing-font-file')));
      expect(font).toMatchObject({ source: `brands/${BRAND}/brand.ts` });
      expect(font.message).toContain('fonts/mono.woff2');
      expect(fs.existsSync(path.join(root, 'brands', BRAND))).toBe(false);
    }),
  );

  it.effect('rejects a malformed Fontsource package found in the destination workspace', () =>
    Effect.gen(function* () {
      const root = workspace();
      const dir = path.join(root, 'node_modules', TEST_FONT);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: TEST_FONT }));
      const error = yield* Effect.flip(addBrand(root, request('//brands/valid-layout')));
      expect(error).toMatchObject({ source: `brands/${BRAND}/brand.ts` });
      expect(error.message).toContain('has no readable metadata.json and unicode.json');
      expect(fs.existsSync(path.join(root, 'brands', BRAND))).toBe(false);
    }),
  );

  it.effect('refuses to replace a brand without force, and replaces it with force', () =>
    Effect.gen(function* () {
      const root = workspace();
      yield* addBrand(root, request(`//brands/${BRAND}`));
      const marker = path.join(root, 'brands', BRAND, 'notes.md');
      fs.writeFileSync(marker, 'local\n');
      const refused = yield* Effect.flip(addBrand(root, request(`//brands/${BRAND}`)));
      expect(refused.message).toContain('Pass --force');
      expect(fs.existsSync(marker)).toBe(true);

      const replaced = yield* addBrand(root, request(`//brands/${BRAND}`, { force: true }));
      expect(replaced.replaced).toBe(true);
      expect(fs.existsSync(marker)).toBe(false);
    }),
  );

  it.effect('refuses a brand.ts that is code, and writes nothing', () =>
    Effect.gen(function* () {
      const root = workspace();
      const error = yield* Effect.flip(addBrand(root, request('//brands/code')));
      expect(error.message).toContain('is not plain data');
      expect(fs.existsSync(path.join(root, 'brands'))).toBe(false);
    }),
  );

  it.effect('reports the commit an annotated tag points at, not the tag', () =>
    Effect.gen(function* () {
      const root = workspace();
      const added = yield* addBrand(root, request(`//brands/${BRAND}#v2`));
      expect(added.commit).toBe(git(remote, ['rev-parse', 'HEAD']).trim());
    }),
  );

  it.effect('refuses a repository root that is not a brand folder', () =>
    Effect.gen(function* () {
      const root = workspace();
      const error = yield* Effect.flip(addBrand(root, request('')));
      expect(error.message).toContain('has no brand.ts');
    }),
  );

  it.effect('names a folder or ref the repository does not have', () =>
    Effect.gen(function* () {
      const root = workspace();
      const folder = yield* Effect.flip(addBrand(root, request('//brands/missing')));
      expect(folder.message).toContain('There is no folder "brands/missing"');
      const ref = yield* Effect.flip(addBrand(root, request(`//brands/${BRAND}#nope`)));
      expect(ref.message).toContain('has no branch or tag "nope"');
    }),
  );

  it.effect('lets git use the network protocols only, even through an insteadOf rule', () =>
    Effect.gen(function* () {
      const root = workspace();
      const error = yield* Effect.flip(
        addBrand(root, request(`//brands/${BRAND}`, { protocols: NETWORK_PROTOCOLS })),
      );
      expect(error.message).toContain(`git could not read ${ADDRESS}`);
      expect(fs.existsSync(path.join(root, 'brands'))).toBe(false);
    }),
  );
});

const CLI = fileURLToPath(new URL('../bin.ts', import.meta.url));
const INSTALL_FIXTURE = fileURLToPath(new URL('./brand-install.fixture.ts', import.meta.url));
const CHILD_TEST_TIMEOUT_MS = 60_000;
const CHILD_RUNTIME_MS = 25_000;

type CliExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

type BrandCli = {
  child: ChildProcess;
  exit: Promise<CliExit>;
};

describe('deck brand add publication', () => {
  it(
    'shows the layouts file in CLI warnings and validation errors',
    async () => {
      const warning = `${SSH_ADDRESS}//brands/warn-layout`;
      const invalid = `${SSH_ADDRESS}//brands/unknown-fallback`;
      const children = [
        startBrandCommand(workspace(), [warning, '--json']),
        startBrandCommand(workspace(), [warning]),
        startBrandCommand(workspace(), [invalid, '--json']),
        startBrandCommand(workspace(), [invalid]),
      ] as const;
      try {
        const [json, text, failedJson, failedText] = await Promise.all([
          children[0].exit,
          children[1].exit,
          children[2].exit,
          children[3].exit,
        ]);
        expect(json.code, json.stderr).toBe(0);
        expect(JSON.parse(json.stdout)).toMatchObject({
          ok: true,
          warnings: [
            expect.objectContaining({ file: LAYOUTS_FILE, path: 'layouts[0].regions[1]' }),
          ],
        });
        expect(text.code, text.stderr).toBe(0);
        expect(text.stdout).toContain(`warning ${LAYOUTS_FILE}: layouts[0].regions[1]`);

        expect(failedJson.code).toBe(1);
        expect(JSON.parse(failedJson.stdout)).toMatchObject({
          ok: false,
          error: {
            type: 'BrandError',
            file: LAYOUTS_FILE,
            problems: [expect.objectContaining({ path: 'layouts[0].fallback' })],
          },
        });
        expect(failedText.code).toBe(1);
        expect(failedText.stderr).toContain(`Invalid brand layouts in ${LAYOUTS_FILE}`);
      } finally {
        await stopBrandClis(children);
      }
    },
    CHILD_TEST_TIMEOUT_MS,
  );

  it.each([false, true])(
    'rechecks the target after a concurrent add with force=%s',
    async (force) => {
      const root = workspace();
      const first = startBrandCli(root, false, 'publish');
      const children = [first];
      try {
        await waitForCli(first, 'paused');
        const second = startBrandCli(root, force);
        children.push(second);
        await waitForCli(second, 'waiting');
        first.child.send('resume');

        const added = await first.exit;
        expect(added.code, added.stderr).toBe(0);
        expect(JSON.parse(added.stdout)).toMatchObject({ ok: true, replaced: false });
        const next = await second.exit;
        const replaced = { ok: true, replaced: true };
        const refused = {
          ok: false,
          error: { message: expect.stringContaining('Pass --force') },
        };
        expect(next.code, next.stderr).toBe(force ? 0 : 1);
        expect(JSON.parse(next.stdout)).toMatchObject(force ? replaced : refused);
      } finally {
        await stopBrandClis(children);
      }
    },
    CHILD_TEST_TIMEOUT_MS,
  );

  it.each([
    { point: 'publish', oldRemains: true },
    { point: 'retire', oldRemains: false },
  ] as const)(
    'recovers the right brand after SIGKILL at $point',
    async ({ point, oldRemains }) => {
      const root = workspace();
      const installed = path.join(root, 'brands', BRAND);
      fs.mkdirSync(installed, { recursive: true });
      const marker = path.join(installed, 'local.md');
      fs.writeFileSync(marker, 'keep this installed brand');
      const first = startBrandCli(root, true, point);
      const children = [first];
      try {
        await waitForCli(first, 'paused');
        const second = startBrandCli(root, false);
        children.push(second);
        await waitForCli(second, 'waiting');
        first.child.kill('SIGKILL');

        expect((await first.exit).signal).toBe('SIGKILL');
        const recovered = await second.exit;
        expect(recovered.code, recovered.stderr).toBe(1);
        expect(JSON.parse(recovered.stdout)).toMatchObject({
          ok: false,
          error: { message: expect.stringContaining('Pass --force') },
        });
        expect(fs.existsSync(marker)).toBe(oldRemains);
        expect(fs.existsSync(path.join(installed, 'brand.ts'))).toBe(!oldRemains);
        const transaction = path.join(root, 'brands', '.deck', 'brand-add', BRAND);
        expect(fs.readdirSync(transaction)).toEqual(['lock.sqlite']);
      } finally {
        await stopBrandClis(children);
      }
    },
    CHILD_TEST_TIMEOUT_MS,
  );
});

function startBrandCli(root: string, force: boolean, pauseAt = ''): BrandCli {
  const source = `${SSH_ADDRESS}//brands/${BRAND}#v1`;
  const args = [source, '--json'];
  if (force) {
    args.push('--force');
  }

  return startBrandCommand(root, args, pauseAt);
}

function startBrandCommand(root: string, args: readonly string[], pauseAt = ''): BrandCli {
  const child = fork(CLI, ['brand', 'add', ...args], {
    cwd: root,
    execArgv: ['--import', INSTALL_FIXTURE],
    silent: true,
    env: {
      ...process.env,
      DECK_ROOT: root,
      DECK_TEST_BRAND_PAUSE: pauseAt,
      DECK_TEST_BRAND_TARGET: path.join(root, 'brands', BRAND),
      DECK_TEST_GIT_REMOTE: remote,
      GIT_ALLOW_PROTOCOL: undefined,
      GIT_CONFIG_GLOBAL: os.devNull,
      GIT_SSH: fixtureSsh,
      GIT_SSH_COMMAND: undefined,
      GIT_SSH_VARIANT: 'ssh',
      TMPDIR: root,
    },
  });
  let stdout = '';
  let stderr = '';
  child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });
  const timeout = setTimeout(() => child.kill('SIGKILL'), CHILD_RUNTIME_MS);
  const exit = new Promise<CliExit>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr });
    });
  });
  return { child, exit };
}

async function waitForCli({ child, exit }: BrandCli, event: string): Promise<void> {
  let listener: ((message: unknown) => void) | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve) => {
        listener = (message) => {
          if (message === event) {
            resolve();
          }
        };
        child.on('message', listener);
      }),
      exit.then(({ code, signal, stdout, stderr }) => {
        throw new Error(`CLI exited with ${code ?? signal} before ${event}: ${stdout}\n${stderr}`);
      }),
    ]);
  } finally {
    if (listener !== undefined) {
      child.off('message', listener);
    }
  }
}

async function stopBrandClis(children: readonly BrandCli[]): Promise<void> {
  for (const { child } of children) {
    child.kill('SIGKILL');
  }

  await Promise.allSettled(children.map(({ exit }) => exit));
}
