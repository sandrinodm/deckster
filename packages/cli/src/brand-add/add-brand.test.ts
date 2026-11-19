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
import { NETWORK_PROTOCOLS } from '#brand-add/fetch-brand.ts';

/**
 * The address the tests name; a `url.<base>.insteadOf` rule sends it to the repository on disk, as
 * a user's git configuration may send an https address to SSH.
 */
const ADDRESS = 'https://example.test/acme/brand-kit.git';
const SSH_ADDRESS = 'ssh://git@example.test/acme/brand-kit.git';

/**
 * The brand the test repository holds, copied from the framework.
 */
const BRAND = 'default';

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
 * The request for a source in the test repository.
 *
 * @param source - The source after the address, such as `//brands/default#v1`.
 * @param options - Request fields to change.
 */
function request(source: string, options: Partial<AddBrandRequest> = {}): AddBrandRequest {
  return {
    source: `${ADDRESS}${source}`,
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
      expect(added).toMatchObject({ brand: BRAND, dir: `brands/${BRAND}`, replaced: false });
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
      expect(error.message).toContain("transport 'file' not allowed");
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
  const args = ['brand', 'add', source, '--json'];
  if (force) {
    args.push('--force');
  }

  const child = fork(CLI, args, {
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
