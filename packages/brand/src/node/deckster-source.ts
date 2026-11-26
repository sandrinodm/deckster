import { Schema } from 'effect';

/**
 * The file `deckster brand add` writes into the added brand folder, next to `brand.ts`. It is
 * hidden, so a later `brand add` of the brand never copies it on.
 */
export const DECKSTER_SOURCE_FILE = '.deckster-source.json';

/**
 * What `deckster brand add` records about where a brand came from, as the content of
 * {@link DECKSTER_SOURCE_FILE}. The CLI writes it and the build reads it to say why a slide's
 * layout is missing; it holds no secret and never changes the brand.
 */
export const DecksterSource = Schema.Struct({
  /**
   * Where the brand came from, as the author wrote the source, without credentials.
   */
  source: Schema.String,

  /**
   * The full commit the files were fetched at, or null when it is not known.
   */
  commit: Schema.NullOr(Schema.String),

  /**
   * The names of the code layouts of the source brand that were left out, sorted. A code layout is
   * a folder `layouts/<name>/` with a `contract.ts` or `layout.tsx`.
   */
  codeLayoutsSkipped: Schema.Array(Schema.String),
});

/**
 * The decoded form of {@link DecksterSource}.
 */
export type DecksterSource = typeof DecksterSource.Type;
