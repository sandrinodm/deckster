import type { Problem } from '#errors.ts';

/**
 * What can be wrong with a brand's or a deck's code layouts:
 *
 * - `layout-folder-incomplete`: a `layouts/<name>/` folder without `contract.ts` or `layout.tsx`;
 * - `layout-name-mismatch`: the folder name differs from the contract's or the component's name;
 * - `layout-name-clash`: the name is already a kit, engine or brand layout, and the contract does not
 *   say `replaces: true`;
 * - `layout-replace-breaks`: the layout replaces a kit or engine layout, and slides written for that
 *   layout would stop building (a field, slot or title it drops or narrows, an example it
 *   rejects);
 * - `layout-replace-pptx`: a warning: the replaced layout has a PowerPoint mapping, and the
 *   replacement has none;
 * - `layout-replace-budget`: a note: a budget or title limit differs from the replaced layout's;
 * - `layout-contract-imports`: `contract.ts` imports something a contract may not;
 * - `layout-contract-invalid`: the contract loaded but fails the build's contract checks;
 * - `layout-load-failed`: `contract.ts` threw while loading, or has no default export;
 * - `layout-held`: an agent turn is in flight and the contract was never loaded before it;
 * - `layout-version`: the brand or deck asks for another deckster version;
 * - `layout-code-skipped`: a slide uses a code layout `brand add` left out, or one that only another
 *   brand has;
 * - `layout-fallback-unavailable`: a data layout of the brand falls back to one of the brand's code
 *   layouts that did not load, so it is left out too.
 */
export type LayoutProblemCode =
  | 'layout-folder-incomplete'
  | 'layout-name-mismatch'
  | 'layout-name-clash'
  | 'layout-replace-breaks'
  | 'layout-replace-pptx'
  | 'layout-replace-budget'
  | 'layout-contract-imports'
  | 'layout-contract-invalid'
  | 'layout-load-failed'
  | 'layout-held'
  | 'layout-version'
  | 'layout-code-skipped'
  | 'layout-fallback-unavailable';

/**
 * One thing wrong with a code layout, as a value: a caller lists the other layouts all the same,
 * and only the slides that name the layout fail.
 */
export type LayoutProblem = Problem & {
  /**
   * Which kind of problem it is.
   */
  readonly code: LayoutProblemCode;

  /**
   * The absolute path of the file at fault: the layout's `contract.ts` or `layout.tsx`, its folder
   * when a file is missing, a symbolic link where one of those belongs, the `brand.json` or
   * `deck.config.ts` that declares the version, or the brand's `layouts.ts` for a data layout
   * (`layout-fallback-unavailable`).
   */
  readonly file: string;

  /**
   * The layout the problem belongs to, by folder name (a data layout's name in `layouts.ts` for
   * `layout-fallback-unavailable`). Left out for a problem with every code layout of a brand or
   * deck, such as a version mismatch.
   */
  readonly layout?: string;

  /**
   * How much it matters, set only on what is not an error: `warning` for something a deck loses
   * (`layout-replace-pptx`, or `layout-fallback-unavailable` when the code was skipped), `note` for
   * a change worth knowing (`layout-replace-budget`). Those are listed in `LocalLayouts.warnings`,
   * never in `problems`, and fail no slide.
   */
  readonly level?: 'warning' | 'note';
};
