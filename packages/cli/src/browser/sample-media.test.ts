import { Effect } from 'effect';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vite-plus/test';

import { collectElements } from '#browser/collect-snapshot.ts';
import { sampleMediaBackgrounds } from '#browser/sample-media.ts';

/**
 * Text over an SVG backdrop, with a dark rule in the font's unused ascent above its ink. The second
 * number really sits on dark pixels; the third uses currentColor for its green backing.
 */
const PROBE = `
<style>
  body { margin: 0; }
  .deck-canvas { width: 1000px; height: 500px; }
  section { position: relative; width: 100%; height: 100%; }
  img { position: absolute; inset: 0; width: 100%; height: 100%; }
  p { position: absolute; margin: 0; font: bold 100px/1 Arial; color: #101010; }
  .rule { position: absolute; top: 98px; left: 0; width: 400px; height: 8px; background: #101010; }
  #clear { top: 110px; }
  .dark { position: absolute; top: 250px; left: 0; width: 400px; height: 150px; background: #101010; }
  #failing { top: 260px; }
  #backed { left: 500px; top: 110px; color: #ffffff; background: currentColor; }
  #backed span { color: #101010; }
</style>
<div class="deck-canvas">
  <section data-slide-active="true">
    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1000' height='500'%3E%3Cpath fill='%23cbf437' d='M0 0h1000v500H0z'/%3E%3C/svg%3E">
    <div class="rule"></div><p id="clear">18.6</p>
    <div class="dark"></div><p id="failing">18.6</p>
    <p id="backed"><span>18.6</span></p>
  </section>
</div>`;

describe('media background sampling', () => {
  it('samples a dark band behind uppercase cap tops above the source text x-height', async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 500 } });
      await page.setContent(PROBE);
      await page.locator('img').evaluate((image) => (image as HTMLImageElement).decode());
      await page.evaluate((inset) => {
        const paragraph = document.getElementById('clear')!;
        paragraph.textContent = 'now';
        paragraph.style.textTransform = 'uppercase';
        const style = getComputedStyle(paragraph);
        const context = document.createElement('canvas').getContext('2d')!;
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const lower = context.measureText('now');
        const upper = context.measureText('NOW');
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        const rect = range.getBoundingClientRect();
        const fontScale =
          rect.height / (upper.fontBoundingBoxAscent + upper.fontBoundingBoxDescent);
        const baseline = rect.top + upper.fontBoundingBoxAscent * fontScale;
        const band = document.querySelector<HTMLElement>('.rule')!;
        band.style.top = `${baseline - upper.actualBoundingBoxAscent * fontScale + inset}px`;
        band.style.height = `${(upper.actualBoundingBoxAscent - lower.actualBoundingBoxAscent) * fontScale - 2 * inset}px`;
      }, 3);
      const collected = await page.evaluate(collectElements);
      const sampled = await Effect.runPromise(sampleMediaBackgrounds(page, collected));
      const uppercase = sampled.elements.find((entry) => entry.tag === 'p' && entry.text === 'now');
      expect(uppercase?.background).toEqual({ kind: 'media', colors: ['#101010', '#cbf437'] });
    } finally {
      await browser.close();
    }
  }, 30_000);

  it('excludes a neighbouring rule, preserves currentColor backing and still samples an unreadable number', async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 500 } });
      await page.setContent(PROBE);
      await page.locator('img').evaluate((image) => (image as HTMLImageElement).decode());
      const collected = await page.evaluate(collectElements);
      const sampled = await Effect.runPromise(sampleMediaBackgrounds(page, collected));
      const [clear, failing] = sampled.elements.filter(
        (entry) => entry.tag === 'p' && entry.text === '18.6',
      );
      const backed = sampled.elements.find(
        (entry) => entry.tag === 'span' && entry.text === '18.6',
      );
      expect(clear?.background).toEqual({ kind: 'media', colors: ['#cbf437'] });
      expect(failing?.background).toEqual({ kind: 'media', colors: ['#101010'] });
      expect(backed?.background).toEqual({ kind: 'media', colors: ['#ffffff'] });
      expect(await page.locator('#deck-lint-hide-text').count()).toBe(0);
      expect(await page.locator('[data-deck-lint-over-media]').count()).toBe(0);
    } finally {
      await browser.close();
    }
  }, 30_000);
});
