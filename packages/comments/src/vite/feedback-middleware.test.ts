import type { AddressInfo } from 'node:net';

import { NodeFileSystem } from '@effect/platform-node';
import { Effect, Exit, Scope } from 'effect';
import { mkdir, rename, symlink, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import type { FeedbackAnswer } from '#model/feedback-api.ts';
import type { FeedbackDeck } from '#node/feedback-deck.ts';

import { makeTestDeck, newComment } from '#node/deck.fixture.ts';
import { screenshotFile } from '#node/feedback-paths.ts';
import { feedbackMiddleware } from '#vite/feedback-middleware.ts';

const JSON_HEADERS = { 'content-type': 'application/json' };
const TOO_LARGE_BYTES = 70 * 1024;

let server: Server;
let base: string;
let deck: FeedbackDeck;
let scope: Scope.Closeable;
const added: string[] = [];
let changes = 0;

beforeAll(async () => {
  scope = await Effect.runPromise(Scope.make());
  ({ deck } = await Effect.runPromise(
    makeTestDeck().pipe(Scope.provide(scope), Effect.provide(NodeFileSystem.layer)),
  ));
  const handle = feedbackMiddleware({
    workspaceRoot: deck.dir.replace(/\/decks\/test$/, ''),
    deck: async () => deck,
    author: async () => 'Server author',
    run: (effect) => Effect.runPromise(effect.pipe(Effect.provide(NodeFileSystem.layer))),
    onAdded: (_, comment) => added.push(comment.id),
    onChanged: () => {
      changes += 1;
    },
    stepCount: async (slideIndex) => (slideIndex === 0 ? 1 : undefined),
  });
  server = createServer((request, response) => {
    request.url = (request.url ?? '/').replace(/^\/__deck\/comments/, '') || '/';
    handle(request, response, () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/__deck/comments`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await Effect.runPromise(Scope.close(scope, Exit.void));
});

/**
 * Posts a JSON body.
 */
function post(body: unknown, headers: Record<string, string> = JSON_HEADERS): Promise<Response> {
  return fetch(base, { method: 'POST', headers, body: JSON.stringify(body) });
}

describe('the feedback endpoint', () => {
  it('adds a comment, signs it with the server author and lists it', async () => {
    const response = await post({ action: 'add', comment: newComment() });
    expect(response.status).toBe(200);
    const { comment } = (await response.json()) as { comment: { id: string; author: string } };
    expect(comment.author).toBe('Server author');
    expect(added).toEqual([comment.id]);
    const answer = (await (await fetch(base)).json()) as FeedbackAnswer;
    expect(answer).toMatchObject({ author: 'Server author', counts: { open: 1, resolved: 0 } });
    expect(answer.comments[0]).toMatchObject({
      id: comment.id,
      location: 'decks/test/slides/intro.mdx:5:1',
    });
  });

  it('reports each request that changed the feedback files, and none that did not', async () => {
    const before = changes;
    const { comment } = (await (
      await post({ action: 'add', comment: newComment({ text: 'Changes' }) })
    ).json()) as { comment: { id: string } };
    expect(changes).toBe(before + 1);
    await post({ action: 'resolve', id: comment.id, note: 'Done' });
    expect(changes).toBe(before + 2);
    await post({ action: 'resolve', id: comment.id, note: 'Again' });
    expect(changes).toBe(before + 2);
    await fetch(base);
    await post({ action: 'delete', id: comment.id });
    expect(changes).toBe(before + 3);
  });

  it('resolves, reopens and deletes by id', async () => {
    const { comment } = (await (
      await post({ action: 'add', comment: newComment({ text: 'Second' }) })
    ).json()) as {
      comment: { id: string };
    };
    const resolved = await post({ action: 'resolve', id: comment.id, note: 'Fixed' });
    expect(await resolved.json()).toMatchObject({
      comment: { status: 'resolved', resolution: { note: 'Fixed', by: 'Server author' } },
    });
    const again = await post({ action: 'resolve', id: comment.id, note: 'Overwrite' });
    expect(await again.json()).toMatchObject({
      changed: false,
      comment: { status: 'resolved', resolution: { note: 'Fixed' } },
    });
    expect(await (await post({ action: 'reopen', id: comment.id })).json()).toMatchObject({
      changed: true,
      comment: { status: 'open' },
    });
    expect(await (await post({ action: 'reopen', id: comment.id })).json()).toMatchObject({
      changed: false,
    });
    expect(await (await post({ action: 'delete', id: comment.id })).json()).toEqual({
      comment: null,
      changed: true,
    });
    expect((await post({ action: 'delete', id: comment.id })).status).toBe(404);
  });

  it('rejects requests that are not strict JSON comments', async () => {
    expect(
      (await post({ action: 'add', comment: newComment() }, { 'content-type': 'text/plain' }))
        .status,
    ).toBe(415);
    expect((await fetch(base, { method: 'PUT' })).status).toBe(405);
    expect(
      (await fetch(base, { method: 'POST', headers: JSON_HEADERS, body: '{ nope' })).status,
    ).toBe(400);
    expect((await post({ action: 'add', comment: { ...newComment(), extra: true } })).status).toBe(
      400,
    );
    expect((await post({ action: 'add', comment: newComment({ text: '' }) })).status).toBe(400);
    const blank = await post({ action: 'add', comment: newComment({ text: ' \n\t ' }) });
    expect(blank.status).toBe(400);
    expect(((await blank.json()) as { error: string }).error).toContain('not only whitespace');
    const blankEdit = await post({ action: 'update', id: 'abcdefgh', text: '   ' });
    expect(blankEdit.status).toBe(400);
    const pastLastStep = await post({ action: 'add', comment: newComment({ step: 99 }) });
    expect(pastLastStep.status).toBe(400);
    expect(((await pastLastStep.json()) as { error: string }).error).toBe(
      '"intro" has only step 0, so there is no step 99 to comment on.',
    );
    const escape = newComment({ source: { file: '../../etc/passwd', line: 1, column: 1 } });
    const refused = await post({ action: 'add', comment: escape });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toContain('inside the deck folder');
    const huge = await post({
      action: 'add',
      comment: newComment({ text: 'x'.repeat(TOO_LARGE_BYTES) }),
    });
    expect(huge.status).toBe(413);
    expect((await post({ action: 'add', comment: newComment({ slide: 'missing' }) })).status).toBe(
      404,
    );
  });

  it('serves screenshots only by comment id', async () => {
    expect((await fetch(`${base}/screenshot?id=../../x`)).status).toBe(404);
    expect((await fetch(`${base}/elsewhere`)).status).toBe(404);
  });
});

describe('the feedback endpoint behind the dev session guard', () => {
  it('answers 403 before reading or writing anything when the guard refuses', async () => {
    const seen: string[] = [];
    const handle = feedbackMiddleware({
      workspaceRoot: '/nowhere',
      deck: async () => {
        seen.push('deck');
        return deck;
      },
      author: async () => 'x',
      run: (effect) => Effect.runPromise(effect.pipe(Effect.provide(NodeFileSystem.layer))),
      onAdded: () => seen.push('added'),
      guard: () => 'Missing or wrong dev session cookie.',
    });
    const guarded = createServer((request, response) => {
      request.url = '/';
      handle(request, response, () => undefined);
    });
    await new Promise<void>((resolve) => guarded.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(guarded.address() as AddressInfo).port}/`;
    const read = await fetch(url);
    const write = await fetch(url, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ action: 'add', comment: newComment() }),
    });
    await new Promise((resolve) => guarded.close(resolve));
    expect([read.status, write.status]).toEqual([403, 403]);
    expect(await read.json()).toEqual({ error: 'Missing or wrong dev session cookie.' });
    expect(seen).toEqual([]);
  });
});

/**
 * A deck of its own behind the middleware, for tests that plant links in it.
 */
type IsolatedServer = {
  /**
   * The endpoint's URL.
   */
  readonly url: string;

  /**
   * The workspace root.
   */
  readonly root: string;

  /**
   * The deck.
   */
  readonly deck: FeedbackDeck;

  /**
   * The last request the server received.
   */
  readonly last: () => IncomingMessage | undefined;

  /**
   * Stops the server and removes the workspace.
   */
  readonly close: () => Promise<void>;
};

/**
 * Serves a fresh test deck's feedback endpoint on a free loopback port.
 */
async function isolatedServer(): Promise<IsolatedServer> {
  const own = await Effect.runPromise(Scope.make());
  const made = await Effect.runPromise(
    makeTestDeck().pipe(Scope.provide(own), Effect.provide(NodeFileSystem.layer)),
  );
  const handle = feedbackMiddleware({
    workspaceRoot: made.root,
    deck: async () => made.deck,
    author: async () => 'Server author',
    run: (effect) => Effect.runPromise(effect.pipe(Effect.provide(NodeFileSystem.layer))),
    onAdded: () => undefined,
  });
  let last: IncomingMessage | undefined;
  const isolated = createServer((request, response) => {
    last = request;
    request.url = (request.url ?? '/').replace(/^\/__deck\/comments/, '') || '/';
    handle(request, response, () => undefined);
  });
  await new Promise<void>((resolve) => isolated.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(isolated.address() as AddressInfo).port}/__deck/comments`,
    root: made.root,
    deck: made.deck,
    last: () => last,
    close: async () => {
      await new Promise((resolve) => isolated.close(resolve));
      await Effect.runPromise(Scope.close(own, Exit.void));
    },
  };
}

/**
 * Adds a comment on the intro slide through the endpoint and returns its id.
 *
 * @param url - The endpoint.
 */
async function addComment(url: string): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ action: 'add', comment: newComment() }),
  });
  return ((await response.json()) as { comment: { id: string } }).comment.id;
}

/**
 * Sends a request with a raw target, which `fetch` would normalise.
 *
 * @param url - Any URL of the server, for its host and port.
 * @param target - The request target as sent.
 */
function rawGet(url: string, target: string): Promise<number> {
  const { hostname, port } = new URL(url);
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ hostname, port, path: target, method: 'GET' }, (answer) => {
      answer.resume();
      resolve(answer.statusCode ?? 0);
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

describe('the feedback endpoint against links and hostile requests', () => {
  it('screenshot serve refuses a PNG that is a symbolic link to a file outside the deck', async () => {
    const server = await isolatedServer();
    try {
      const id = await addComment(server.url);
      const secret = path.join(server.root, 'secret.png');
      await writeFile(secret, 'SECRET-BYTES');
      const file = screenshotFile(server.deck.dir, 'intro', id) ?? '';
      await mkdir(path.dirname(file), { recursive: true });
      await symlink(secret, file);
      const response = await fetch(`${server.url}/screenshot?id=${id}`);
      expect([403, 404]).toContain(response.status);
      expect(await response.text()).not.toContain('SECRET-BYTES');
    } finally {
      await server.close();
    }
  });

  it('screenshot serve refuses a slide screenshot folder that is a symbolic link', async () => {
    const server = await isolatedServer();
    try {
      const id = await addComment(server.url);
      const outside = path.join(server.root, 'outside');
      await mkdir(outside);
      await writeFile(path.join(outside, `${id}.png`), 'SECRET-BYTES');
      await symlink(outside, path.join(server.deck.dir, '.feedback', 'intro'));
      const response = await fetch(`${server.url}/screenshot?id=${id}`);
      expect([403, 404]).toContain(response.status);
      expect(await response.text()).not.toContain('SECRET-BYTES');
    } finally {
      await server.close();
    }
  });

  it('screenshot serve refuses when .feedback itself is a symbolic link', async () => {
    const server = await isolatedServer();
    try {
      const id = await addComment(server.url);
      const feedback = path.join(server.deck.dir, '.feedback');
      const moved = path.join(server.root, 'moved-feedback');
      await rename(feedback, moved);
      await mkdir(path.join(moved, 'intro'), { recursive: true });
      await writeFile(path.join(moved, 'intro', `${id}.png`), 'SECRET-BYTES');
      await symlink(moved, feedback);
      const response = await fetch(`${server.url}/screenshot?id=${id}`);
      expect([400, 403, 404]).toContain(response.status);
      expect(await response.text()).not.toContain('SECRET-BYTES');
    } finally {
      await server.close();
    }
  });

  it('an oversized body is answered 413 and the request is destroyed, not read to the end', async () => {
    const server = await isolatedServer();
    try {
      const { hostname, port } = new URL(server.url);
      const status = await new Promise<number>((resolve) => {
        const outgoing = httpRequest(
          { hostname, port, path: '/__deck/comments', method: 'POST', headers: JSON_HEADERS },
          (answer) => {
            answer.resume();
            resolve(answer.statusCode ?? 0);
          },
        );
        outgoing.on('error', () => resolve(-1));
        const chunk = Buffer.alloc(16 * 1024, 0x20);
        let sent = 0;
        let answered = false;
        outgoing.once('response', () => {
          answered = true;
        });
        /**
         * Streams one chunk at a time, as a slow client would, until the server answers.
         */
        const pump = (): void => {
          if (answered || outgoing.destroyed) {
            return;
          }

          if (sent >= 64 * 1024 * 1024) {
            outgoing.end();
            return;
          }

          sent += chunk.length;
          outgoing.write(chunk);
          setTimeout(pump, 2);
        };
        pump();
      });
      expect(status).toBe(413);
      await expect.poll(() => server.last()?.destroyed).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('a `//` or `//evil` request target answers 400 instead of throwing', async () => {
    const server = await isolatedServer();
    try {
      expect(await rawGet(server.url, '//')).toBe(400);
      expect(await rawGet(server.url, '//evil')).toBe(400);
      expect(await rawGet(server.url, '//evil/screenshot?id=abcd1234')).toBe(400);
    } finally {
      await server.close();
    }
  });
});
