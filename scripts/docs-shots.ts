import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { DOCS_BRANDS, DOCS_DECKS } from './docs-allowlist.ts';
import { elapsed, readOutDir, requireDocsBrands, runDeck } from './docs-script-support.ts';
import { BRAND_GRID_SLIDES, STEP_SLIDES } from './docs-shots.manifest.ts';

/**
 * How many `deck shot` runs go at once; each starts its own Chromium.
 */
const CONCURRENT_RUNS = 3;

/**
 * The fewest steps a manifest slide needs to make a filmstrip.
 */
const MIN_STEPS = 2;

/**
 * The folders under `--out` this script owns and replaces on every run.
 */
const OWNED_FOLDERS = ['slides', 'steps', 'brands'] as const;

/**
 * Which part of the docs a shot is for.
 */
type ShotKind = 'slide' | 'step' | 'brand';

/**
 * One file `deck shot --json` lists.
 */
type DeckShotFile = {
  /**
   * The absolute path of the PNG.
   */
  readonly path: string;

  /**
   * The slide id.
   */
  readonly slide: string;

  /**
   * The 1-based slide number.
   */
  readonly number: number;

  /**
   * The step shown, or `null` for the finished slide.
   */
  readonly step: number | null;

  /**
   * The image width in pixels.
   */
  readonly width: number;

  /**
   * The image height in pixels.
   */
  readonly height: number;

  /**
   * What the slide threw, or `null`.
   */
  readonly error: string | null;
};

/**
 * The JSON `deck shot --json` prints: the files on success, or `{ ok: false, error }`.
 */
type DeckShotOutput = {
  /**
   * The brand the deck rendered with.
   */
  readonly brand?: string;

  /**
   * Whether every slide rendered without an error.
   */
  readonly ok: boolean;

  /**
   * The files written.
   */
  readonly files?: readonly DeckShotFile[];

  /**
   * Errors thrown while the deck loaded.
   */
  readonly pageErrors?: readonly string[];

  /**
   * Why the command failed before writing anything.
   */
  readonly error?: { readonly type: string; readonly message: string };
};

/**
 * One `deck shot` invocation and where its files go.
 */
type ShotJob = {
  /**
   * Which part of the docs the files are for.
   */
  readonly kind: ShotKind;

  /**
   * The deck folder name.
   */
  readonly deck: string;

  /**
   * One slide id, or `undefined` for every slide.
   */
  readonly slide: string | undefined;

  /**
   * The `--brand` value, or `undefined` for the deck's own.
   */
  readonly brand: string | undefined;

  /**
   * Whether to write one file per step.
   */
  readonly steps: boolean;

  /**
   * The file's path relative to `--out`, for one file of the run.
   */
  readonly target: (file: DeckShotFile, brand: string) => string;
};

/**
 * One line of `shots.json`.
 */
type ShotEntry = {
  /**
   * Which part of the docs it is for.
   */
  readonly kind: ShotKind;

  /**
   * The deck folder name.
   */
  readonly deck: string;

  /**
   * The slide id.
   */
  readonly slide: string;

  /**
   * The 1-based slide number.
   */
  readonly number: number;

  /**
   * The step shown, or `null` for the finished slide.
   */
  readonly step: number | null;

  /**
   * The brand it rendered with.
   */
  readonly brand: string;

  /**
   * The image width in pixels.
   */
  readonly width: number;

  /**
   * The image height in pixels.
   */
  readonly height: number;

  /**
   * The path relative to `--out`, with forward slashes.
   */
  readonly path: string;
};

/**
 * What one job produced: its files, and every problem it ran into.
 */
type JobResult = {
  /**
   * The files copied into `--out`.
   */
  readonly entries: ShotEntry[];

  /**
   * Problems: slide errors, page errors, a failed command or a manifest slide that did not match.
   */
  readonly problems: string[];
};

await main();

/**
 * Shoots every allowlisted deck, the manifest's step slides and the brand grid into `--out`, then
 * writes `shots.json`. Refuses to start when an allowlisted deck renders with a brand outside the
 * allowlist. Exits with 1 when any slide failed or a manifest entry did not match, after writing
 * everything that did work.
 */
async function main(): Promise<void> {
  const start = performance.now();
  const out = readOutDir('docs-shots.ts');
  await requireDocsBrands();
  await clearOwnedFolders(out);
  const results = await runPool(plannedJobs(), CONCURRENT_RUNS, (job) => runJob(out, job));
  const entries = results.flatMap((result) => result.entries);
  const problems = results.flatMap((result) => result.problems);
  await writeFile(path.join(out, 'shots.json'), `${JSON.stringify({ files: entries }, null, 2)}\n`);
  console.log(`Wrote ${entries.length} shots to ${out} in ${elapsed(start)}.`);
  if (problems.length > 0) {
    console.error(`${problems.length} problem(s):\n${problems.join('\n')}`);
    process.exitCode = 1;
  }
}

/**
 * Removes the folders and index this script writes, so a slide that left a deck leaves the docs.
 *
 * @param out - The output folder.
 */
async function clearOwnedFolders(out: string): Promise<void> {
  await mkdir(out, { recursive: true });
  for (const folder of OWNED_FOLDERS) {
    await rm(path.join(out, folder), { recursive: true, force: true });
  }

  await rm(path.join(out, 'shots.json'), { force: true });
}

/**
 * Every `deck shot` run: each deck whole, each step slide, and each grid slide in each brand.
 *
 * @returns The jobs in the order their entries appear in `shots.json`.
 */
function plannedJobs(): ShotJob[] {
  const stills = DOCS_DECKS.map((deck): ShotJob => ({
    kind: 'slide',
    deck,
    slide: undefined,
    brand: undefined,
    steps: false,
    target: (file) => `slides/${deck}/${file.slide}.png`,
  }));
  const filmstrips = STEP_SLIDES.map(({ deck, slide }): ShotJob => ({
    kind: 'step',
    deck,
    slide,
    brand: undefined,
    steps: true,
    target: (file) => `steps/${deck}/${slide}/${file.step ?? 0}.png`,
  }));
  const grid = DOCS_BRANDS.flatMap((brand) =>
    BRAND_GRID_SLIDES.map(({ deck, slide }): ShotJob => ({
      kind: 'brand',
      deck,
      slide,
      brand,
      steps: false,
      target: () => `brands/${brand}/${slide}.png`,
    })),
  );
  return [...stills, ...filmstrips, ...grid];
}

/**
 * Runs one `deck shot` into a scratch folder and copies its files into `--out` under their docs
 * names. The scratch folder keeps a whole-deck run from deleting files in `--out`.
 *
 * @param out - The output folder.
 * @param job - The run.
 * @returns The entries written and the problems found.
 */
async function runJob(out: string, job: ShotJob): Promise<JobResult> {
  const start = performance.now();
  const label = describeJob(job);
  const scratch = await mkdtemp(path.join(tmpdir(), 'docs-shots-'));
  try {
    const output = await shoot(job, scratch);
    if (output.files === undefined) {
      const reason = output.error?.message ?? 'no JSON output';
      return { entries: [], problems: [`${label}: ${reason}`] };
    }

    const brand = output.brand ?? job.brand ?? 'unknown';
    const entries = await copyShots(out, job, output.files, brand);
    const problems = [
      ...output.files.flatMap((file) => (file.error === null ? [] : [`${label}: ${file.error}`])),
      ...(output.pageErrors ?? []).map((error) => `${label}: page error: ${error}`),
      ...checkJob(job, output.files, label),
    ];
    console.log(`${label}: ${entries.length} file(s) in ${elapsed(start)}`);
    return { entries, problems };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/**
 * Runs `deck shot --json` for a job and parses what it printed, whatever its exit code.
 *
 * @param job - The run.
 * @param scratch - The folder `deck shot` writes into.
 * @returns The parsed output, or a failure carrying standard error when nothing parsed.
 */
async function shoot(job: ShotJob, scratch: string): Promise<DeckShotOutput> {
  const args = ['shot', job.deck, ...(job.slide === undefined ? [] : [job.slide])];
  args.push('--out', scratch, '--json');
  if (job.steps) {
    args.push('--steps');
  }

  if (job.brand !== undefined) {
    args.push('--brand', job.brand);
  }

  const run = await runDeck(args);
  try {
    return JSON.parse(run.stdout) as DeckShotOutput;
  } catch {
    const message = `exit ${run.code}: ${run.stderr.trim() || run.stdout.trim()}`;
    return { ok: false, error: { type: 'NoJson', message } };
  }
}

/**
 * Copies a run's PNGs to their docs paths and describes each one.
 *
 * @param out - The output folder.
 * @param job - The run.
 * @param files - The files `deck shot` listed.
 * @param brand - The brand the deck rendered with.
 * @returns One entry per file copied.
 */
async function copyShots(
  out: string,
  job: ShotJob,
  files: readonly DeckShotFile[],
  brand: string,
): Promise<ShotEntry[]> {
  const entries: ShotEntry[] = [];
  for (const file of files) {
    const relative = job.target(file, brand);
    const destination = path.join(out, ...relative.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(file.path, destination);
    entries.push({
      kind: job.kind,
      deck: job.deck,
      slide: file.slide,
      number: file.number,
      step: file.step,
      brand,
      width: file.width,
      height: file.height,
      path: relative,
    });
  }

  return entries;
}

/**
 * Checks that a manifest slide matched: a step slide needs at least `MIN_STEPS` files, and a single
 * slide must have produced a file with that id.
 *
 * @param job - The run.
 * @param files - The files `deck shot` listed.
 * @param label - The job's name in messages.
 * @returns A problem per mismatch; none for a whole-deck run.
 */
function checkJob(job: ShotJob, files: readonly DeckShotFile[], label: string): string[] {
  if (job.slide === undefined) {
    return [];
  }

  if (!files.some((file) => file.slide === job.slide)) {
    return [`${label}: no slide with the id "${job.slide}"`];
  }

  if (job.steps && files.length < MIN_STEPS) {
    return [`${label}: ${files.length} step(s), a filmstrip needs at least ${MIN_STEPS}`];
  }

  return [];
}

/**
 * A job's name in progress lines and problems, such as `step showcase/lint-path`.
 *
 * @param job - The run.
 * @returns The name.
 */
function describeJob(job: ShotJob): string {
  const slide = job.slide === undefined ? '' : `/${job.slide}`;
  const brand = job.brand === undefined ? '' : `@${job.brand}`;
  return `${job.kind} ${job.deck}${slide}${brand}`;
}

/**
 * Runs `task` over `items` with at most `limit` at once and keeps the results in input order.
 *
 * @param items - The inputs.
 * @param limit - How many tasks may run at once, at least 1.
 * @param task - The work for one input.
 * @returns The results, one per input, in input order.
 */
async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
