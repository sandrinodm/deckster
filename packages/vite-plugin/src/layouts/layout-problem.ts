import type { Problem } from '#errors.ts';

/**
 * What can be wrong with a brand's or a deck's code layouts:
 *
 * - `layout-folder-incomplete`: a `layouts/<name>/` folder without `contract.ts` or `layout.tsx`;
 * - `layout-name-mismatch`: the folder name differs from the contract's or the component's name;
 * - `layout-name-clash`: the name is already a kit, engine or brand layout;
 * - `layout-contract-imports`: `contract.ts` imports something a contract may not;
 * - `layout-contract-invalid`: the contract loaded but fails the build's contract checks;
 * - `layout-load-failed`: `contract.ts` threw while loading, or has no default export;
 * - `layout-held`: an agent turn is in flight and the contract was never loaded before it;
 * - `layout-version`: the brand or deck asks for another deckster version;
 * - `layout-code-skipped`: a slide uses a code layout `brand add` left out, or one that only another
 *   brand has.
 */
export type LayoutProblemCode =
  | 'layout-folder-incomplete'
  | 'layout-name-mismatch'
  | 'layout-name-clash'
  | 'layout-contract-imports'
  | 'layout-contract-invalid'
  | 'layout-load-failed'
  | 'layout-held'
  | 'layout-version'
  | 'layout-code-skipped';

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
   * when a file is missing, or the `brand.json` or `deck.config.ts` that declares the version.
   */
  readonly file: string;

  /**
   * The layout the problem belongs to, by folder name. Left out for a problem with every code
   * layout of a brand or deck, such as a version mismatch.
   */
  readonly layout?: string;
};
