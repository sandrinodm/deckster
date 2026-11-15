import { createPageLink, type PageClient, type PageListener } from '@deckster/agent/page-link';
import { PAGE_GOTO_DONE_EVENT, PAGE_STATE_EVENT } from '@deckster/agent/page-link-events';
import { beginTurnGuard, resetTurnGuards } from '@deckster/brand/node';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Deferred, Effect, Fiber, FileSystem, Layer } from 'effect';
import fs from 'node:fs';
import path from 'node:path';

import type { DeckBrowser as DeckBrowserService } from '#browser/deck-browser.ts';

import { deckToolsLive, sharedDeckServer } from '#agent/deck-tools-live.ts';
import { DeckBrowser } from '#browser/deck-browser.ts';
import { fakeDeckLayer, pageSlide, type FakeDeck } from '#browser/fake-deck.fixture.ts';
import { FIXTURE_WORKSPACE } from '#lint/lint.fixtures.ts';
import { scratchWorkspace } from '#lint/scratch-workspace.fixture.ts';
import { collectedPage, textElement } from '#lint/snapshot.fixture.ts';
import { createDeck } from '#scaffold/new-deck.ts';
import { addSlide } from '#scaffold/new-slide.ts';
import { Workspace } from '#workspace.ts';

/**
 * A PNG signature followed by nothing: enough for a fake screenshot file.
 */
const FAKE_PNG = Buffer.from('89504e470d0a1a0a', 'hex');

/**
 * The fixture deck the tools read: one slide with a tiny text, so lint finds something.
 */
const FAKE_DECK: FakeDeck = {
  slides: [
    {
      page: pageSlide(0, 'eight-bullets', { notes: '', budget: 30, title: 'Eight bullets' }),
      steps: [
        collectedPage({ elements: [textElement('tiny', { fontSizePx: 12 })] }),
        collectedPage({ elements: [] }),
      ],
    },
  ],
};

/**
 * The fake browser, with screenshots that write a file the way Chromium would.
 */
const writingBrowser = Layer.effect(
  DeckBrowser,
  Effect.gen(function* () {
    const inner: DeckBrowserService['Service'] = yield* DeckBrowser;
    return DeckBrowser.of({
      open: (url, options) =>
        inner.open(url, options).pipe(
          Effect.map((page) => ({
            ...page,
            screenshot: (file: string) => Effect.sync(() => fs.writeFileSync(file, FAKE_PNG)),
          })),
        ),
    });
  }),
).pipe(Layer.provide(fakeDeckLayer(FAKE_DECK)));

/**
 * Builds the live tools over a workspace, with a page registry and a stand-in dev server.
 *
 * @param root - The workspace.
 * @param deck - The deck folder name.
 * @param browser - The fake browser.
 */
function tools(root: string, deck: string, browser: Layer.Layer<DeckBrowser> = writingBrowser) {
  const pageLink = createPageLink();
  const listeners = new Map<string, PageListener>();
  pageLink.attach({
    on: (event, listener) => void listeners.set(event, listener),
    off: () => undefined,
  });
  const client: PageClient = {
    send: (_event, payload) => {
      const request = payload as { request: string; slide: string; step: number };
      queueMicrotask(() =>
        listeners.get(PAGE_GOTO_DONE_EVENT)?.(
          {
            request: request.request,
            ok: true,
            error: '',
            slide: request.slide,
            step: request.step,
          },
          client,
        ),
      );
    },
    socket: { once: () => undefined },
  };
  const api = deckToolsLive({
    deck,
    brand: undefined,
    pageLink,
    server: { url: () => 'http://127.0.0.1:1/', compile: () => Effect.succeed([]) },
  }).pipe(
    Effect.provide(Layer.mergeAll(Workspace.at(root), browser)),
    Effect.provide(NodeServices.layer),
  );
  return { api, listeners, client, pageLink };
}

describe('live deck tools over the fixture deck', () => {
  it.effect('outlines the deck from the open page', () =>
    Effect.gen(function* () {
      const { api } = tools(FIXTURE_WORKSPACE, 'over-budget');
      const outline = yield* (yield* api).deckOutline;
      expect(outline).toEqual({
        deck: 'over-budget',
        title: 'Over budget fixture',
        slides: [
          {
            id: 'eight-bullets',
            number: 1,
            file: path.join('decks', 'over-budget', 'slides', 'eight-bullets.mdx'),
            title: 'Eight bullets',
            layout: 'default',
            steps: 2,
            budgetSeconds: 30,
            notesChars: 0,
          },
        ],
      });
    }),
  );

  it.effect('lints the deck, or one slide, and refuses a slide the deck does not have', () =>
    Effect.gen(function* () {
      const { api } = tools(FIXTURE_WORKSPACE, 'over-budget');
      const live = yield* api;
      const whole = (yield* live.deckLint({})) as { ok: boolean; findings: { rule: string }[] };
      expect(whole.ok).toBe(false);
      expect(whole.findings.map((finding) => finding.rule)).toContain('min-font-size');
      const one = (yield* live.deckLint({ slide: 'eight-bullets' })) as {
        slide: string;
        summary: { errors: number };
        findings: { slide: string }[];
      };
      expect(one.slide).toBe('eight-bullets');
      expect(one.findings.every((finding) => finding.slide === 'eight-bullets')).toBe(true);
      expect(one.summary.errors).toBeGreaterThan(0);
      const failure = yield* Effect.flip(live.deckLint({ slide: 'nope' }));
      expect(failure.message).toContain('no slide "nope"');
      expect(failure.message).toContain('eight-bullets');
    }),
  );

  it.effect('screenshots into .deck/agent/<deck>/shots and returns the PNG', () =>
    Effect.gen(function* () {
      const root = scratchWorkspace('deck-tools-shot-');
      fs.cpSync(
        path.join(FIXTURE_WORKSPACE, 'decks/over-budget'),
        path.join(root, 'decks/over-budget'),
        {
          recursive: true,
        },
      );
      const live = yield* tools(root, 'over-budget').api;
      const shot = yield* live.deckScreenshot({ slide: 'eight-bullets' });
      const shots = path.join(root, '.deck', 'agent', 'over-budget', 'shots');
      expect(path.dirname(path.dirname(shot.path))).toBe(shots);
      expect(path.basename(path.dirname(shot.path))).toMatch(/^request-/);
      expect(path.basename(shot.path)).toBe('01-eight-bullets.png');
      expect(shot).toMatchObject({ width: 1280, height: 720, step: null });
      expect(Buffer.from(shot.data, 'base64').equals(FAKE_PNG)).toBe(true);
      const second = yield* live.deckScreenshot({ slide: 'eight-bullets', step: 0 });
      expect(second.path).toContain('01-eight-bullets.step0.png');
      expect(fs.existsSync(second.path)).toBe(true);
      const missing = yield* Effect.flip(live.deckScreenshot({ slide: 'eight-bullets', step: 5 }));
      expect(missing.message).toContain('no step 5');
      expect(fs.readdirSync(shots).sort()).toEqual(
        [path.basename(path.dirname(shot.path)), path.basename(path.dirname(second.path))].sort(),
      );
      expect(fs.existsSync(shot.path)).toBe(true);
      fs.rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('isolates concurrent steps and widths and retains every returned image', () =>
    Effect.gen(function* () {
      const root = scratchWorkspace('deck-tools-parallel-shot-');
      fs.cpSync(
        path.join(FIXTURE_WORKSPACE, 'decks/over-budget'),
        path.join(root, 'decks/over-budget'),
        { recursive: true },
      );
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let captures = 0;
      const browser = Layer.effect(
        DeckBrowser,
        Effect.gen(function* () {
          const inner = yield* DeckBrowser;
          return DeckBrowser.of({
            open: (url, options) =>
              inner.open(url, options).pipe(
                Effect.map((page) => {
                  let step = 0;
                  return {
                    ...page,
                    show: (index, next) => {
                      step = next;
                      return page.show(index, next);
                    },
                    screenshot: (file) =>
                      Effect.gen(function* () {
                        captures += 1;
                        if (captures === 2) {
                          yield* Deferred.succeed(entered, undefined);
                        }

                        yield* Deferred.await(release);
                        fs.writeFileSync(file, `width=${options.scale * 1920};step=${step}`);
                      }),
                  };
                }),
              ),
          });
        }),
      ).pipe(Layer.provide(fakeDeckLayer(FAKE_DECK)));
      const live = yield* tools(root, 'over-budget', browser).api;
      const requests = [
        { slide: 'eight-bullets', step: 0, width: 640 },
        { slide: 'eight-bullets', step: 1, width: 1280 },
      ];
      const pending = yield* Effect.forkChild(
        Effect.forEach(requests, (request) => live.deckScreenshot(request), {
          concurrency: 'unbounded',
        }),
      );
      yield* Deferred.await(entered);
      yield* Deferred.succeed(release, undefined);
      const shots = yield* Fiber.join(pending);
      expect(new Set(shots.map((shot) => path.dirname(shot.path))).size).toBe(2);
      for (const shot of shots) {
        const expected = `width=${shot.width};step=${shot.step}`;
        expect(Buffer.from(shot.data, 'base64').toString()).toBe(expected);
        expect(fs.readFileSync(shot.path, 'utf8')).toBe(expected);
        expect(fs.readdirSync(path.dirname(shot.path))).toEqual([path.basename(shot.path)]);
      }

      fs.rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect(
    'removes only a cancelled screenshot request and retains earlier successful files',
    () =>
      Effect.gen(function* () {
        const root = scratchWorkspace('deck-tools-cancel-shot-');
        fs.cpSync(
          path.join(FIXTURE_WORKSPACE, 'decks/over-budget'),
          path.join(root, 'decks/over-budget'),
          { recursive: true },
        );
        const live = yield* tools(root, 'over-budget').api;
        const successful = yield* live.deckScreenshot({ slide: 'eight-bullets' });
        const entered = yield* Deferred.make<void>();
        const browser = Layer.effect(
          DeckBrowser,
          Effect.gen(function* () {
            const inner = yield* DeckBrowser;
            return DeckBrowser.of({
              open: (url, options) =>
                inner.open(url, options).pipe(
                  Effect.map((page) => ({
                    ...page,
                    screenshot: (file) =>
                      Effect.sync(() => fs.writeFileSync(file, FAKE_PNG)).pipe(
                        Effect.andThen(Deferred.succeed(entered, undefined)),
                        Effect.andThen(Effect.never),
                      ),
                  })),
                ),
            });
          }),
        ).pipe(Layer.provide(fakeDeckLayer(FAKE_DECK)));
        const cancelling = yield* tools(root, 'over-budget', browser).api;
        const pending = yield* Effect.forkChild(
          cancelling.deckScreenshot({ slide: 'eight-bullets' }),
        );
        yield* Deferred.await(entered);
        yield* Fiber.interrupt(pending);
        expect(fs.existsSync(successful.path)).toBe(true);
        expect(fs.readdirSync(path.dirname(path.dirname(successful.path)))).toEqual([
          path.basename(path.dirname(successful.path)),
        ]);
        fs.rmSync(root, { recursive: true, force: true });
      }),
  );

  it.effect('returns the catalogs the --json commands print, or one entry', () =>
    Effect.gen(function* () {
      const live = yield* tools(FIXTURE_WORKSPACE, 'over-budget').api;
      const layouts = (yield* live.catalog({ kind: 'layouts' })) as {
        deck: string;
        layouts: { name: string }[];
      };
      expect(layouts.deck).toBe('over-budget');
      expect(layouts.layouts.map((layout) => layout.name)).toContain('title');
      expect(yield* live.catalog({ kind: 'layouts', name: 'title' })).toMatchObject({
        name: 'title',
      });
      const charts = (yield* live.catalog({ kind: 'charts' })) as { charts: { name: string }[] };
      expect(charts.charts.length).toBeGreaterThan(0);
      const [firstChart] = charts.charts;
      expect(yield* live.catalog({ kind: 'charts', name: firstChart?.name ?? '' })).toEqual(
        firstChart,
      );
      expect((yield* live.catalog({ kind: 'diagrams' })) as object).toHaveProperty('components');
      expect((yield* live.catalog({ kind: 'components' })) as object).toHaveProperty('components');
      const brand = (yield* live.catalog({ kind: 'brand' })) as { name: string };
      expect(brand.name).toBe('default');
      const unknown = yield* Effect.flip(live.catalog({ kind: 'layouts', name: 'nope' }));
      expect(unknown.message).toContain('has no "nope"');
      expect(unknown.message).toContain('title');
    }),
  );

  it.effect('lists comments and refuses to resolve without an id', () =>
    Effect.gen(function* () {
      const live = yield* tools(FIXTURE_WORKSPACE, 'over-budget').api;
      expect(yield* live.comments({ action: 'list' })).toMatchObject({
        deck: 'over-budget',
        comments: [],
      });
      const failure = yield* Effect.flip(live.comments({ action: 'resolve' }));
      expect(failure.message).toContain('needs an id');
    }),
  );
});

describe('live deck tools that need the page or write files', () => {
  it.effect('reports no window, then the page the registry holds, and moves it', () =>
    Effect.gen(function* () {
      const harness = tools(FIXTURE_WORKSPACE, 'over-budget');
      const live = yield* harness.api;
      expect(yield* live.currentSlide).toMatchObject({ connected: false });
      harness.listeners.get(PAGE_STATE_EVENT)?.(
        {
          page: 'a',
          closed: false,
          focusedAt: 1,
          slide: {
            id: 'eight-bullets',
            index: 0,
            file: 'slides/eight-bullets.mdx',
            layout: 'default',
            title: 'Eight bullets',
          },
          step: 1,
          stepCount: 2,
          brand: 'default',
          selection: 'tiny',
        },
        harness.client,
      );
      expect(yield* live.currentSlide).toEqual({
        connected: true,
        slide: {
          id: 'eight-bullets',
          number: 1,
          file: path.join('decks', 'over-budget', 'slides', 'eight-bullets.mdx'),
          layout: 'default',
          title: 'Eight bullets',
        },
        step: 1,
        stepCount: 2,
        brand: 'default',
        selection: 'tiny',
        pages: 1,
      });
      expect(yield* live.goto({ slide: 'eight-bullets', step: 1 })).toEqual({
        slide: 'eight-bullets',
        step: 1,
      });
      const unknown = yield* Effect.flip(live.goto({ slide: 'nope' }));
      expect(unknown.message).toContain('Slides: eight-bullets');
    }),
  );

  it.effect('adds a slide after another one and lists it in the manifest', () =>
    Effect.gen(function* () {
      const root = scratchWorkspace('deck-tools-new-');
      const files = yield* FileSystem.FileSystem;
      yield* createDeck(root, 'demo', 'Demo');
      yield* addSlide({ workspaceRoot: root, deck: 'demo', id: 'two', layout: undefined });
      const live = yield* tools(root, 'demo').api;
      const created = yield* live.newSlide({ layout: 'section', id: 'middle', after: 'title' });
      expect(created).toEqual({
        id: 'middle',
        file: path.join('decks', 'demo', 'slides', 'middle.mdx'),
        layout: 'section',
        after: 'title',
      });
      const config = yield* files.readFileString(path.join(root, 'decks/demo/deck.config.ts'));
      expect(config).toMatch(/slides:\s*\[\s*'title',\s*'middle',\s*'two',?\s*\]/);
      expect(fs.readFileSync(path.join(root, 'decks/demo/slides/middle.mdx'), 'utf8')).toContain(
        'layout: section',
      );
      const appended = yield* live.newSlide({ layout: 'default', id: 'last' });
      expect(appended.after).toBeNull();
      const taken = yield* Effect.flip(live.newSlide({ layout: 'default', id: 'last' }));
      expect(taken.message).toContain('already exists');
      const bad = yield* Effect.flip(live.newSlide({ layout: 'nope', id: 'x' }));
      expect(bad.message).toContain('no layout "nope"');
      const afterMissing = yield* Effect.flip(
        live.newSlide({ layout: 'default', id: 'y', after: 'zzz' }),
      );
      expect(afterMissing.message).toContain('no slide "zzz"');
      fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('brings the agent turn’s working copy into the deck before lint reads it', () =>
    Effect.gen(function* () {
      const root = scratchWorkspace('deck-tools-sync-');
      fs.cpSync(
        path.join(FIXTURE_WORKSPACE, 'decks/over-budget'),
        path.join(root, 'decks/over-budget'),
        {
          recursive: true,
        },
      );
      const slide = path.join(root, 'decks/over-budget/slides/eight-bullets.mdx');
      const seen: string[] = [];
      const reading = Layer.effect(
        DeckBrowser,
        Effect.gen(function* () {
          const inner: DeckBrowserService['Service'] = yield* DeckBrowser;
          return DeckBrowser.of({
            open: (url, options) => {
              seen.push(fs.readFileSync(slide, 'utf8'));
              return inner.open(url, options);
            },
          });
        }),
      ).pipe(Layer.provide(fakeDeckLayer(FAKE_DECK)));
      const guard = yield* beginTurnGuard({ workspaceRoot: root, deck: 'over-budget' }, 1);
      const edited = `${fs.readFileSync(slide, 'utf8')}\nEdited in the working copy.\n`;
      fs.writeFileSync(path.join(guard.staging.absolute, 'slides/eight-bullets.mdx'), edited);
      const live = yield* tools(root, 'over-budget', reading).api;
      yield* live.deckLint({});
      expect(seen[0]).toBe(edited);
      expect(yield* live.brandName).toBe('default');
      const created = yield* live.newSlide({ layout: 'default', id: 'added' });
      expect(created.id).toBe('added');
      expect(fs.existsSync(path.join(guard.staging.absolute, 'slides/added.mdx'))).toBe(true);
      const outcome = yield* guard.settle;
      expect(outcome.kept.map((change) => change.path)).toEqual([
        'decks/over-budget/deck.config.ts',
        'decks/over-budget/slides/added.mdx',
        'decks/over-budget/slides/eight-bullets.mdx',
      ]);
      resetTurnGuards();
      fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('new_slide refuses a slides folder that is a link, and writes nothing outside', () =>
    Effect.gen(function* () {
      const root = scratchWorkspace('deck-tools-link-slides-');
      yield* createDeck(root, 'demo', 'Demo');
      const outside = fs.mkdtempSync(path.join(root, 'outside-'));
      const slides = path.join(root, 'decks/demo/slides');
      fs.cpSync(slides, outside, { recursive: true });
      fs.rmSync(slides, { recursive: true });
      fs.symlinkSync(outside, slides);
      const live = yield* tools(root, 'demo').api;
      const refused = yield* Effect.flip(live.newSlide({ layout: 'default', id: 'evil' }));
      expect(refused.message).toContain('slides is not a plain folder');
      expect(fs.existsSync(path.join(outside, 'evil.mdx'))).toBe(false);
      fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('the slide-list tools refuse a deck config that is a link, and leave it alone', () =>
    Effect.gen(function* () {
      const root = scratchWorkspace('deck-tools-link-config-');
      yield* createDeck(root, 'demo', 'Demo');
      yield* addSlide({ workspaceRoot: root, deck: 'demo', id: 'two', layout: undefined });
      const config = path.join(root, 'decks/demo/deck.config.ts');
      const outside = path.join(root, 'outside.config.ts');
      fs.renameSync(config, outside);
      fs.symlinkSync(outside, config);
      const before = fs.readFileSync(outside, 'utf8');
      const live = yield* tools(root, 'demo').api;
      const reordered = yield* Effect.flip(live.reorderSlides({ slides: ['two', 'title'] }));
      expect(reordered.message).toContain('not a plain file');
      const removed = yield* Effect.flip(live.removeSlide({ id: 'two' }));
      expect(removed.message).toContain('not a plain file');
      expect(fs.readFileSync(outside, 'utf8')).toBe(before);
      expect(fs.existsSync(path.join(root, 'decks/demo/slides/two.mdx'))).toBe(true);
      fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('refuses a brand catalog name that is a path, without importing its brand.ts', () =>
    Effect.gen(function* () {
      const root = scratchWorkspace('deck-tools-brand-');
      yield* createDeck(root, 'demo', 'Demo');
      const marker = path.join(root, 'imported.txt');
      const evil = path.join(root, 'decks', 'x', 'evilbrand');
      fs.mkdirSync(evil, { recursive: true });
      fs.writeFileSync(
        path.join(evil, 'brand.ts'),
        `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'imported');\nexport default {};\n`,
      );
      const live = yield* tools(root, 'demo').api;
      for (const name of ['../decks/x/evilbrand', evil, '../x']) {
        const refused = yield* Effect.flip(live.catalog({ kind: 'brand', name }));
        expect(refused.message, name).toContain('Invalid brand name in brands/');
        expect(refused.message, name).toContain(`"${name}" is not a brand folder name`);
      }

      expect(fs.existsSync(marker)).toBe(false);
      const nocturne = (yield* live.catalog({ kind: 'brand', name: 'nocturne' })) as {
        name: string;
      };
      expect(nocturne.name).toBe('nocturne');
      fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe('the shared deck server', () => {
  it.live('hands out its URL only once the server listens', () =>
    Effect.gen(function* () {
      const listening = yield* Deferred.make<void>();
      let port = 0;
      const shared = sharedDeckServer({
        url: () => `http://127.0.0.1:${port}/`,
        listening: Deferred.await(listening),
        compile: () => Effect.succeed([]),
      });
      const started = yield* Effect.forkChild(shared.start({ deck: 'hello', brand: undefined }));
      yield* Effect.sleep('50 millis');
      expect(started.pollUnsafe()).toBeUndefined();
      port = 5391;
      yield* Deferred.succeed(listening, undefined);
      const server = yield* Fiber.join(started);
      expect(server.url).toBe('http://127.0.0.1:5391/');
    }).pipe(Effect.scoped),
  );
});
