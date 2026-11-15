import { Effect, Layer } from 'effect';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';

import type { DeckPage } from '#browser/deck-page.ts';

import { DeckBrowser } from '#browser/deck-browser.ts';
import { pageSlide } from '#browser/fake-deck.fixture.ts';
import { SlideComparer } from '#diff/slide-comparer.ts';
import { DeckServer } from '#server/deck-server.ts';

/**
 * The PNG file signature.
 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Bytes per pixel of an 8-bit RGB image.
 */
const RGB_BYTES = 3;

/**
 * The largest channel value.
 */
const CHANNEL_MAX = 255;

/**
 * One PNG chunk: length, type, data and checksum.
 *
 * @param type - The four-letter chunk type.
 * @param data - The chunk data.
 */
function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

/**
 * A small PNG of one colour, with an optional filled box of another, as real bytes a browser can
 * decode.
 *
 * @param shade - The grey level of the background, 0 to 255.
 * @param box - A filled square in the top left corner, as its side in pixels and grey level.
 * @param size - The picture's side in pixels.
 */
export function solidPng(shade: number, box?: { side: number; shade: number }, size = 16): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * RGB_BYTES);
    for (let x = 0; x < size; x += 1) {
      const inside = box !== undefined && x < box.side && y < box.side;
      row.fill(
        Math.min(CHANNEL_MAX, inside ? box.shade : shade),
        1 + x * RGB_BYTES,
        1 + (x + 1) * RGB_BYTES,
      );
    }

    rows.push(row);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * A comparer that needs no browser: identical bytes differ by 0, anything else by 1, and the
 * picture it draws is the two inputs joined.
 */
export const fakeComparerLayer: Layer.Layer<SlideComparer> = Layer.succeed(
  SlideComparer,
  SlideComparer.of({
    compare: (before, after) =>
      Effect.succeed({
        differenceRatio: Buffer.from(before).equals(Buffer.from(after)) ? 0 : 1,
      }),
    draw: (before, after) => Effect.succeed(Buffer.concat([before, after])),
  }),
);

/**
 * A deck server and browser that render nothing: each slide's screenshot is a small PNG whose grey
 * level comes from the text of its `slides/<id>.mdx`, so a changed file changes its picture. The
 * slide ids are the quoted names in the `slides: [...]` list of the deck config, read from the
 * workspace the server was started for, so a checkout of another revision renders its own slides. A
 * slide whose text holds `RENDER-ERROR` shows an error, and the page throws once while loading when
 * the config holds `PAGE-ERROR`.
 */
export const renderingDeckLayer: Layer.Layer<DeckServer | DeckBrowser> = Layer.mergeAll(
  Layer.succeed(
    DeckServer,
    DeckServer.of({
      start: (options) =>
        Effect.succeed({
          url: `http://fake.invalid/?deck=${options.deck}`,
          compile: () => Effect.succeed([]),
        }),
    }),
  ),
  Layer.succeed(
    DeckBrowser,
    DeckBrowser.of({
      open: (url, options) =>
        Effect.sync(() => renderingPage(new URL(url), options.workspaceRoot ?? '')),
    }),
  ),
);

/**
 * The page of a rendering deck.
 *
 * @param url - The fake server's URL, naming the deck.
 * @param root - The workspace the deck was opened from.
 */
function renderingPage(url: URL, root: string): DeckPage {
  const deck = url.searchParams.get('deck') ?? '';
  const deckDir = path.join(root, 'decks', deck);
  const config = readFileSync(path.join(deckDir, 'deck.config.ts'), 'utf8');
  const list = /slides:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '';
  const ids = [...list.matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1] ?? '');
  const slides = ids.map((id, index) => pageSlide(index, id));
  let current = 0;
  const loadErrors = config.includes('PAGE-ERROR') ? ['early failure'] : [];
  const slideText = () => readFileSync(path.join(deckDir, 'slides', `${ids[current]}.mdx`), 'utf8');
  return {
    slides,
    show: (index) =>
      Effect.sync(() => {
        current = index;
      }),
    stepCount: () => Effect.succeed(1),
    measure: () => Effect.die(new Error('The rendering deck measures nothing.')),
    renderError: () =>
      Effect.sync(() =>
        slideText().includes('RENDER-ERROR')
          ? { file: `slides/${ids[current]}.mdx`, message: 'it threw' }
          : null,
      ),
    screenshot: (file) =>
      Effect.sync(() => {
        const text = slideText();
        let sum = 0;
        for (const character of text) {
          sum = (sum * 31 + character.charCodeAt(0)) % 200;
        }

        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, solidPng(40 + sum));
      }),
    takeErrors: () => Effect.sync(() => loadErrors.splice(0)),
  };
}
