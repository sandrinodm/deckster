import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PreviewServer } from 'vite-plus';

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { deckAppsPlugin } from '#apps/apps-plugin.ts';

/**
 * A connect middleware as the preview server takes it.
 */
type Middleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => Promise<void>;

/**
 * What one request through the middleware did.
 */
type Answer = {
  /**
   * Whether the middleware passed the request on, which serves the file.
   */
  passed: boolean;

  /**
   * The status it answered with, when it answered.
   */
  status: number | undefined;

  /**
   * The body it answered with.
   */
  body: string;
};

/**
 * The temporary workspaces the tests made, removed after each test.
 */
const made: string[] = [];

afterEach(() => {
  for (const dir of made.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Builds the preview middleware of a deck whose build is `dist/` under the workspace.
 *
 * @param root - The workspace, also the preview server's root.
 */
function previewMiddleware(root: string): Middleware {
  const plugin = deckAppsPlugin({ workspaceRoot: root, deck: 'demo' });
  let middleware: Middleware | undefined;
  const server = {
    config: { root, build: { outDir: 'dist' } },
    middlewares: { use: (handler: Middleware) => void (middleware = handler) },
  } as unknown as PreviewServer;
  const hook = plugin.configurePreviewServer as (server: PreviewServer) => void;
  hook(server);
  if (middleware === undefined) {
    throw new Error('The plugin mounted no preview middleware.');
  }

  return middleware;
}

/**
 * Sends one request URL through the middleware.
 *
 * @param middleware - The preview middleware.
 * @param url - The request URL.
 */
async function send(middleware: Middleware, url: string): Promise<Answer> {
  const answer: Answer = { passed: false, status: undefined, body: '' };
  const response = {
    set statusCode(status: number) {
      answer.status = status;
    },
    setHeader: () => undefined,
    end: (body: string) => void (answer.body = body),
  } as unknown as ServerResponse;
  await middleware({ url } as IncomingMessage, response, () => void (answer.passed = true));
  return answer;
}

describe('deckAppsPlugin in preview', () => {
  it('answers 400 to bad percent-encoding over a real server and keeps serving', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'deck-apps-bad-')));
    made.push(root);
    const middleware = previewMiddleware(root);
    const server = http.createServer((request, response) => {
      void middleware(request, response, () => {
        response.statusCode = 200;
        response.end('next');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const get = (target: string) =>
        new Promise<number>((resolve, reject) => {
          http
            .get({ host: '127.0.0.1', port, path: target }, (response) => {
              response.resume();
              resolve(response.statusCode ?? 0);
            })
            .on('error', reject);
        });
      expect(await get('/apps/%/')).toBe(400);
      expect(await get('/apps/%E0%A4%A/index.html')).toBe(400);
      expect(await get('/apps/missing/')).toBe(404);
    } finally {
      server.close();
    }
  });

  it('serves a built app and answers 404 for an app name that is a path', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'deck-apps-preview-')));
    made.push(root);
    fs.mkdirSync(path.join(root, 'dist', 'apps', 'counter'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', 'apps', 'counter', 'index.html'), '<p>app</p>');
    fs.mkdirSync(path.join(root, 'secret'), { recursive: true });
    fs.writeFileSync(path.join(root, 'secret', 'index.html'), '<p>secret</p>');
    const middleware = previewMiddleware(root);
    expect(await send(middleware, '/apps/counter/')).toMatchObject({ passed: true });
    for (const url of ['/apps/..%2F..%2Fsecret/', `/apps/${encodeURIComponent(root)}%2Fsecret/`]) {
      const answer = await send(middleware, url);
      expect(answer.passed, url).toBe(false);
      expect(answer.status, url).toBe(404);
      expect(answer.body, url).toContain('There is no mini app');
    }
  });
});
