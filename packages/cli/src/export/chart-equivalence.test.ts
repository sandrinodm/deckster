import type { Page } from 'playwright';

import { detectRenderers, plotSvg, type RendererFont, type SceneRect } from '@deckster/export';
import { loadLayoutCatalog } from '@deckster/vite-plugin';
import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { OpenedDeck } from '#browser/open-deck.ts';

import { openDeck } from '#browser/open-deck.ts';
import { cliLayer } from '#cli.ts';
import { defaultExportOptions } from '#export/export-options.ts';
import { capturePptx, playwrightPage, writePptx } from '#export/export-pptx.ts';
import { exportTargets } from '#export/export-targets.ts';
import { DEMO_WORKSPACE } from '#lint/lint.fixtures.ts';
import { Workspace } from '#workspace.ts';

/**
 * Exporting and rendering a deck takes a while.
 */
const TIMEOUT_MS = 600_000;

/**
 * The deck with one chart of every kind.
 */
const DECK = 'data-stories';

/**
 * How close LibreOffice's rendering of each kind of native chart must be to the web's plot: the
 * lowest similarity (1 minus the mean channel difference) and the largest share of visibly changed
 * pixels. Measured at about 0.985 and 3% (anti-aliasing, the square bar ends PowerPoint draws), so
 * a misplaced plot or a lost highlight fails. The doughnut's bounds are wider because LibreOffice
 * draws every doughnut with a half-size hole and ignores `c:holeSize`, which PowerPoint honours.
 */
const THRESHOLDS: Readonly<Record<string, { similarity: number; changed: number }>> = {
  /**
   * Columns and bars.
   */
  bar: { similarity: 0.975, changed: 0.05 },

  /**
   * Lines.
   */
  line: { similarity: 0.975, changed: 0.05 },

  /**
   * Areas.
   */
  area: { similarity: 0.975, changed: 0.05 },

  /**
   * A doughnut.
   */
  donut: { similarity: 0.94, changed: 0.13 },

  /**
   * A scatter.
   */
  scatter: { similarity: 0.975, changed: 0.05 },

  /**
   * A waterfall.
   */
  waterfall: { similarity: 0.975, changed: 0.05 },
};

/**
 * The chart kinds that must be native in `hybrid` mode.
 */
const NATIVE_KINDS = Object.keys(THRESHOLDS);

/**
 * A pixel counts as changed when its mean channel difference is above this share of full scale.
 */
const CHANGED_THRESHOLD = 0.1;

/**
 * Whether Docker answers, for the LibreOffice renderer.
 */
const DOCKER_RUNNING = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;

/**
 * One chart measured on the web and in LibreOffice.
 */
type ChartComparison = {
  /**
   * The slide id.
   */
  slide: string;

  /**
   * The chart kind.
   */
  kind: string;

  /**
   * Similarity of the plot region, 0 to 1.
   */
  similarity: number;

  /**
   * The share of the plot region's pixels that visibly differ, 0 to 1.
   */
  changed: number;
};

layer(cliLayer(Workspace.at(DEMO_WORKSPACE)))('native charts', (it) => {
  // oxlint-disable vitest/no-standalone-expect -- `it.effect.skipIf` is a test block the rule does not know.
  it.effect.skipIf(!DOCKER_RUNNING)(
    `look like the web chart of every kind in LibreOffice${DOCKER_RUNNING ? '' : ' (skipped: Docker is not running)'}`,
    () =>
      Effect.gen(function* () {
        const out = mkdtempSync(path.join(os.tmpdir(), 'deck-chart-equivalence-'));
        const options = { ...defaultExportOptions(DECK), formats: new Set(['pptx'] as const), out };
        const opened = yield* openDeck({ deck: DECK, brand: undefined, scale: 2 });
        const targets = yield* exportTargets(opened.page, undefined, false, false);
        const catalog = yield* loadLayoutCatalog();
        const contracts = [...catalog.values()].map((layout) => layout.contract);
        const capture = yield* capturePptx(opened, targets, contracts, options, true);
        const file = path.join(out, `${DECK}.pptx`);
        yield* writePptx(capture, opened, contracts, options, file);
        const { renderers } = yield* detectRenderers(['libreoffice']);
        const renderer = renderers.find((candidate) => candidate.id === 'libreoffice');
        expect(renderer, 'LibreOffice renderer').toBeDefined();
        if (renderer === undefined) {
          return;
        }

        const rendered = yield* renderer.render({
          deck: file,
          singles: capture.captured.map(() => file),
          workDir: out,
          fonts: latinFonts(opened),
        });
        const page = yield* playwrightPage(opened);
        const blank = yield* Effect.acquireRelease(
          Effect.promise(() => page.context().newPage()),
          (opened) => Effect.promise(() => opened.close()),
        );
        const results: ChartComparison[] = [];
        for (const [index, entry] of capture.captured.entries()) {
          const picture = rendered.pages[index];
          const web = entry.webShot;
          for (const item of entry.input.plan.items) {
            if (item.kind !== 'native' || item.node.kind !== 'chart' || web === null) {
              continue;
            }

            const plot = plotSvg(item.node, entry.input.scene);
            if (plot === null || picture == null) {
              continue;
            }

            results.push({
              slide: entry.target.slide.id,
              kind: item.node.chart.kind,
              ...(yield* Effect.promise(() =>
                compareRegion(blank, web, readFileSync(picture), plot.rect),
              )),
            });
          }
        }

        const kinds = new Set(results.map((result) => result.kind));
        expect([...kinds].sort()).toEqual([...NATIVE_KINDS].sort());
        for (const result of results) {
          const threshold = THRESHOLDS[result.kind] ?? { similarity: 1, changed: 0 };
          const label = `${result.slide} (${result.kind})`;
          expect(result.similarity, `${label} plot similarity`).toBeGreaterThanOrEqual(
            threshold.similarity,
          );
          expect(result.changed, `${label} changed pixels`).toBeLessThanOrEqual(threshold.changed);
        }
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TIMEOUT_MS,
  );
  // oxlint-enable vitest/no-standalone-expect
});

/**
 * The brand's Latin font files, installed in LibreOffice under the brand's family names.
 *
 * @param opened - The open deck.
 */
function latinFonts(opened: OpenedDeck): RendererFont[] {
  const seen = new Set<string>();
  return opened.brand.fontFaces.flatMap((face) => {
    const key = `${face.family}|${face.style}`;
    if (!/-latin-(?!ext)/.test(face.url) || seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [{ family: face.family, file: face.url }];
  });
}

/**
 * The similarity of one region of two pictures of a slide, each scaled from its own width to the
 * 1920-pixel canvas: 1 minus the mean channel difference.
 *
 * @param page - A blank browser page.
 * @param web - The web screenshot.
 * @param rendered - The rendered slide.
 * @param rect - The region in canvas pixels.
 * @returns The similarity and the share of visibly changed pixels.
 */
async function compareRegion(
  page: Page,
  web: Uint8Array,
  rendered: Uint8Array,
  rect: SceneRect,
): Promise<{ similarity: number; changed: number }> {
  return page.evaluate(
    async ({ images, region, changedThreshold }) => {
      const width = Math.round(region.width);
      const height = Math.round(region.height);
      /**
       * The region of a PNG at canvas scale.
       */
      const crop = async (base64: string): Promise<Uint8ClampedArray> => {
        const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const scale = bitmap.width / 1920;
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        context?.drawImage(
          bitmap,
          region.x * scale,
          region.y * scale,
          region.width * scale,
          region.height * scale,
          0,
          0,
          width,
          height,
        );
        return context?.getImageData(0, 0, width, height).data ?? new Uint8ClampedArray();
      };
      const [a, b] = await Promise.all(images.map(crop));
      if (a === undefined || b === undefined || a.length === 0) {
        return { similarity: 0, changed: 1 };
      }

      let total = 0;
      let changed = 0;
      for (let index = 0; index < a.length; index += 4) {
        const difference =
          (Math.abs((a[index] ?? 0) - (b[index] ?? 0)) +
            Math.abs((a[index + 1] ?? 0) - (b[index + 1] ?? 0)) +
            Math.abs((a[index + 2] ?? 0) - (b[index + 2] ?? 0))) /
          (3 * 255);
        total += difference;
        changed += difference > changedThreshold ? 1 : 0;
      }

      const pixels = a.length / 4;
      return { similarity: 1 - total / pixels, changed: changed / pixels };
    },
    {
      images: [Buffer.from(web).toString('base64'), Buffer.from(rendered).toString('base64')],
      region: rect,
      changedThreshold: CHANGED_THRESHOLD,
    },
  );
}
