/**
 * Refreshes the inputs the site is built from, out of a deckster checkout:
 *
 *     npm run sync                      # everything
 *     npm run sync -- --data            # only src/data/*.json
 *     npm run sync -- --shots --decks   # any combination of --data, --shots, --decks
 *
 * The checkout is DECKSTER_REPO, else ../2026-11-13-presentation, else ../deckster (relative to
 * this site). Its docs scripts run with Node from the checkout, each into a fresh scratch folder,
 * and the results are installed here:
 *
 *   --data   scripts/docs-data.ts          -> src/data/*.json              (committed)
 *   --shots  scripts/docs-shots.ts and
 *            scripts/docs-ui-shots.ts      -> src/assets/shots/** as WebP  (generated, gitignored)
 *                                             plus src/assets/shots/shots.json
 *   --decks  scripts/docs-decks.ts         -> public/decks/<deck>/         (generated, gitignored)
 *
 * A part whose script fails is not installed, so a broken run never replaces good files, and the
 * sync exits 1 after trying the other parts. One exception: when only docs-ui-shots.ts fails, the
 * new slide stills are installed with the UI shots of the previous sync (if there are any), and
 * the sync still exits 1. Each part is built in a staging folder at the site root (outside
 * public/ and src/, so no build picks it up) and swapped in with two renames at the end; a build
 * running at the same time sees the old files or the new ones, except in the instant between the
 * renames, when the folder is missing.
 *
 * The checkout's tracked files are never written. Its docs-decks.ts does build each deck into
 * decks/<deck>/dist inside the checkout, which git ignores.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";

const SITE_ROOT = path.resolve(import.meta.dirname, "..");

/** Stills are scaled to this width; the slides are 1920x1080 and UI shots 1440x900. */
const SHOT_WIDTH = 1280;

/** WebP quality for every still. */
const SHOT_QUALITY = 80;

/** How many images sharp converts at once. */
const CONVERT_CONCURRENCY = 8;

/** Where each part is installed, relative to the site root. */
const TARGETS = {
  data: "src/data",
  shots: "src/assets/shots",
  decks: "public/decks",
};

await main();

async function main() {
  const { values } = parseArgs({
    options: {
      data: { type: "boolean", default: false },
      shots: { type: "boolean", default: false },
      decks: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log("Usage: npm run sync [-- --data] [--shots] [--decks]\n\nWith no flag, all three.");
    return;
  }

  const all = !values.data && !values.shots && !values.decks;
  const repo = findRepo();
  console.log(`Syncing from ${repo}`);

  const problems = [];
  const parts = [
    ["data", syncData],
    ["shots", syncShots],
    ["decks", syncDecks],
  ];
  for (const [name, run] of parts) {
    if (!all && !values[name]) continue;
    const start = performance.now();
    try {
      await run(repo);
      console.log(`sync: ${name} installed in ${seconds(start)}`);
    } catch (error) {
      problems.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`sync: ${name} NOT installed: ${problems.at(-1)}`);
    }
  }

  if (problems.length > 0) {
    console.error(`\nsync failed:\n  ${problems.join("\n  ")}`);
    process.exitCode = 1;
  }
}

/**
 * The deckster checkout to read from.
 *
 * @returns Its absolute path.
 * @throws When none of the candidates has the docs scripts.
 */
function findRepo() {
  const fromEnv = process.env.DECKSTER_REPO;
  const candidates = fromEnv
    ? [path.resolve(fromEnv)]
    : ["../2026-11-13-presentation", "../deckster"].map((p) => path.resolve(SITE_ROOT, p));
  const found = candidates.find((dir) => existsSync(path.join(dir, "scripts", "docs-data.ts")));
  if (!found) {
    const how = fromEnv ? `DECKSTER_REPO=${fromEnv}` : "../2026-11-13-presentation or ../deckster";
    throw new Error(
      `No deckster checkout with scripts/docs-data.ts at ${how}. ` +
        "Set DECKSTER_REPO to a checkout of main with its dependencies installed.",
    );
  }
  return found;
}

/** src/data/*.json: replaced as a whole, so a file the script stopped writing goes away. */
async function syncData(repo) {
  const out = await runScript(repo, "docs-data.ts");
  const files = (await readdir(out)).filter((f) => f.endsWith(".json"));
  if (!files.includes("meta.json")) throw new Error(`docs-data.ts wrote no meta.json in ${out}`);
  const stage = await stageFor(TARGETS.data);
  for (const file of files) await cp(path.join(out, file), path.join(stage, file));
  await swapIn(stage, TARGETS.data);
  await rm(out, { recursive: true, force: true });
}

/**
 * src/assets/shots: the slide, step and brand stills from docs-shots.ts, and the product UI from
 * docs-ui-shots.ts under ui/, all as WebP, with one shots.json that lists every file.
 */
async function syncShots(repo) {
  const slidesOut = await runScript(repo, "docs-shots.ts");
  let uiOut;
  let uiProblem;
  try {
    uiOut = await runScript(repo, "docs-ui-shots.ts");
  } catch (error) {
    uiProblem = error instanceof Error ? error.message : String(error);
  }
  const previousUi = uiOut === undefined ? await previousUiShots() : [];
  if (uiOut === undefined && previousUi.length === 0) {
    throw new Error(`${uiProblem}, and there are no UI shots from an earlier sync to keep`);
  }
  const index = JSON.parse(await readFile(path.join(slidesOut, "shots.json"), "utf8"));
  const stage = await stageFor(TARGETS.shots);

  const jobs = index.files.map((entry) => ({
    from: path.join(slidesOut, ...entry.path.split("/")),
    to: entry.path.replace(/\.png$/, ".webp"),
    entry,
  }));
  const uiFiles = uiOut === undefined ? [] : (await readdir(uiOut)).filter((f) => f.endsWith(".png")).sort();
  if (uiOut !== undefined && uiFiles.length === 0) throw new Error(`docs-ui-shots.ts wrote no PNG in ${uiOut}`);
  for (const file of uiFiles) {
    jobs.push({
      from: path.join(uiOut, file),
      to: `ui/${file.replace(/\.png$/, ".webp")}`,
      entry: { kind: "ui", name: file.replace(/\.png$/, "") },
    });
  }

  const converted = await pool(jobs, CONVERT_CONCURRENCY, async (job) => {
    const target = path.join(stage, ...job.to.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    const info = await sharp(job.from)
      .resize({ width: SHOT_WIDTH, withoutEnlargement: true })
      .webp({ quality: SHOT_QUALITY })
      .toFile(target);
    return { ...job.entry, width: info.width, height: info.height, path: job.to };
  });

  // The UI shots of the previous sync, already WebP, when docs-ui-shots.ts failed.
  for (const entry of previousUi) {
    const target = path.join(stage, ...entry.path.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(SITE_ROOT, TARGETS.shots, ...entry.path.split("/")), target);
  }

  const files = converted.filter((e) => e.kind !== "ui");
  const ui = [...converted.filter((e) => e.kind === "ui").map(({ kind, ...rest }) => rest), ...previousUi];
  await writeFile(path.join(stage, "shots.json"), `${JSON.stringify({ files, ui }, null, 2)}\n`);
  await swapIn(stage, TARGETS.shots);
  await rm(slidesOut, { recursive: true, force: true });
  if (uiOut !== undefined) await rm(uiOut, { recursive: true, force: true });
  console.log(`sync: ${files.length} slide stills and ${ui.length} UI shots as WebP`);
  if (uiProblem !== undefined) {
    throw new Error(`${uiProblem}; installed the new slide stills with the ${previousUi.length} UI shots of the previous sync`);
  }
}

/** The UI shots installed by an earlier sync whose files are all still there, else []. */
async function previousUiShots() {
  try {
    const index = JSON.parse(await readFile(path.join(SITE_ROOT, TARGETS.shots, "shots.json"), "utf8"));
    const ui = Array.isArray(index.ui) ? index.ui : [];
    return ui.every((entry) => existsSync(path.join(SITE_ROOT, TARGETS.shots, ...entry.path.split("/")))) ? ui : [];
  } catch {
    return [];
  }
}

/** public/decks/<deck>/: the built decks, replaced as a whole. */
async function syncDecks(repo) {
  const out = await runScript(repo, "docs-decks.ts");
  const decks = (await readdir(out, { withFileTypes: true })).filter((d) => d.isDirectory());
  if (decks.length === 0) throw new Error(`docs-decks.ts built no deck in ${out}`);
  const stage = await stageFor(TARGETS.decks);
  await cp(out, stage, { recursive: true });
  await swapIn(stage, TARGETS.decks);
  await rm(out, { recursive: true, force: true });
}

/**
 * Runs one of the checkout's docs scripts into a new scratch folder.
 *
 * @returns The scratch folder.
 * @throws When the script exits non-zero; its output has already been printed.
 */
async function runScript(repo, script) {
  const out = await mkdtemp(path.join(tmpdir(), `deckster-sync-${script.replace(/\.ts$/, "")}-`));
  console.log(`\n> node scripts/${script} --out ${out}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`scripts/${script}`, "--out", out], {
      cwd: repo,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (code !== 0) throw new Error(`scripts/${script} exited ${code}`);
  return out;
}

/**
 * A site-root folder name for a target: "src/data" -> ".src-data". Staging and old copies live at
 * the root, on the same file system (so the swap is a rename) and outside public/ and src/.
 */
function rootName(target) {
  return `.${target.split("/").join("-")}`;
}

/** An empty staging folder for a target. */
async function stageFor(target) {
  const stage = path.join(SITE_ROOT, `${rootName(target)}.sync-${process.pid}`);
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  return stage;
}

/** Replaces a target folder with its staged copy. */
async function swapIn(stage, target) {
  const full = path.join(SITE_ROOT, target);
  const old = path.join(SITE_ROOT, `${rootName(target)}.old-${process.pid}`);
  await mkdir(path.dirname(full), { recursive: true });
  if (existsSync(full)) await rename(full, old);
  await rename(stage, full);
  await rm(old, { recursive: true, force: true });
}

/** Runs `task` over `items`, at most `limit` at once, keeping input order. */
async function pool(items, limit, task) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function seconds(start) {
  return `${((performance.now() - start) / 1000).toFixed(1)}s`;
}
