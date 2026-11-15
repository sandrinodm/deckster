import type { Browser, Page } from 'playwright';

import { Effect } from 'effect';
import { createServer, type Server } from 'node:http';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { fetchEmbedded, fetchEmbeddedWithin } from '#capture/capture-slide.ts';

/**
 * Fetching runs in Chromium against a local server.
 */
const TIMEOUT_MS = 60_000;

/**
 * The limit the tests apply, in bytes.
 */
const LIMIT = 1_000_000;

/**
 * The first bytes of an MP4 file's `ftyp` box; Chromium's sniffing is not needed since the server
 * names the type.
 */
const CHUNK = Buffer.alloc(64 * 1024, 7);

describe('fetchEmbeddedWithin', () => {
  let browser: Browser;
  let page: Page;
  let server: Server;
  let origin = '';
  let streamed = 0;

  beforeAll(async () => {
    server = createServer((request, response) => {
      response.setHeader('access-control-allow-origin', '*');
      if (request.url === '/') {
        response.setHeader('content-type', 'text/html');
        response.end('<!doctype html><title>x</title>');
        return;
      }

      response.setHeader('content-type', 'video/mp4');
      if (request.url === '/declared.mp4') {
        response.setHeader('content-length', String(50 * LIMIT));
        response.write(CHUNK);
        return;
      }

      if (request.url === '/endless.mp4') {
        streamed = 0;
        const timer = setInterval(() => {
          streamed += CHUNK.length;
          response.write(CHUNK);
        }, 1);
        response.on('close', () => clearInterval(timer));
        return;
      }

      response.setHeader('content-length', String(CHUNK.length));
      response.end(CHUNK);
    });
    await new Promise<void>((resolve) => server.listen(5911, '127.0.0.1', resolve));
    origin = 'http://127.0.0.1:5911';
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.goto(`${origin}/`);
  }, TIMEOUT_MS);

  afterAll(async () => {
    await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it(
    'reads a file under the limit',
    async () => {
      const file = await Effect.runPromise(
        fetchEmbeddedWithin(page, `${origin}/small.mp4`, 'slide 1', LIMIT),
      );
      expect(file).toMatchObject({ extension: 'mp4' });
      expect(file !== null && 'data' in file ? file.data.length : 0).toBe(CHUNK.length);
    },
    TIMEOUT_MS,
  );

  it(
    'refuses a file whose Content-Length is over the limit without reading it',
    async () => {
      const file = await Effect.runPromise(
        fetchEmbeddedWithin(page, `${origin}/declared.mp4`, 'slide 1', LIMIT),
      );
      expect(file).toEqual({ tooLarge: true, bytes: 50 * LIMIT });
    },
    TIMEOUT_MS,
  );

  it(
    'stops reading a stream of unknown length once it passes the limit',
    async () => {
      const file = await Effect.runPromise(
        fetchEmbeddedWithin(page, `${origin}/endless.mp4`, 'slide 1', LIMIT),
      );
      expect(file).toMatchObject({ tooLarge: true });
      expect(file !== null && 'bytes' in file ? file.bytes : 0).toBeGreaterThan(LIMIT);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const settled = streamed;
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(streamed - settled).toBeLessThan(CHUNK.length * 4);
    },
    TIMEOUT_MS,
  );

  it(
    'still fetches without a limit through fetchEmbedded',
    async () => {
      const file = await Effect.runPromise(fetchEmbedded(page, `${origin}/small.mp4`, 'slide 1'));
      expect(file?.extension).toBe('mp4');
    },
    TIMEOUT_MS,
  );
});
