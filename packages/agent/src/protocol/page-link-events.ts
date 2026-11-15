/**
 * The HMR custom event a deck page sends to the dev server to say where it is.
 */
export const PAGE_STATE_EVENT = 'deck:page-state';

/**
 * The HMR custom event the dev server sends a page to move it.
 */
export const PAGE_GOTO_EVENT = 'deck:page-goto';

/**
 * The HMR custom event a page sends back once it applied (or failed to apply) a goto request.
 */
export const PAGE_GOTO_DONE_EVENT = 'deck:page-goto-done';

/**
 * What a page reports: the slide and step on screen, the selected text and when the window was last
 * focused. Plain data, so the browser needs no schema library.
 */
export type PageStateReport = {
  /**
   * A random id the page made when it loaded, to tell pages apart.
   */
  readonly page: string;

  /**
   * Set when the page is going away; the server forgets it.
   */
  readonly closed: boolean;

  /**
   * Epoch milliseconds when the window last gained focus or became visible; 0 when it never has.
   */
  readonly focusedAt: number;

  /**
   * The slide on screen.
   */
  readonly slide: {
    /**
     * The slide id.
     */
    readonly id: string;

    /**
     * The zero-based position of the slide in the deck.
     */
    readonly index: number;

    /**
     * The slide file relative to the deck folder, such as `slides/title.mdx`.
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
   * The slide's step count once known, else 0.
   */
  readonly stepCount: number;

  /**
   * The brand the deck renders with.
   */
  readonly brand: string;

  /**
   * The text the user has selected on the page, trimmed and cut to a few thousand characters.
   */
  readonly selection: string;
};

/**
 * A request to move a page.
 */
export type PageGotoRequest = {
  /**
   * Correlates the answer.
   */
  readonly request: string;

  /**
   * The slide id.
   */
  readonly slide: string;

  /**
   * The step to show, from 0.
   */
  readonly step: number;
};

/**
 * A page's answer to a {@link PageGotoRequest}.
 */
export type PageGotoDone = {
  /**
   * The request this answers.
   */
  readonly request: string;

  /**
   * Whether the page moved.
   */
  readonly ok: boolean;

  /**
   * Why it did not, when `ok` is false.
   */
  readonly error: string;

  /**
   * The slide and step on screen after the move.
   */
  readonly slide: string;

  /**
   * The step on screen after the move.
   */
  readonly step: number;
};
