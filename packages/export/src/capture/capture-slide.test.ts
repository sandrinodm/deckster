import type { Browser, Page } from 'playwright';

import { Effect } from 'effect';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { captureSlide } from '#capture/capture-slide.ts';

/**
 * Captures run in Chromium.
 */
const TIMEOUT_MS = 60_000;

/**
 * A slide with a balanced heading, a list whose markers are pseudo-elements, a code block and a
 * photo-like opaque box.
 */
const SLIDE = `<!doctype html><html><head><style>
  body { margin: 0; font: 36px/1.4 sans-serif; }
  .deck-canvas { position: relative; width: 1920px; height: 1080px; background: #fcfcfd; }
  h2 { margin: 0; width: 700px; font-size: 80px; line-height: 1; text-wrap: balance; }
  li { list-style: none; }
  li::before { content: ''; display: inline-block; width: 12px; height: 12px; margin-right: 20px; background: #2d4ae0; }
  li:first-child { color: #161920; }
  .kit-code-pre { white-space: pre; font: 28px/1.5 monospace; }
  .opaque { position: absolute; right: 100px; bottom: 100px; width: 300px; height: 200px; background: #b86e00; mix-blend-mode: multiply; }
</style></head><body><div class="deck-canvas"><section data-slide-active="true" data-surface="default">
  <div data-layout="content" style="padding: 100px 128px">
    <h2 class="kit-title">Shade is infrastructure for every street</h2>
    <ul><li>First item</li><li>Second item</li></ul>
    <pre class="kit-code-pre"><span style="color:#2d4ae0">const</span> a = 1;
  <span style="color:#b86e00">return</span> a;</pre>
  </div>
  <div class="opaque"></div>
</section></div></body></html>`;

describe('captureSlide', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  }, TIMEOUT_MS);

  afterAll(async () => {
    await browser.close();
  });

  it(
    'measures text, lists and code, pictures what needs it and leaves the page as it was',
    async () => {
      await page.setContent(SLIDE);
      const captured = await Effect.runPromise(
        captureSlide(page, {
          mode: 'hybrid',
          placeholderSelectors: ['.kit-title'],
          fieldText: {},
          master: { paint: { kind: 'solid', color: '#fcfcfd' }, texture: null },
          label: 'slide 1',
          captureTexture: null,
          pictureScale: null,
        }),
      );
      const texts = captured.scene.nodes.flatMap((node) => (node.kind === 'text' ? [node] : []));
      const heading = texts.find((node) => node.matches.includes('.kit-title'));
      expect(heading?.paragraphs[0]?.lines.length).toBeGreaterThan(1);
      expect(heading?.paragraphs[0]?.keepBreaks).toBe(false);
      expect(heading?.paragraphs[0]?.wrapWidth).toBeGreaterThan(0);
      const items = texts.filter((node) => node.paragraphs[0]?.bullet?.kind === 'shape');
      expect(items).toHaveLength(2);
      const code = texts.find(
        (node) => node.paragraphs.length === 2 && node.paragraphs[0]?.wrapWidth === null,
      );
      expect(code?.paragraphs[1]?.lines[0]?.runs[0]?.text).toBe('  return ');
      const picture = captured.plan.items.find((item) => item.kind === 'picture');
      expect(
        picture === undefined ? undefined : captured.assets.pictures.get(picture.node.id)?.[0],
      ).toBe(0xff);
      const leftovers = await page.evaluate(() => ({
        stand_ins: document.querySelectorAll('[data-export-pseudo]').length,
        ids: document.querySelectorAll('[data-export-id]').length,
        style: document.getElementById('deck-export-pseudo-style') !== null,
      }));
      expect(leftovers).toEqual({ stand_ins: 0, ids: 0, style: false });
    },
    TIMEOUT_MS,
  );

  it(
    'keeps both source edges in the PNG fallback of a cropped SVG',
    async () => {
      const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100">',
        '<rect width="300" height="100" fill="lime"/>',
        '<rect width="50" height="100" fill="red"/>',
        '<rect x="250" width="50" height="100" fill="blue"/>',
        '</svg>',
      ].join('');
      const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      await page.setContent(`<!doctype html><html><body style="margin:0">
        <div class="deck-canvas" style="width:1920px;height:1080px;background:#fcfcfd">
          <section data-slide-active="true" data-surface="default"><div data-layout="content">
            <img src="${src}" style="display:block;width:100px;height:100px;object-fit:cover">
          </div></section>
        </div>
      </body></html>`);
      await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());

      const captured = await Effect.runPromise(
        captureSlide(page, {
          mode: 'hybrid',
          placeholderSelectors: [],
          fieldText: {},
          master: { paint: { kind: 'solid', color: '#fcfcfd' }, texture: null },
          label: 'slide 1',
          captureTexture: null,
          pictureScale: null,
        }),
      );
      const image = captured.scene.nodes.find((node) => node.kind === 'image');
      expect(image?.crop.left).toBeCloseTo(1 / 3);
      expect(image?.crop.right).toBeCloseTo(1 / 3);
      const original = captured.assets.images.get(src);
      expect(original?.extension).toBe('svg');
      expect(new TextDecoder().decode(original?.data)).toBe(svg);

      const fallback = image === undefined ? undefined : captured.assets.pictures.get(image.id);
      expect(fallback).toBeDefined();
      const png = await page.evaluate(
        async (base64) => {
          const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext('2d');
          context?.drawImage(bitmap, 0, 0);
          return {
            ratio: bitmap.width / bitmap.height,
            left: Array.from(context?.getImageData(0, 0, 1, 1).data ?? []),
            right: Array.from(context?.getImageData(bitmap.width - 1, 0, 1, 1).data ?? []),
          };
        },
        Buffer.from(fallback ?? new Uint8Array()).toString('base64'),
      );
      expect(png).toEqual({ ratio: 3, left: [255, 0, 0, 255], right: [0, 0, 255, 255] });
    },
    TIMEOUT_MS,
  );

  it(
    'pictures a blurred ::before while it is still on the page',
    async () => {
      const glow = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      try {
        await glow.setContent(`<!doctype html><html><head><style>
          body { margin: 0; font: 36px/1.4 sans-serif; }
          .deck-canvas { position: relative; width: 1920px; height: 1080px; background: #fcfcfd; }
          .card { position: absolute; left: 400px; top: 300px; width: 600px; height: 300px; }
          .card::before { content: ''; position: absolute; left: 0; top: 0; width: 200px; height: 200px; background: #ff0000; filter: blur(12px); }
        </style></head><body><div class="deck-canvas"><section data-slide-active="true" data-surface="default">
          <div data-layout="content"><div class="card"></div></div>
        </section></div></body></html>`);
        const captured = await Effect.runPromise(
          captureSlide(glow, {
            mode: 'hybrid',
            placeholderSelectors: [],
            fieldText: {},
            master: { paint: { kind: 'solid', color: '#fcfcfd' }, texture: null },
            label: 'slide 1',
            captureTexture: null,
            pictureScale: null,
          }),
        );
        expect(captured.scene.warnings.filter((warning) => warning.includes('pictured'))).toEqual(
          [],
        );
        const pictures = [...captured.assets.pictures.values()];
        expect(pictures.length).toBeGreaterThan(0);
        const red = await glow.evaluate(
          async (encoded) => {
            const bitmap = await createImageBitmap(
              new Blob([Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))]),
            );
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext('2d');
            context?.drawImage(bitmap, 0, 0);
            const { data } = context?.getImageData(0, 0, bitmap.width, bitmap.height) ?? {
              data: new Uint8ClampedArray(),
            };
            let count = 0;
            for (let index = 0; index < data.length; index += 4) {
              if (
                (data[index] ?? 0) > 200 &&
                (data[index + 1] ?? 255) < 80 &&
                (data[index + 3] ?? 0) > 100
              ) {
                count += 1;
              }
            }

            return count;
          },
          Buffer.from(pictures[0] ?? new Uint8Array()).toString('base64'),
        );
        expect(red).toBeGreaterThan(1000);
      } finally {
        await glow.close();
      }
    },
    TIMEOUT_MS,
  );
});
