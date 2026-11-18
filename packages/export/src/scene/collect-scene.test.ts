import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import type { CollectedScene } from '#scene/collected.ts';
import type { BoxNode, TableNode, TextNode } from '#scene/scene.ts';

import { collectScene, releaseScene } from '#scene/collect-scene.ts';

/**
 * Starting Chromium takes a few seconds.
 */
const BROWSER_TIMEOUT_MS = 60_000;

/**
 * A slide in the deck's DOM shape: the canvas, the active section, and elements that exercise text
 * runs and line breaks, fills, gradients, shadows, radii, list markers, tables and SVG.
 */
const SLIDE_HTML = `<!doctype html><html><head><style>
  body { margin: 0; font-family: Arial, sans-serif; }
  .deck-canvas { position: relative; width: 1920px; height: 1080px; }
  section { position: absolute; inset: 0; background: #fcfcfd; }
  .lead { position: absolute; left: 128px; top: 100px; width: 420px; margin: 0; font-size: 36px; line-height: 50px; color: #161920; letter-spacing: 2px; }
  .label { text-transform: uppercase; color: rgb(45, 74, 224); }
  .card { position: absolute; left: 700px; top: 100px; width: 400px; height: 200px; border-radius: 12px;
    background: linear-gradient(90deg, #ff0000 0%, #0000ff 100%); box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.25); border-top: 4px solid #2d4ae0; }
  ul { position: absolute; left: 128px; top: 400px; margin: 0; padding: 0; list-style: none; font-size: 30px; line-height: 40px; }
  li { position: relative; margin-left: 40px; }
  li::before { content: ''; position: absolute; left: -30px; top: 14px; width: 12px; height: 12px; border-radius: 2px; background: #2d4ae0; }
  table { position: absolute; left: 700px; top: 400px; border-collapse: collapse; font-size: 24px; }
  td, th { padding: 8px 16px; border-bottom: 1px solid #d9dce4; }
  svg { position: absolute; left: 1300px; top: 100px; }
  svg.qr { left: 1500px; border-radius: 12px; }
  .scrim { position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(to top, rgb(0 0 0 / 0.62), color-mix(in srgb, #0c0e13 55%, transparent) 40%, rgb(0 0 0 / 0) 100%); }
</style></head><body><div class="deck-canvas"><section data-slide-active="true" data-surface="default">
  <div data-layout="content">
    <div data-backdrop="" aria-hidden="true" data-decorative=""><div class="backdrop-fill" style="position: absolute; inset: 0; background: #e8ecf8;"></div></div>
    <p class="lead">Hello <strong>bold world</strong> and <span class="label">label</span> text that wraps.</p>
    <div class="card"></div>
    <ul><li>First point</li><li>Second point</li></ul>
    <table><tr><th colspan="2">Both</th></tr><tr><td>A</td><td>B</td></tr></table>
    <svg width="100" height="100" viewBox="0 0 10 10"><polygon points="5,1 9.5,9 0.5,9" fill="#2d4ae0"/></svg>
    <svg class="qr" width="120" height="120" viewBox="0 0 12 12"><rect width="12" height="12" fill="#ffffff"/><path d="M4 4h4v4h-4z" fill="#2d4ae0"/></svg>
    <div class="scrim" aria-hidden="true" data-decorative=""></div>
  </div>
</section></div></body></html>`;

/**
 * A slide with a neutral copy that the content revealed at step 1 covers and replaces: text, a
 * filled box and a `::before`, under the overlay's own text and box.
 *
 * @param state - The overlay step's `data-step-state`.
 */
function replacedHtml(state: 'past' | 'hidden'): string {
  return `<!doctype html><html><head><style>
  body { margin: 0; font-family: Arial, sans-serif; }
  .deck-canvas { position: relative; width: 1920px; height: 1080px; }
  section { position: absolute; inset: 0; background: #fcfcfd; }
  .option { position: relative; margin: 100px 128px; width: 600px; height: 120px; }
  .copy { position: absolute; inset: 0; background: #e8ecf8; font-size: 36px; }
  .copy::before { content: ''; position: absolute; left: 0; top: 0; width: 12px; height: 120px; background: #2d4ae0; }
  .deck-step { position: absolute; inset: 0; }
  .overlay { position: absolute; inset: 0; background: #2d4ae0; color: #ffffff; font-size: 36px; }
</style></head><body><div class="deck-canvas"><section data-slide-active="true" data-surface="default">
  <div class="option">
    <div class="copy" data-replaced-at="1"><span>Neutral copy</span></div>
    <div class="deck-step" data-step="1" data-step-state="${state}"><div class="overlay"><span>Answer overlay</span></div></div>
  </div>
</section></div></body></html>`;
}

describe('collectScene replacedAt in Chromium', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  }, BROWSER_TIMEOUT_MS);

  afterAll(async () => {
    await browser.close();
  });

  /**
   * Collects the replaced-copy slide and splits its nodes into the copy's and the overlay's.
   *
   * @param state - The overlay step's `data-step-state`.
   */
  async function collect(state: 'past' | 'hidden'): Promise<{
    copy: CollectedScene['nodes'];
    overlay: CollectedScene['nodes'];
  }> {
    await page.setContent(replacedHtml(state));
    const scene = await page.evaluate(collectScene, { placeholderSelectors: [] });
    const inOverlay = (node: CollectedScene['nodes'][number]): boolean =>
      node.selector.includes('deck-step') || node.step !== null;
    return {
      copy: scene.nodes.filter((node) => !inOverlay(node) && node.selector.includes('copy')),
      overlay: scene.nodes.filter(inOverlay),
    };
  }

  /**
   * The `replacedAt` of a node and of each of its paragraphs.
   *
   * @param node - The node.
   */
  function replacements(node: CollectedScene['nodes'][number]): (number | null)[] {
    return [
      node.replacedAt,
      ...(node.kind === 'text' ? node.paragraphs.map((paragraph) => paragraph.replacedAt) : []),
    ];
  }

  it('marks the copy and its pseudo element as replaced once the overlay step is reached', async () => {
    const { copy, overlay } = await collect('past');
    expect(copy.some((node) => node.kind === 'text')).toBe(true);
    expect(copy.filter((node) => node.kind === 'box').length).toBeGreaterThanOrEqual(2);
    expect(overlay.some((node) => node.kind === 'text')).toBe(true);
    expect(overlay.some((node) => node.kind === 'box')).toBe(true);
    expect(copy.flatMap(replacements).every((value) => value === 1)).toBe(true);
    expect(overlay.flatMap(replacements).every((value) => value === null)).toBe(true);
  });

  it('leaves the copy as ordinary content while the overlay step is hidden', async () => {
    const { copy } = await collect('hidden');
    expect(copy.length).toBeGreaterThan(0);
    expect(copy.flatMap(replacements).every((value) => value === null)).toBe(true);
  });
});

describe('collectScene in Chromium', () => {
  let browser: Browser;
  let page: Page;
  let scene: CollectedScene;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.setContent(SLIDE_HTML);
    scene = await page.evaluate(collectScene, { placeholderSelectors: ['.lead'] });
  }, BROWSER_TIMEOUT_MS);

  afterAll(async () => {
    await browser.close();
  });

  it('reads text as rendered lines of styled runs', () => {
    const lead = scene.nodes.find(
      (node): node is TextNode => node.kind === 'text' && node.selector.endsWith('p.lead'),
    );
    const paragraph = lead?.paragraphs[0];
    expect(paragraph?.lines.length).toBeGreaterThan(1);
    const runs = paragraph?.lines.flatMap((line) => line.runs) ?? [];
    expect(runs.map((run) => run.text).join(' ')).toContain('bold world');
    expect(runs.find((run) => run.text.includes('bold'))?.style.weight).toBe(700);
    expect(runs.find((run) => run.text.includes('label'))?.style).toMatchObject({
      caps: 'all',
      color: '#2d4ae0',
      letterSpacing: 2,
    });
    expect(paragraph?.lineHeight).toBe(50);
    expect(lead?.matches).toEqual(['.lead']);
    const [first, second] = paragraph?.lines ?? [];
    expect((second?.baseline ?? 0) - (first?.baseline ?? 0)).toBeCloseTo(50, 0);
  });

  it('reads fills, gradients, borders, radii and shadows', () => {
    const card = scene.nodes.find(
      (node): node is BoxNode => node.kind === 'box' && node.selector.includes('div.card'),
    );
    expect(card?.fill).toEqual({
      kind: 'linear',
      angle: 90,
      stops: [
        { color: '#ff0000', at: 0 },
        { color: '#0000ff', at: 1 },
      ],
    });
    expect(card?.radii).toEqual([12, 12, 12, 12]);
    expect(card?.borders[0]).toEqual({ width: 4, color: '#2d4ae0', style: 'solid' });
    expect(card?.shadows).toEqual([
      { x: 0, y: 8, blur: 24, spread: -8, color: '#00000040', inset: false },
    ]);
    expect(scene.background).toEqual({ kind: 'solid', color: '#fcfcfd' });
  });

  it('marks background layers and never takes them for the slide background', () => {
    const layer = scene.nodes.find(
      (node): node is BoxNode => node.kind === 'box' && node.selector.includes('backdrop-fill'),
    );
    expect(layer).toMatchObject({ backdrop: true, fullBleed: false, fill: { kind: 'solid' } });
    expect(scene.background).toEqual({ kind: 'solid', color: '#fcfcfd' });
  });

  it('reads a scrim over the whole slide as a translucent overlay, not the background', () => {
    const scrim = scene.nodes.find(
      (node): node is BoxNode => node.kind === 'box' && node.selector.includes('div.scrim'),
    );
    expect(scrim?.fullBleed).toBe(false);
    expect(scrim?.fill).toEqual({
      kind: 'linear',
      angle: 0,
      stops: [
        { color: '#0000009e', at: 0 },
        { color: expect.stringMatching(/^#0[cd]0[ef]1[23]8c$/), at: 0.4 },
        { color: '#00000000', at: 1 },
      ],
    });
  });

  it('turns list markers into paragraph bullets', () => {
    const items = scene.nodes.filter(
      (node): node is TextNode => node.kind === 'text' && node.selector.includes('li'),
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.paragraphs[0]?.bullet).toMatchObject({
      kind: 'shape',
      color: '#2d4ae0',
      radius: 2,
      rect: { width: 12, height: 12 },
    });
  });

  it('reads tables with spans, and SVG as vector shapes', () => {
    const table = scene.nodes.find((node): node is TableNode => node.kind === 'table');
    expect(table?.rows).toHaveLength(2);
    expect(table?.rows[0]?.cells[0]).toMatchObject({ colSpan: 2, header: true });
    expect(table?.rows[1]?.cells[1]?.paragraphs[0]?.lines[0]?.runs[0]?.text).toBe('B');
    const [svg, qr] = scene.nodes.filter((node) => node.kind === 'svg');
    expect(svg?.kind === 'svg' && svg.shapes?.[0]).toMatchObject({
      tag: 'polygon',
      fill: '#2d4ae0',
    });
    expect(svg?.kind === 'svg' && svg.radii).toBeUndefined();
    expect(qr?.kind === 'svg' && qr.radii).toEqual([12, 12, 12, 12]);
  });

  it('leaves the page as it was', async () => {
    await page.evaluate(releaseScene);
    const leftovers = await page.evaluate(
      () => document.querySelectorAll('[data-export-pseudo], [data-export-id]').length,
    );
    expect(leftovers).toBe(0);
  });
});
