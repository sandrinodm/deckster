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
 *   --data   scripts/docs/data.ts          -> src/data/*.json              (committed)
 *   --shots  scripts/docs/shots.ts and
 *            scripts/docs/ui-shots.ts      -> src/assets/shots/** as WebP  (generated, gitignored)
 *                                             plus src/assets/shots/shots.json
 *   --decks  scripts/docs/decks.ts         -> public/decks/<deck>/         (generated, gitignored)
 *
 * A part whose script fails is not installed, so a broken run never replaces good files, and the
 * sync exits 1 after trying the other parts. One exception: when only ui-shots.ts fails, the
 * new slide stills are installed with the UI shots of the previous sync, and the sync still exits 1.
 *
 * The UI shots are checked against the names the pages use (every `<UiShot name>` in
 * src/content/docs, the component demo included) before anything is installed. ui-shots.ts
 * skips a shot whose prerequisite is missing and still exits 0, so a run that lacks a needed shot
 * counts as a failed run: its shots are dropped, and the previous sync's are kept when they have
 * every needed name. When they don't either, src/assets/shots is left as it was. With
 * DECKSTER_SHOTS_STRICT=1 the script gets `--strict` and fails on any skipped shot itself.
 *
 * Each part is built in a staging folder at the site root (outside public/ and src/, so no build
 * picks it up) and swapped in with two renames at the end; a build running at the same time sees
 * the old files or the new ones, except in the instant between the renames, when the folder is
 * missing. When the second rename fails, the old folder is renamed back. A sync that was killed
 * leaves its staging (`.<target>.sync-<pid>`) or old copy (`.<target>.old-<pid>`) behind; the next
 * sync puts back an old copy whose target is missing and deletes the rest.
 *
 * Slide and step stills and embedded decks use Fieldnote in temporary copies of the deck configs.
 * Brand comparison shots and product UI shots keep their own themes. Data comes from the source
 * checkout, where data.ts packs the CLI into the gitignored packages/cli/dist using pnpm.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { componentUses, literalValue, where } from "../src/components/deck/mdx-source.ts";
import { DOCS_SCRIPTS_DIR as SCRIPTS_DIR, withPreviewWorkspace } from "./preview-workspace.mjs";

const SITE_ROOT = path.resolve(import.meta.dirname, "..");

/** Stills are scaled to this width; the slides are 1920x1080 and UI shots 1440x900. */
const SHOT_WIDTH = 1280;

/** WebP quality for every still. */
const SHOT_QUALITY = 80;

/** How many images sharp converts at once. */
const CONVERT_CONCURRENCY = 8;

/**
 * UI shots whose picture is rearranged before it is scaled, by name: each function takes the PNG
 * and returns the new picture as a PNG buffer.
 */
const UI_RELAYOUT = {
  "export-verify": twoRowsOfPanels,
};

/**
 * `deck export --verify`'s comparison picture is three slide-sized panels in a row (web, the
 * converted file, the difference), each under its label: 2880x580 for a 960-wide panel. Scaled to
 * 1280 px wide as one row, each panel is 427 px wide and its text can't be read, even zoomed. So the
 * first two panels stay side by side and the difference goes under them, centred: 1920x1160, which
 * scales to 1280x773 with every panel at 640 px.
 */
async function twoRowsOfPanels(file) {
  const { width, height } = await sharp(file).metadata();
  const panel = Math.floor(width / 3);
  if (panel * 3 !== width) throw new Error(`${path.basename(file)} is ${width} px wide, not three panels of equal width`);
  const crop = (i) => sharp(file).extract({ left: i * panel, top: 0, width: panel, height }).png().toBuffer();
  const [web, converted, difference] = await Promise.all([0, 1, 2].map(crop));
  return sharp({ create: { width: panel * 2, height: height * 2, channels: 3, background: "#ffffff" } })
    .composite([
      { input: web, left: 0, top: 0 },
      { input: converted, left: panel, top: 0 },
      { input: difference, left: Math.floor(panel / 2), top: height },
    ])
    .png()
    .toBuffer();
}

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
  await recoverLeftovers();
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
  const found = candidates.find((dir) => existsSync(path.join(dir, SCRIPTS_DIR, "data.ts")));
  if (!found) {
    const how = fromEnv ? `DECKSTER_REPO=${fromEnv}` : "../2026-11-13-presentation or ../deckster";
    throw new Error(
      `No deckster checkout with ${SCRIPTS_DIR}/data.ts at ${how}. ` +
        "Set DECKSTER_REPO to a checkout of main with its dependencies installed.",
    );
  }
  return found;
}

/** src/data/*.json: replaced as a whole, so a file the script stopped writing goes away. */
async function syncData(repo) {
  const out = await runScript(repo, "data.ts");
  const files = (await readdir(out)).filter((f) => f.endsWith(".json"));
  if (!files.includes("meta.json")) throw new Error(`data.ts wrote no meta.json in ${out}`);
  const stage = await stageFor(TARGETS.data);
  for (const file of files) await cp(path.join(out, file), path.join(stage, file));
  await swapIn(stage, TARGETS.data);
  await rm(out, { recursive: true, force: true });
}

/**
 * src/assets/shots: the slide, step and brand stills from shots.ts, and the product UI from
 * ui-shots.ts under ui/, all as WebP, with one shots.json that lists every file.
 */
async function syncShots(repo) {
  const required = requiredUiShots();
  const slidesOut = await withPreviewWorkspace(repo, (workspace) => {
    return runScript(workspace, "shots.ts");
  });
  let uiOut;
  let uiProblem;
  try {
    uiOut = await runScript(repo, "ui-shots.ts", process.env.DECKSTER_SHOTS_STRICT === "1" ? ["--strict"] : []);
  } catch (error) {
    uiProblem = error instanceof Error ? error.message : String(error);
  }
  let uiFiles = uiOut === undefined ? [] : (await readdir(uiOut)).filter((f) => f.endsWith(".png")).sort();
  if (uiOut !== undefined) {
    const missing = missingNames(required, uiFiles.map((f) => f.replace(/\.png$/, "")));
    if (missing.length > 0) {
      uiProblem = `${SCRIPTS_DIR}/ui-shots.ts wrote no ${missing.join(", ")}, which the pages use (see the skipped shots above)`;
      await rm(uiOut, { recursive: true, force: true });
      uiOut = undefined;
      uiFiles = [];
    }
  }
  const previousUi = uiOut === undefined ? await previousUiShots() : [];
  if (uiOut === undefined) {
    const missing = missingNames(required, previousUi.map((e) => e.name));
    if (missing.length > 0) {
      await rm(slidesOut, { recursive: true, force: true });
      const earlier = previousUi.length === 0 ? "there is no complete set of UI shots from an earlier sync to keep" : `the earlier sync's UI shots lack ${missing.join(", ")}`;
      throw new Error(`${uiProblem}, and ${earlier}; ${TARGETS.shots} is left as it was`);
    }
  }
  const index = JSON.parse(await readFile(path.join(slidesOut, "shots.json"), "utf8"));
  const stage = await stageFor(TARGETS.shots);

  const jobs = index.files.map((entry) => ({
    from: path.join(slidesOut, ...entry.path.split("/")),
    to: entry.path.replace(/\.png$/, ".webp"),
    entry,
  }));
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
    const source = job.entry.kind === "ui" && job.entry.name in UI_RELAYOUT ? await UI_RELAYOUT[job.entry.name](job.from) : job.from;
    const info = await sharp(source)
      .resize({ width: SHOT_WIDTH, withoutEnlargement: true })
      .webp({ quality: SHOT_QUALITY })
      .toFile(target);
    return { ...job.entry, width: info.width, height: info.height, path: job.to };
  });

  // The UI shots of the previous sync, already WebP, when ui-shots.ts failed.
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

/**
 * The UI shot names the pages use: every `<UiShot name>` the MDX renders in src/content/docs,
 * the component demo included.
 *
 * @throws When a `<UiShot>` has no literal name.
 */
function requiredUiShots() {
  const names = new Set();
  for (const use of componentUses()) {
    if (use.name !== "UiShot") continue;
    const written = use.attributes.get("name");
    const name =
      written?.kind === "string" ? written.value : written?.kind === "expression" ? literalValue(written.source) : undefined;
    if (typeof name !== "string") throw new Error(`<UiShot> in ${where(use)} has no literal name`);
    names.add(name);
  }
  return [...names].sort();
}

/** The required names that are not among the ones there are. */
function missingNames(required, present) {
  const have = new Set(present);
  return required.filter((name) => !have.has(name));
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
  const out = await withPreviewWorkspace(repo, (workspace) => runScript(workspace, "decks.ts"));
  const decks = (await readdir(out, { withFileTypes: true })).filter((d) => d.isDirectory());
  if (decks.length === 0) throw new Error(`decks.ts built no deck in ${out}`);
  const stage = await stageFor(TARGETS.decks);
  await cp(out, stage, { recursive: true });
  await swapIn(stage, TARGETS.decks);
  await rm(out, { recursive: true, force: true });
}

/**
 * Runs one of the checkout's docs scripts (a file in its scripts/docs/) into a new scratch folder.
 *
 * @returns The scratch folder.
 * @throws When the script exits non-zero; its output has already been printed.
 */
async function runScript(repo, script, extra = []) {
  const out = await mkdtemp(path.join(tmpdir(), `deckster-sync-${script.replace(/\.ts$/, "")}-`));
  console.log(`\n> node ${SCRIPTS_DIR}/${script} --out ${out}${extra.map((a) => ` ${a}`).join("")}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`${SCRIPTS_DIR}/${script}`, "--out", out, ...extra], {
      cwd: repo,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (code !== 0) throw new Error(`${SCRIPTS_DIR}/${script} exited ${code}`);
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

/**
 * Replaces a target folder with its staged copy. When the staged copy can't be renamed into place,
 * the old folder is renamed back before the error is thrown.
 */
async function swapIn(stage, target) {
  const full = path.join(SITE_ROOT, target);
  const old = path.join(SITE_ROOT, `${rootName(target)}.old-${process.pid}`);
  await mkdir(path.dirname(full), { recursive: true });
  const hadOld = existsSync(full);
  if (hadOld) await rename(full, old);
  try {
    await rename(stage, full);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await rm(stage, { recursive: true, force: true }).catch(() => {});
    if (hadOld) {
      try {
        await rename(old, full);
      } catch (restoreError) {
        const why = restoreError instanceof Error ? restoreError.message : String(restoreError);
        throw new Error(`${message}; putting the previous ${target} back failed too (${why}): it is at ${old}, and the next sync restores it`);
      }
    }
    throw new Error(`${message}; the previous ${target} was kept`);
  }
  await rm(old, { recursive: true, force: true });
}

/**
 * Cleans up after a sync that was killed: an old copy whose target folder is missing is renamed
 * back (the sync died between its two renames), and every other staging folder or old copy is
 * deleted. Folders of a sync that is still running (its pid is alive) are left alone.
 */
async function recoverLeftovers() {
  const entries = await readdir(SITE_ROOT, { withFileTypes: true });
  for (const target of Object.values(TARGETS)) {
    const prefix = rootName(target);
    const leftovers = entries
      .filter((e) => e.isDirectory())
      .map((e) => ({ name: e.name, match: new RegExp(`^${prefix.replace(/[.-]/g, "\\$&")}\\.(sync|old)-(\\d+)$`).exec(e.name) }))
      .filter(({ match }) => match !== null && Number(match[2]) !== process.pid && !isAlive(Number(match[2])));
    const full = path.join(SITE_ROOT, target);
    for (const { name, match } of leftovers) {
      const from = path.join(SITE_ROOT, name);
      if (match[1] === "old" && !existsSync(full)) {
        await mkdir(path.dirname(full), { recursive: true });
        await rename(from, full);
        console.log(`sync: put back ${target} from ${name}, left by an interrupted sync`);
      } else {
        await rm(from, { recursive: true, force: true });
        console.log(`sync: deleted ${name}, left by an interrupted sync`);
      }
    }
  }
}

/** Whether a process with this id is running. */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
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
