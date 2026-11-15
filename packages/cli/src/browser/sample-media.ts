import type { Page } from 'playwright';

import { Effect } from 'effect';

import type { CollectedPage } from '#browser/collect-snapshot.ts';

import { browserError, type BrowserError } from '#cli-error.ts';

/**
 * The attribute `collectElements` puts on text it found over a picture, with the element's index.
 */
const OVER_MEDIA_ATTRIBUTE = 'data-deck-lint-over-media';

/**
 * The id of the style element that hides the slide's text while the screenshot is taken.
 */
const HIDE_TEXT_STYLE_ID = 'deck-lint-hide-text';

/**
 * The darkest and lightest colors under each marked element's text, by element index.
 */
type Samples = Readonly<Record<number, readonly string[]>>;

/**
 * Hides every glyph on the active slide (so the screenshot shows only what the text sits on) and
 * returns the canvas's client rectangle. It runs in the page and must stay self-contained.
 *
 * @param ids - The id of the style element to add.
 * @returns The canvas rectangle in CSS pixels, or `null` without a canvas.
 */
function hideText(ids: {
  style: string;
}): { x: number; y: number; width: number; height: number } | null {
  const slide = document.querySelector('section[data-slide-active="true"]');
  const canvas = slide?.closest('.deck-canvas');
  if (!slide || !canvas) {
    return null;
  }

  const style = document.createElement('style');
  style.id = ids.style;
  style.textContent =
    'section[data-slide-active="true"] *, section[data-slide-active="true"] *::before, ' +
    'section[data-slide-active="true"] *::after { color: transparent !important; ' +
    '-webkit-text-fill-color: transparent !important; text-shadow: none !important; ' +
    'text-decoration-color: transparent !important; caret-color: transparent !important; } ' +
    // SVG text (chart and diagram labels) is painted by `fill` and `stroke`, not `color`.
    'section[data-slide-active="true"] :is(text, tspan, textPath) { fill: transparent ' +
    '!important; stroke: transparent !important; }';
  document.head.append(style);
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

/**
 * Samples the screenshot under each marked element's text boxes and removes the hiding style and
 * the marks. It runs in the page and must stay self-contained.
 *
 * @param input - The screenshot as base64 PNG, the canvas rectangle it shows, and the ids.
 * @returns The 2nd and 98th percentile colors by luminance under each element's text, as `#rrggbb`.
 */
async function sampleUnderText(input: {
  png: string;
  clip: { x: number; y: number; width: number; height: number };
  attribute: string;
  style: string;
}): Promise<Record<number, string[]>> {
  const marked = Array.from(document.querySelectorAll(`[${input.attribute}]`));
  const result: Record<number, string[]> = {};
  try {
    const bytes = Uint8Array.from(atob(input.png), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      return result;
    }

    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const scale = bitmap.width / input.clip.width;
    const SAMPLE_STEP_PX = 3;
    const RGBA_CHANNELS = 4;
    const LOW_FRACTION = 0.02;
    const HIGH_FRACTION = 0.98;
    const SRGB_LINEAR_KNEE = 0.039_28;
    const SRGB_LINEAR_SLOPE = 12.92;
    const SRGB_GAMMA_OFFSET = 0.055;
    const SRGB_GAMMA_DIVISOR = 1.055;
    const SRGB_GAMMA_EXPONENT = 2.4;
    const OPAQUE_CHANNEL = 255;
    const RED_LUMINANCE_WEIGHT = 0.2126;
    const GREEN_LUMINANCE_WEIGHT = 0.7152;
    const BLUE_LUMINANCE_WEIGHT = 0.0722;
    /**
     * The relative luminance of an sRGB color, 0 to 1.
     */
    const luminance = (r: number, g: number, b: number): number => {
      /**
       * A channel's linear light.
       */
      const linear = (channel: number): number => {
        const value = channel / OPAQUE_CHANNEL;
        return value <= SRGB_LINEAR_KNEE
          ? value / SRGB_LINEAR_SLOPE
          : ((value + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_DIVISOR) ** SRGB_GAMMA_EXPONENT;
      };
      return (
        RED_LUMINANCE_WEIGHT * linear(r) +
        GREEN_LUMINANCE_WEIGHT * linear(g) +
        BLUE_LUMINANCE_WEIGHT * linear(b)
      );
    };
    /**
     * A color as `#rrggbb`.
     */
    const hex = (r: number, g: number, b: number): string =>
      `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
    for (const element of marked) {
      const index = Number(element.getAttribute(input.attribute));
      const samples: { lum: number; color: string }[] = [];
      for (const node of Array.from(element.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE || (node.textContent ?? '').trim() === '') {
          continue;
        }

        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          const left = Math.max(0, Math.floor((rect.left - input.clip.x) * scale));
          const top = Math.max(0, Math.floor((rect.top - input.clip.y) * scale));
          const right = Math.min(canvas.width, Math.ceil((rect.right - input.clip.x) * scale));
          const bottom = Math.min(canvas.height, Math.ceil((rect.bottom - input.clip.y) * scale));
          for (let y = top; y < bottom; y += SAMPLE_STEP_PX) {
            for (let x = left; x < right; x += SAMPLE_STEP_PX) {
              const offset = (y * canvas.width + x) * RGBA_CHANNELS;
              const r = pixels[offset] ?? 0;
              const g = pixels[offset + 1] ?? 0;
              const b = pixels[offset + 2] ?? 0;
              samples.push({ lum: luminance(r, g, b), color: hex(r, g, b) });
            }
          }
        }
      }

      if (samples.length > 0) {
        samples.sort((a, b) => a.lum - b.lum);
        /**
         * The color at a fraction of the samples, darkest first.
         */
        const pick = (fraction: number): string =>
          samples[Math.min(samples.length - 1, Math.floor(fraction * samples.length))]?.color ??
          '#000000';
        result[index] = [...new Set([pick(LOW_FRACTION), pick(HIGH_FRACTION)])];
      }
    }
  } finally {
    document.getElementById(input.style)?.remove();
    for (const element of marked) {
      element.removeAttribute(input.attribute);
    }
  }

  return result;
}

/**
 * Removes the hiding style and the marks without sampling, after a failed screenshot. It runs in
 * the page and must stay self-contained.
 *
 * @param input - The ids.
 */
function cleanUp(input: { attribute: string; style: string }): void {
  document.getElementById(input.style)?.remove();
  for (const element of Array.from(document.querySelectorAll(`[${input.attribute}]`))) {
    element.removeAttribute(input.attribute);
  }
}

/**
 * Fills in the colors under text that sits over a picture: hides the slide's text, takes a
 * screenshot of the canvas, and samples the pixels under each such element's text boxes, scrims and
 * overlays included. A page with no such text is returned as it is.
 *
 * @param page - The deck page, showing the slide that was measured.
 * @param collected - What `collectElements` measured, with text over pictures marked `media`.
 * @returns The measurement with each `media` background's colors filled in.
 */
export const sampleMediaBackgrounds = Effect.fn('sampleMediaBackgrounds')(function* (
  page: Page,
  collected: CollectedPage,
): Effect.fn.Return<CollectedPage, BrowserError> {
  if (!collected.elements.some((element) => element.background.kind === 'media')) {
    return collected;
  }

  const ids = { attribute: OVER_MEDIA_ATTRIBUTE, style: HIDE_TEXT_STYLE_ID };
  const samples: Samples = yield* Effect.tryPromise({
    try: async () => {
      const clip = await page.evaluate(hideText, { style: HIDE_TEXT_STYLE_ID });
      if (clip === null) {
        await page.evaluate(cleanUp, ids);
        return {};
      }

      const png = await page.screenshot({
        clip,
        type: 'png',
        animations: 'disabled',
        scale: 'css',
      });
      return page.evaluate(sampleUnderText, { ...ids, png: png.toString('base64'), clip });
    },
    catch: (cause) => browserError('sample the pictures under text', cause),
  }).pipe(
    Effect.tapError(() => Effect.tryPromise(() => page.evaluate(cleanUp, ids)).pipe(Effect.ignore)),
  );
  return {
    ...collected,
    elements: collected.elements.map((element) =>
      element.background.kind === 'media'
        ? {
            ...element,
            background: { ...element.background, colors: samples[element.index] ?? [] },
          }
        : element,
    ),
  };
});
