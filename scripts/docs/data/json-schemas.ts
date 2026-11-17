import { Brand } from '@deckster/brand';
import { DeckConfig } from '@deckster/engine/config';
import { Schema } from 'effect';

/**
 * The JSON Schema dialect every exported schema declares.
 */
const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/**
 * A JSON Schema document as plain JSON.
 */
export type DocsJsonSchema = Readonly<Record<string, unknown>>;

/**
 * The JSON Schema of `brands/<name>/brand.ts`, the value its `defineBrand` call takes: every token
 * field, which are required, and which nested objects are open maps (the palette, the surfaces).
 * Objects reject fields they do not name, as the brand loader does.
 *
 * Regex checks (brand and slide names, colors) are left out, because Effect exports a pattern only
 * for a regex with the `u` flag, and the schemas carry no descriptions or defaults: those live in
 * doc comments that the schema cannot see.
 *
 * @returns The schema, equal on every call for the same source.
 */
export function brandJsonSchema(): DocsJsonSchema {
  return jsonSchemaOf(Brand);
}

/**
 * The JSON Schema of `decks/<deck>/deck.config.ts`, the value its `defineDeck` call takes: `title`,
 * `slides`, `brand`, `mouseNavigation` and `duration`. It rejects fields it does not name, as the
 * build does, and has the same gaps as {@link brandJsonSchema}.
 *
 * @returns The schema, equal on every call for the same source.
 */
export function deckConfigJsonSchema(): DocsJsonSchema {
  return jsonSchemaOf(DeckConfig);
}

/**
 * A schema's encoded side as a JSON Schema document whose objects reject unknown fields, with its
 * shared definitions under `$defs` when it has any.
 *
 * @param schema - A schema.
 */
function jsonSchemaOf(schema: Schema.Top): DocsJsonSchema {
  const document = Schema.toJsonSchemaDocument(schema, { onExcessProperty: 'error' });
  const definitions =
    Object.keys(document.definitions).length === 0 ? {} : { $defs: document.definitions };
  return { $schema: JSON_SCHEMA_DIALECT, ...document.schema, ...definitions };
}
