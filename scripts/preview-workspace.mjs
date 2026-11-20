import { randomUUID } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { copyFile, cp, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** The checkout's docs scripts and allowlist, relative to its workspace root. */
export const DOCS_SCRIPTS_DIR = "scripts/docs";

const PREVIEW_BRAND = "fieldnote";
const CONFIG_FILE = "deck.config.ts";
const DEPENDENCIES_DIR = "node_modules";
const GENERATED_ENTRIES = new Set([DEPENDENCIES_DIR, "dist", ".deck"]);
const DEPENDENCY_CACHES = new Set([".vite", ".vite-temp"]);
const ROOT_CONFIGS = ["package.json", "tsconfig.base.json"];

/**
 * Runs a preview generator with copies of the allowlisted deck and brand sources. The checkout's
 * generator derives its workspace from its own file path, so the script sources also live in the
 * temporary workspace. Dependencies resolve to the original install.
 *
 * @template T
 * @param {string} repo - Absolute path to the source checkout with its dependencies installed.
 * @param {(workspace: string) => Promise<T>} run - Runs the generator in the temporary workspace.
 * @returns {Promise<T>} The generator's result after the temporary workspace is removed.
 * @throws When the original allowlist check, workspace setup or generator fails.
 */
export async function withPreviewWorkspace(repo, run) {
  const scripts = path.join(repo, DOCS_SCRIPTS_DIR);
  const allowlistUrl = pathToFileURL(path.join(scripts, "allowlist.ts"));
  const supportUrl = pathToFileURL(path.join(scripts, "script-support.ts"));
  const { DOCS_BRANDS, DOCS_DECKS } = await import(allowlistUrl);
  const { requireDocsBrands } = await import(supportUrl);
  await requireDocsBrands();
  if (!DOCS_BRANDS.includes(PREVIEW_BRAND)) {
    throw new Error(
      `The preview brand "${PREVIEW_BRAND}" must be in ${DOCS_SCRIPTS_DIR}/allowlist.ts`,
    );
  }

  const workspace = await mkdtemp(path.join(tmpdir(), "deckster-docs-preview-"));
  try {
    await populateWorkspace({ repo, workspace, decks: DOCS_DECKS, brands: DOCS_BRANDS });
    return await run(workspace);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function populateWorkspace({ repo, workspace, decks, brands }) {
  for (const config of ROOT_CONFIGS) {
    await copyFile(path.join(repo, config), path.join(workspace, config));
  }

  await linkDependencies(repo, workspace);
  const folders = [
    DOCS_SCRIPTS_DIR,
    ...brands.map((brand) => path.join("brands", brand)),
    ...decks.map((deck) => path.join("decks", deck)),
  ];
  for (const folder of folders) {
    const source = path.join(repo, folder);
    const target = path.join(workspace, folder);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, {
      recursive: true,
      dereference: true,
      filter: (entry) => !GENERATED_ENTRIES.has(path.basename(entry)),
    });
    await linkDependencies(source, target);
  }

  for (const deck of decks) {
    await setPreviewBrand(path.join(workspace, "decks", deck));
  }
}

async function linkDependencies(source, target) {
  const dependencies = path.join(source, DEPENDENCIES_DIR);
  if (!existsSync(dependencies)) {
    return;
  }

  // A real destination directory keeps Vite’s caches in the preview workspace.
  const destination = path.join(target, DEPENDENCIES_DIR);
  const entries = await readdir(dependencies);
  await mkdir(destination);
  for (const entry of entries.filter((name) => !DEPENDENCY_CACHES.has(name))) {
    await symlink(path.join(dependencies, entry), path.join(destination, entry));
  }
}

async function setPreviewBrand(deck) {
  // Keep the original next to the wrapper so its relative imports still resolve.
  const original = `.preview-source-${randomUUID()}.ts`;
  const file = path.join(deck, CONFIG_FILE);
  await copyFile(file, path.join(deck, original), constants.COPYFILE_EXCL);
  const wrapper = [
    `import config from "./${original}";`,
    `export default { ...config, brand: "${PREVIEW_BRAND}" };`,
    "",
  ].join("\n");
  await writeFile(file, wrapper);
}
