import type { Effect } from 'effect';

import { Context, Layer } from 'effect';

import type { AgentError } from '#errors.ts';
import type {
  CatalogInput,
  CommentsInput,
  DeckLintInput,
  DeckScreenshotInput,
  GotoInput,
  NewSlideInput,
  RemoveSlideInput,
  ReorderSlidesInput,
} from '#mcp/tool-schemas.ts';

/**
 * What `current_slide` answers: the page the user looked at most recently.
 */
export type CurrentSlide =
  | {
      /**
       * No deck page is open.
       */
      readonly connected: false;

      /**
       * How to get one.
       */
      readonly message: string;
    }
  | {
      /**
       * A deck page is open.
       */
      readonly connected: true;

      /**
       * The slide on screen.
       */
      readonly slide: {
        /**
         * The slide id.
         */
        readonly id: string;

        /**
         * The 1-based slide number.
         */
        readonly number: number;

        /**
         * The slide file relative to the workspace, the file to edit.
         */
        readonly file: string;

        /**
         * The layout the slide names.
         */
        readonly layout: string;

        /**
         * The slide's title.
         */
        readonly title: string;
      };

      /**
       * The step on screen, from 0.
       */
      readonly step: number;

      /**
       * The number of steps of the slide, step 0 included, when known.
       */
      readonly stepCount: number | null;

      /**
       * The brand the deck renders with.
       */
      readonly brand: string;

      /**
       * The text selected on the page, empty when there is none.
       */
      readonly selection: string;

      /**
       * How many deck pages are open.
       */
      readonly pages: number;
    };

/**
 * One slide of the outline.
 */
export type OutlineSlide = {
  /**
   * The slide id.
   */
  readonly id: string;

  /**
   * The 1-based slide number.
   */
  readonly number: number;

  /**
   * The slide file relative to the workspace.
   */
  readonly file: string;

  /**
   * The slide's title.
   */
  readonly title: string;

  /**
   * The layout the slide names.
   */
  readonly layout: string;

  /**
   * The number of steps, step 0 included.
   */
  readonly steps: number;

  /**
   * The speaking budget in seconds, or null when the slide sets none.
   */
  readonly budgetSeconds: number | null;

  /**
   * How many characters of speaker notes the slide has.
   */
  readonly notesChars: number;
};

/**
 * What `deck_outline` answers.
 */
export type DeckOutline = {
  /**
   * The deck folder name.
   */
  readonly deck: string;

  /**
   * The deck's title.
   */
  readonly title: string;

  /**
   * The slides, in order.
   */
  readonly slides: readonly OutlineSlide[];
};

/**
 * A screenshot, written to disk and returned as base64.
 */
export type ScreenshotResult = {
  /**
   * The absolute path of the PNG.
   */
  readonly path: string;

  /**
   * The slide id.
   */
  readonly slide: string;

  /**
   * The step shown, or null for the slide's last step.
   */
  readonly step: number | null;

  /**
   * The image width in pixels.
   */
  readonly width: number;

  /**
   * The image height in pixels.
   */
  readonly height: number;

  /**
   * Why the image shows a broken slide, or null when it rendered.
   */
  readonly error: string | null;

  /**
   * The PNG, base64 encoded.
   */
  readonly data: string;
};

/**
 * What `goto` answers.
 */
export type GotoResult = {
  /**
   * The slide on screen after the move.
   */
  readonly slide: string;

  /**
   * The step on screen after the move.
   */
  readonly step: number;
};

/**
 * What `new_slide` answers.
 */
export type NewSlideResult = {
  /**
   * The new slide's id.
   */
  readonly id: string;

  /**
   * The slide file relative to the workspace, to edit next.
   */
  readonly file: string;

  /**
   * The layout the slide starts from.
   */
  readonly layout: string;

  /**
   * The slide it follows, or null when it was appended.
   */
  readonly after: string | null;
};

/**
 * The deck's slide list after a reorder or a removal.
 */
export type SlideListResult = {
  /**
   * The slide ids in the deck config's order.
   */
  readonly slides: readonly string[];

  /**
   * The file deleted, relative to the workspace root, or null.
   */
  readonly removed: string | null;
};

/**
 * The operations behind the deck MCP tools (and the manifest lookup the agent host uses). The MCP
 * layer only validates input and shapes output; each operation wraps a service the CLI already has.
 * `JSON` results are exactly what the matching `--json` command prints.
 */
export type DeckToolsApi = {
  /**
   * The slide, step and selection the user is looking at.
   */
  readonly currentSlide: Effect.Effect<CurrentSlide, AgentError>;

  /**
   * The slides in order with titles, layouts, steps, budgets and notes length.
   */
  readonly deckOutline: Effect.Effect<DeckOutline, AgentError>;

  /**
   * The file of a slide the deck config lists, relative to the workspace root, read from the
   * manifest without opening a page; undefined when the deck lists no such slide.
   *
   * @param id - The slide id.
   */
  readonly slideFile: (id: string) => Effect.Effect<string | undefined, AgentError>;

  /**
   * The brand the deck renders with: the dev server's `--brand`, else the deck config's, else the
   * default brand. Never what a page reports.
   */
  readonly brandName: Effect.Effect<string, AgentError>;

  /**
   * The lint report of the deck, or of one slide: `{ ok, summary, findings }`.
   */
  readonly deckLint: (input: DeckLintInput) => Effect.Effect<unknown, AgentError>;

  /**
   * A PNG of one slide at one step.
   */
  readonly deckScreenshot: (
    input: DeckScreenshotInput,
  ) => Effect.Effect<ScreenshotResult, AgentError>;

  /**
   * A catalog, or one entry of it.
   */
  readonly catalog: (input: CatalogInput) => Effect.Effect<unknown, AgentError>;

  /**
   * Review comments, or the resolution of one.
   */
  readonly comments: (input: CommentsInput) => Effect.Effect<unknown, AgentError>;

  /**
   * Moves the user's window.
   */
  readonly goto: (input: GotoInput) => Effect.Effect<GotoResult, AgentError>;

  /**
   * Scaffolds a slide from a layout's example and lists it in the deck.
   */
  readonly newSlide: (input: NewSlideInput) => Effect.Effect<NewSlideResult, AgentError>;

  /**
   * Puts the deck's slides in a new order by rewriting the `slides` list of the deck config; the
   * list must name every slide once.
   */
  readonly reorderSlides: (input: ReorderSlidesInput) => Effect.Effect<SlideListResult, AgentError>;

  /**
   * Takes a slide out of the deck's `slides` list and deletes its file (undo brings both back).
   */
  readonly removeSlide: (input: RemoveSlideInput) => Effect.Effect<SlideListResult, AgentError>;
};

/**
 * The deck tools, as a service. `@deckster/agent` defines it and serves it over MCP; the CLI
 * provides the real one (`packages/cli/src/agent/deck-tools-live.ts`) because lint and screenshots
 * need its dev server and browser services, and tests provide {@link fakeDeckTools}.
 */
export class DeckTools extends Context.Service<DeckTools, DeckToolsApi>()('agent/DeckTools') {
  /**
   * A layer that serves the given operations.
   *
   * @param api - The operations.
   */
  static layerFrom(api: DeckToolsApi): Layer.Layer<DeckTools> {
    return Layer.succeed(DeckTools, DeckTools.of(api));
  }
}
