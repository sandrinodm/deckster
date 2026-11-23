import type {
  CurrentSlide,
  DeckOutline,
  DeckToolsApi,
  NewSlideResult,
  ScreenshotResult,
  SlideListResult,
} from '@deckster/agent/mcp';
import type { PageLink } from '@deckster/agent/page-link';
import type { MdxWarning } from '@deckster/vite-plugin';
import type { FileSystem, Scope } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';

import { AgentError, agentError } from '@deckster/agent/errors';
import { agentShotsDir } from '@deckster/agent/protocol';
import { DEFAULT_BRAND } from '@deckster/brand';
import {
  assertSlidePath,
  brandTokensJson,
  guardedWrite,
  syncActiveTurn,
  writeDeckManifest,
} from '@deckster/brand/node';
import { chartCatalog } from '@deckster/kit/chart-catalog';
import { componentCatalog } from '@deckster/kit/component-catalog';
import { DIAGRAM_CATALOG } from '@deckster/kit/diagram-catalog';
import {
  findDeck,
  loadDeck,
  reorderDeck,
  reorderSlideIds,
  slideListProblem,
} from '@deckster/vite-plugin';
import { Effect, Exit, FileSystem as Fs } from 'effect';
import path from 'node:path';

import type { DeckBrowser } from '#browser/deck-browser.ts';
import type { ViteError } from '#cli-error.ts';

import { openDeck } from '#browser/open-deck.ts';
import { fileSystemError } from '#cli-error.ts';
import { listComments, resolveComment } from '#comments/run-comments.ts';
import { listLayouts } from '#layouts/list-layouts.ts';
import { lintDeck } from '#lint/run-lint.ts';
import { describeError } from '#report-error.ts';
import { addSlide } from '#scaffold/new-slide.ts';
import { DeckServer } from '#server/deck-server.ts';
import { takeShots } from '#shot/take-shots.ts';
import { Workspace } from '#workspace.ts';

/**
 * The screenshot width when the caller names none, in pixels: small enough for a model to read
 * cheaply.
 */
const SHOT_WIDTH_PX = 1280;

/**
 * The canvas width the engine renders, in canvas pixels.
 */
const CANVAS_WIDTH_PX = 1920;

/**
 * The aspect ratio of a slide, as height over width.
 */
const SLIDE_RATIO = 9 / 16;

/**
 * Recovery advice when the screenshot request cannot create its own folder.
 */
const SHOT_FOLDER_FIX = 'Check the workspace permissions and try again.';

/**
 * The running dev server the tools render through instead of starting another one.
 */
export type LiveServer = {
  /**
   * The page URL of the running dev server.
   */
  readonly url: () => string;

  /**
   * Completes once the server listens. Rendering starts only then, so a render requested while the
   * server is still starting (the first baseline lint) does not open an address with no port; leave
   * out when the server already listens.
   */
  readonly listening?: Effect.Effect<void>;

  /**
   * Compiles one module through its pipeline.
   *
   * @param file - The absolute path of the module.
   */
  readonly compile: (file: string) => Effect.Effect<readonly MdxWarning[], ViteError>;
};

/**
 * What the live tools work on.
 */
export type LiveToolsOptions = {
  /**
   * The deck folder name.
   */
  readonly deck: string;

  /**
   * The brand the dev server renders with instead of the deck config's, if any.
   */
  readonly brand: string | undefined;

  /**
   * The registry of open deck pages, for `current_slide` and `goto`.
   */
  readonly pageLink: PageLink;

  /**
   * The running dev server.
   */
  readonly server: LiveServer;
};

/**
 * The services the live tools capture when they are built.
 */
export type LiveToolsServices =
  | Workspace
  | FileSystem.FileSystem
  | DeckBrowser
  | ChildProcessSpawner.ChildProcessSpawner;

/**
 * A {@link DeckServer} that hands out the running dev server instead of starting one. `start` waits
 * until the server listens, then reads its URL.
 *
 * @param server - The running dev server.
 */
export function sharedDeckServer(server: LiveServer): typeof DeckServer.Service {
  return DeckServer.of({
    start: () =>
      (server.listening ?? Effect.void).pipe(
        Effect.map(() => ({ url: server.url(), compile: server.compile })),
      ),
  });
}

/**
 * Builds the real deck tools. Each is a thin wrapper over what the commands use: `lintDeck`,
 * `takeShots`, the catalogs, the comment store and `addSlide`. Lint, screenshots and the outline
 * render through the dev server that is already running (a {@link DeckServer} that hands out its
 * URL) and the shared headless browser, so no second Vite server starts. Failures become
 * `AgentError`s with the command's own message.
 *
 * @param options - The deck, the brand, the page registry and the running server.
 */
export const deckToolsLive = Effect.fn('deckToolsLive')(function* (
  options: LiveToolsOptions,
): Effect.fn.Return<DeckToolsApi, never, LiveToolsServices> {
  const services = yield* Effect.context<LiveToolsServices>();
  const { root } = yield* Workspace;
  const { deck, brand } = options;
  const sharedServer = sharedDeckServer(options.server);

  /**
   * Runs an operation with the captured services and the shared server, and turns its failure into
   * an agent error.
   *
   * @param effect - The operation.
   */
  const run = <A, E>(
    effect: Effect.Effect<A, E, LiveToolsServices | DeckServer | Scope.Scope>,
  ): Effect.Effect<A, AgentError> =>
    effect.pipe(
      Effect.scoped,
      Effect.provideService(DeckServer, sharedServer),
      Effect.provideContext(services),
      Effect.mapError((error) =>
        error instanceof AgentError ? error : agentError(describeError(error).message),
      ),
    );

  /**
   * Brings the working copy of the agent turn in flight, if any, into the deck first, so a tool
   * that reads the deck sees the agent's edits.
   */
  const synced = syncActiveTurn(root, deck).pipe(Effect.provideContext(services));

  /**
   * The ids of the deck's slides, to check a slide the agent names.
   */
  const slideIds = Effect.fn('deckTools.slideIds')(function* () {
    const loaded = yield* loadDeck(root, yield* findDeck(root, deck));
    return loaded.slides.map((slide) => slide.id);
  });

  /**
   * Fails with the deck's slide ids when the id is not one of them.
   *
   * @param slide - The id an agent gave.
   */
  const requireSlide = Effect.fn('deckTools.requireSlide')(function* (slide: string) {
    const ids = yield* slideIds();
    if (!ids.includes(slide)) {
      return yield* agentError(
        `The deck "${deck}" has no slide "${slide}".`,
        `Slides: ${ids.join(', ')}.`,
      );
    }

    return slide;
  });

  /**
   * A listed slide's file from the deck manifest, relative to the workspace root.
   *
   * @param id - The slide id.
   */
  const manifestFile = Effect.fn('deckTools.manifestFile')(function* (id: string) {
    const loaded = yield* loadDeck(root, yield* findDeck(root, deck));
    const slide = loaded.slides.find((candidate) => candidate.id === id);
    return slide === undefined
      ? undefined
      : path.relative(root, slide.file).split(path.sep).join('/');
  });

  /**
   * A listed slide's file, as an agent error on failure.
   *
   * @param id - The slide id.
   */
  const slideFile = (id: string) => run(manifestFile(id));

  const brandName = run(
    Effect.gen(function* () {
      const loaded = yield* loadDeck(root, yield* findDeck(root, deck));
      return brand ?? loaded.config.brand ?? DEFAULT_BRAND;
    }),
  );

  // The page reports which slide it shows; the file to edit always comes from the manifest by
  // that id, never from what the page says.
  const currentSlide = Effect.gen(function* () {
    yield* synced;
    const page = yield* options.pageLink.current;
    if (page === undefined) {
      return {
        connected: false,
        message:
          `No deck window is open. ` +
          `Open the URL \`deckster dev ${deck}\` printed, then ask again.`,
      } satisfies CurrentSlide;
    }

    const file = yield* slideFile(page.slide.id).pipe(Effect.orElseSucceed(() => undefined));
    if (file === undefined) {
      return {
        connected: false,
        message:
          `The deck window shows a slide "${page.slide.id}" that decks/${deck}/deck.config.ts ` +
          'does not list. Reload the window, then ask again.',
      } satisfies CurrentSlide;
    }

    return {
      connected: true,
      slide: {
        id: page.slide.id,
        number: page.slide.index + 1,
        file,
        layout: page.slide.layout,
        title: page.slide.title,
      },
      step: page.step,
      stepCount: page.stepCount === 0 ? null : page.stepCount,
      brand: page.brand,
      selection: page.selection,
      pages: page.pages,
    } satisfies CurrentSlide;
  });

  const deckOutline = run(
    Effect.gen(function* () {
      yield* synced;
      const opened = yield* openDeck({ deck, brand, scale: 1 });
      const slides: DeckOutline['slides'][number][] = [];
      for (const slide of opened.page.slides) {
        slides.push({
          id: slide.id,
          number: slide.index + 1,
          file: path.join('decks', deck, slide.file),
          title: slide.title,
          layout: slide.layout,
          steps: yield* opened.page.stepCount(slide.index),
          budgetSeconds: slide.budget,
          notesChars: slide.notes.length,
          hidden: slide.hidden,
        });
      }

      return { deck, title: opened.deck.config.title, slides } satisfies DeckOutline;
    }),
  );

  /**
   * Lints the deck, then keeps one slide's findings when asked.
   *
   * @param input - The optional slide.
   */
  const deckLint = (input: { readonly slide?: string }) =>
    run(
      Effect.gen(function* () {
        yield* synced;
        const { slide } = input;
        if (slide !== undefined) {
          yield* requireSlide(slide);
        }

        const report = yield* lintDeck({ deck, brand });
        if (slide === undefined) {
          return report;
        }

        const findings = report.findings.filter((finding) => finding.slide === slide);
        const errors = findings.filter((finding) => finding.severity === 'error').length;
        return {
          deck: report.deck,
          brand: report.brand,
          slide,
          ok: errors === 0,
          summary: { ...report.summary, errors, warnings: findings.length - errors },
          findings,
        };
      }),
    );

  /**
   * Captures, selects and reads the requested image within its own request directory.
   */
  const captureScreenshot = Effect.fn('deckTools.captureScreenshot')(function* (
    input: Parameters<DeckToolsApi['deckScreenshot']>[0],
    outDir: string,
  ) {
    const fs = yield* Fs.FileSystem;
    const wantStep = input.step;
    const width = input.width ?? SHOT_WIDTH_PX;
    const result = yield* takeShots({
      deck,
      slide: input.slide,
      brand,
      steps: wantStep !== undefined,
      outDir,
      scale: width / CANVAS_WIDTH_PX,
    });
    const file =
      wantStep === undefined
        ? result.files[0]
        : result.files.find((candidate) => candidate.step === wantStep);
    if (file === undefined) {
      const steps = result.files.length;
      return yield* agentError(
        `Slide "${input.slide}" has no step ${wantStep}; ` + `it has ${steps} (0 to ${steps - 1}).`,
      );
    }

    for (const other of result.files) {
      if (other.path !== file.path) {
        yield* fs.remove(other.path, { force: true }).pipe(Effect.ignore);
      }
    }

    const bytes = yield* fs.readFile(file.path);
    const shot: ScreenshotResult = {
      path: file.path,
      slide: file.slide,
      step: file.step,
      width,
      height: Math.round(width * SLIDE_RATIO),
      error: file.error ?? result.pageErrors[0] ?? null,
      data: Buffer.from(bytes).toString('base64'),
    };
    return shot;
  });

  /**
   * Captures one slide into a unique request folder under `.deck/agent/<deck>/shots/`. Successful
   * files remain available for the provider to read after the tool returns.
   *
   * @param input - The slide, optional step and optional image width.
   */
  const deckScreenshot = (input: {
    readonly slide: string;
    readonly step?: number;
    readonly width?: number;
  }) =>
    run(
      Effect.gen(function* () {
        yield* synced;
        const fs = yield* Fs.FileSystem;
        const shots = agentShotsDir(root, deck);
        yield* fs
          .makeDirectory(shots, { recursive: true })
          .pipe(
            Effect.mapError((error) =>
              fileSystemError('create the screenshot folder', shots, error, SHOT_FOLDER_FIX),
            ),
          );
        return yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const outDir = yield* fs
              .makeTempDirectory({ directory: shots, prefix: 'request-' })
              .pipe(
                Effect.mapError((error) =>
                  fileSystemError('create the screenshot request', shots, error, SHOT_FOLDER_FIX),
                ),
              );
            return yield* restore(captureScreenshot(input, outDir)).pipe(
              Effect.onExit((exit) =>
                Exit.isFailure(exit)
                  ? fs.remove(outDir, { recursive: true, force: true }).pipe(Effect.ignore)
                  : Effect.void,
              ),
            );
          }),
        );
      }),
    );

  /**
   * Picks one catalog, or one entry of it by name.
   *
   * @param input - The kind and optional name.
   */
  const catalog = (input: { readonly kind: string; readonly name?: string }) =>
    run(
      Effect.gen(function* () {
        const { kind, name } = input;
        if (kind === 'brand') {
          const loaded = yield* loadDeck(root, yield* findDeck(root, deck));
          const brandName = name ?? brand ?? loaded.config.brand ?? DEFAULT_BRAND;
          const tokens: unknown = JSON.parse(yield* brandTokensJson(root, brandName));
          return tokens;
        }

        const whole: {
          readonly entries: readonly { readonly name: string }[];
          readonly json: unknown;
        } = yield* wholeCatalog(kind);
        if (name === undefined) {
          return whole.json;
        }

        const entry = whole.entries.find((candidate) => candidate.name === name);
        if (entry === undefined) {
          return yield* agentError(
            `The ${kind} catalog has no "${name}".`,
            `Names: ${whole.entries.map((candidate) => candidate.name).join(', ')}.`,
          );
        }

        return entry;
      }),
    );

  /**
   * Loads the catalog of one kind the way its `--json` command prints it.
   *
   * @param kind - `layouts`, `charts`, `diagrams` or `components`.
   */
  const wholeCatalog = Effect.fn('deckTools.wholeCatalog')(function* (kind: string) {
    switch (kind) {
      case 'layouts': {
        const layouts = yield* listLayouts(root, deck, brand);
        return { entries: layouts.layouts, json: { deck, ...layouts } };
      }
      case 'charts': {
        const charts = chartCatalog();
        return { entries: charts.charts, json: charts };
      }
      case 'diagrams':
        return { entries: DIAGRAM_CATALOG.components, json: DIAGRAM_CATALOG };
      case 'components': {
        const components = componentCatalog();
        return { entries: components.components, json: components };
      }
      default:
        return yield* agentError(
          `There is no "${kind}" catalog.`,
          'Use layouts, charts, diagrams, components or brand.',
        );
    }
  });

  /**
   * Lists review comments or resolves one.
   *
   * @param input - The action and its arguments.
   */
  const comments = (input: {
    readonly action: 'list' | 'resolve';
    readonly id?: string;
    readonly note?: string;
    readonly status?: 'open' | 'resolved' | 'all';
    readonly slide?: string;
  }) =>
    run(
      Effect.gen(function* () {
        yield* synced;
        if (input.action === 'resolve') {
          if (input.id === undefined) {
            return yield* agentError(
              'Which comment? resolve needs an id.',
              'Call comments with action list to see the ids.',
            );
          }

          const resolved = yield* resolveComment({
            positionals: [deck, input.id],
            values: {
              open: false,
              resolved: false,
              all: false,
              ...(input.note === undefined ? {} : { note: input.note }),
            },
          });
          return resolved.json;
        }

        const listed = yield* listComments(deck, {
          positionals: [],
          values: {
            open: input.status === undefined || input.status === 'open',
            resolved: input.status === 'resolved',
            all: input.status === 'all',
            ...(input.slide === undefined ? {} : { slide: input.slide }),
          },
        });
        return listed.json;
      }),
    );

  /**
   * Moves the user's window.
   *
   * @param input - The slide and optional step.
   */
  const goto = (input: { readonly slide: string; readonly step?: number }) =>
    run(
      Effect.gen(function* () {
        yield* requireSlide(input.slide);
        const done = yield* options.pageLink.goto(input.slide, input.step ?? 0);
        return { slide: done.slide, step: done.step };
      }),
    );

  /**
   * Adds a slide from a layout's example and, with `after`, moves it behind another slide.
   *
   * @param input - The layout, id and optional slide to follow.
   */
  const newSlide = (input: {
    readonly layout: string;
    readonly id: string;
    readonly after?: string;
  }) =>
    run(
      Effect.gen(function* () {
        yield* synced;
        const { after } = input;
        if (after !== undefined) {
          yield* requireSlide(after);
        }

        yield* addSlide({ workspaceRoot: root, deck, id: input.id, layout: input.layout, brand });
        if (after !== undefined) {
          const location = yield* findDeck(root, deck);
          const ids = (yield* loadDeck(root, location)).slides.map((slide) => slide.id);
          const without = ids.filter((id) => id !== input.id);
          const insertAt = without.indexOf(after) + 1;
          yield* reorderDeck(root, location, {
            slides: [...without.slice(0, insertAt), input.id, ...without.slice(insertAt)],
          });
        }

        return {
          id: input.id,
          file: path.join('decks', deck, 'slides', `${input.id}.mdx`),
          layout: input.layout,
          after: after ?? null,
        } satisfies NewSlideResult;
      }),
    );

  /**
   * Rewrites the deck config's slide list through `writeDeckManifest`: the deck folder and the
   * config must be plain (no links, inside the workspace), the edit starts from the config as the
   * running turn found it, and only quoted ids change. These tools run outside any provider
   * sandbox, so they check paths themselves.
   *
   * @param ids - The new list.
   */
  const writeSlideList = Effect.fn('deckTools.writeSlideList')(function* (ids: readonly string[]) {
    yield* writeDeckManifest(root, deck, (config) => {
      const updated = reorderSlideIds(config, ids);
      return updated === undefined
        ? Effect.fail(
            agentError(
              slideListProblem(config, { rewrite: true }) ?? 'The slides list cannot be edited.',
              'Ask the user to edit the slides list in deck.config.ts by hand.',
            ),
          )
        : Effect.succeed(updated);
    });
  });

  /**
   * Puts the slides in a new order.
   *
   * @param input - Every slide id, in the new order.
   */
  const reorderSlides = (input: { readonly slides: readonly string[] }) =>
    run(
      Effect.gen(function* () {
        yield* synced;
        yield* reorderDeck(root, yield* findDeck(root, deck), { slides: [...input.slides] });
        return { slides: yield* slideIds(), removed: null } satisfies SlideListResult;
      }),
    );

  /**
   * Takes a slide out of the list and deletes its file.
   *
   * @param input - The slide id.
   */
  const removeSlide = (input: { readonly id: string }) =>
    run(
      Effect.gen(function* () {
        yield* synced;
        const fs = yield* Fs.FileSystem;
        yield* requireSlide(input.id);
        const file = yield* manifestFile(input.id);
        const ids = yield* slideIds();
        if (ids.length === 1) {
          return yield* agentError(
            'A deck needs at least one slide, so its last slide cannot be removed.',
          );
        }

        if (file !== undefined) {
          yield* assertSlidePath(root, deck, path.join(root, file));
        }

        yield* writeSlideList(ids.filter((id) => id !== input.id));
        if (file !== undefined) {
          // Removes the entry itself: a link is removed, never what it points to. During a turn the
          // guard records it and takes it out of the working copy too.
          const absolute = path.join(root, file);
          yield* guardedWrite(absolute, fs.remove(absolute, { force: true }));
        }

        return { slides: yield* slideIds(), removed: file ?? null } satisfies SlideListResult;
      }),
    );
  return {
    currentSlide,
    deckOutline,
    slideFile,
    brandName,
    deckLint,
    deckScreenshot,
    catalog,
    comments,
    goto,
    newSlide,
    reorderSlides,
    removeSlide,
  };
});
