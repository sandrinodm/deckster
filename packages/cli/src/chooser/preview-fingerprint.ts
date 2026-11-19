import type { DeckLocation } from '@deckster/vite-plugin';

import { DEFAULT_BRAND } from '@deckster/brand';
import { FRAMEWORK_ROOT } from '@deckster/brand/node';
import { createHash, type Hash } from 'node:crypto';
import { lstat, readdir, readlink, realpath } from 'node:fs/promises';
import path from 'node:path';

/**
 * The cache version, incremented when the rules for rendering a cover change.
 */
const CACHE_VERSION = 'deck-cover-v1';

/**
 * Output, dependency and cache folders that cannot be sources of a cover.
 */
const GENERATED_DIRECTORIES = new Set([
  'dist',
  'node_modules',
  '.deck',
  '.git',
  '.cache',
  '.vite',
  '.turbo',
]);

/**
 * The bounds and ancestors of a fingerprint walk.
 */
type FileTree = {
  /**
   * The digest being updated with sorted path and file metadata.
   */
  readonly hash: Hash;

  /**
   * The absolute deck and brand roots from which symlink targets are allowed.
   */
  readonly roots: readonly string[];

  /**
   * Ancestor paths on this branch, to stop directory cycles.
   */
  readonly parents: ReadonlySet<string>;
};

/**
 * Identifies the local inputs to a cover, including imported deck files, public assets and the
 * effective brand. Symlinks can point to shared assets under decks or brands. Traversal stays in
 * those trees, so a link to a cache, the home folder or a parent cannot make it walk unrelated
 * files. Rejects when an input cannot be read.
 */
export async function previewFingerprint(
  root: string,
  deck: DeckLocation,
  brand: string,
): Promise<string> {
  const brands = path.join(root, 'brands');
  const builtInBrands = path.join(FRAMEWORK_ROOT, 'brands');
  const roots = [path.join(root, 'decks'), brands, builtInBrands];
  const localBrand = path.join(brands, brand);
  const builtInDefault = path.join(builtInBrands, DEFAULT_BRAND);
  const hash = createHash('sha256').update(CACHE_VERSION).update(brand);
  const tree = { hash, roots, parents: new Set<string>() };
  await hashTree(tree, deck.dir);
  await hashTree(tree, localBrand);
  if (brand === DEFAULT_BRAND && localBrand !== builtInDefault) {
    await hashTree(tree, builtInDefault);
  }

  return hash.digest('hex');
}

/**
 * Adds an input file or directory to the digest, following only allowed symlink targets.
 */
async function hashTree(tree: FileTree, file: string): Promise<void> {
  const { hash, parents } = tree;
  const info = await lstat(file, { bigint: true }).catch((cause: unknown) => {
    if (isMissingPath(cause)) {
      return undefined;
    }

    throw cause;
  });
  hash.update(file).update('\0');
  if (info === undefined) {
    hash.update('missing\0');
    return;
  }

  if (info.isSymbolicLink()) {
    hash.update(await readlink(file)).update('\0');
    const target = await realpath(file).catch(() => undefined);
    if (target !== undefined && allowedTarget(tree.roots, target)) {
      await hashTree(tree, target);
    }

    return;
  }

  if (!info.isDirectory()) {
    hash.update(`${info.size}:${info.mtimeNs}:${info.ctimeNs}\0`);
    return;
  }

  const resolved = await realpath(file);
  if (!allowedTarget(tree.roots, resolved) || parents.has(resolved)) {
    return;
  }

  const branch = { ...tree, parents: new Set(parents).add(resolved) };
  const names = await readdir(file);
  for (const name of names.sort()) {
    if (!GENERATED_DIRECTORIES.has(name)) {
      await hashTree(branch, path.join(file, name));
    }
  }
}

/**
 * Rejects parents, generated folders and absolute targets outside the input trees.
 */
function allowedTarget(roots: readonly string[], target: string): boolean {
  return roots.some((root) => {
    const relative = path.relative(root, target);
    const parts = relative.split(path.sep);
    const first = parts[0];
    return (
      first !== '' &&
      first !== '..' &&
      !path.isAbsolute(relative) &&
      parts.every((part) => !GENERATED_DIRECTORIES.has(part))
    );
  });
}

/**
 * Treats an absent input as part of the fingerprint so it can be noticed if created later.
 */
function isMissingPath(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    'code' in cause &&
    (cause.code === 'ENOENT' || cause.code === 'ENOTDIR')
  );
}
