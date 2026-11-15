import { Effect, Predicate, Result, Schema, SchemaIssue } from 'effect';

import { invalidFields, type DeckBuildError, type FileRef, type Problem } from '#errors.ts';
import { suggest } from '#suggest.ts';

/**
 * The message Effect Schema gives a required field that is missing.
 */
const MISSING_KEY_MESSAGE = 'Missing key';

/**
 * The messages Effect Schema gives a key a struct does not define, when excess keys are errors.
 */
const EXCESS_KEY_PATTERN = /^(?:Unexpected key|Expected no excess property)/u;

/**
 * Flattens a schema issue into one entry per field, each with its path and message.
 */
const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

/**
 * The longest string a message quotes whole; a longer one is quoted by its start and its length,
 * which is what a length limit is about.
 */
const QUOTE_MAX_CHARS = 24;

/**
 * A struct schema that decodes without services, which every config and frontmatter schema is.
 */
type FieldsSchema = Schema.Struct<Schema.Struct.Fields> & Schema.ConstraintDecoder<unknown>;

/**
 * What to decode and how to explain failures.
 */
export type DecodeFieldsOptions<S extends FieldsSchema> = {
  /**
   * The struct schema the fields must match.
   */
  schema: S;

  /**
   * A fix per top-level field, appended to every problem with that field.
   */
  hints: Readonly<Record<string, string>>;

  /**
   * What the fields are, for messages: "frontmatter", "deck config".
   */
  what: string;

  /**
   * The file the fields come from, named in the error.
   */
  ref: FileRef;

  /**
   * A fix for an unknown key that knows more than the schema, such as which other layouts have the
   * field; when it returns `undefined` the fix suggests the closest known key or lists them all.
   */
  unknownKeyFix?: (key: string) => string | undefined;
};

/**
 * A problem from a schema issue, marked when it is about a top-level key the schema does not define
 * (reported separately, with a "did you mean" fix).
 */
type IssueProblem = Problem & {
  /**
   * Whether the issue is an unknown top-level key.
   */
  topLevelUnknown: boolean;
};

/**
 * Decodes a record of fields against a struct schema and reports every problem at once: unknown
 * keys (with a "did you mean" fix when one is close), missing keys and invalid values (with the
 * value that was given and the field's fix).
 *
 * @param input - The parsed fields.
 * @param options - The schema, the fix per field, what the fields are, and the file.
 * @returns The decoded value, with schema defaults applied.
 * @throws DeckBuildError in the error channel, listing every problem and naming the file.
 */
export const decodeFields = Effect.fn('decodeFields')(function* <S extends FieldsSchema>(
  input: Readonly<Record<string, unknown>>,
  options: DecodeFieldsOptions<S>,
): Effect.fn.Return<S['Type'], DeckBuildError> {
  const known = Object.keys(options.schema.fields);
  const unknownKeys = unknownKeyProblems(input, known, options);
  // Nested structs (a list of stats, say) reject keys they do not define too; the unknown top-level
  // keys are reported above with a "did you mean" fix, so their schema issues are dropped.
  const decoded = Schema.decodeUnknownResult(options.schema, {
    errors: 'all',
    onExcessProperty: 'error',
  })(input);
  if (Result.isSuccess(decoded) && unknownKeys.length === 0) {
    return decoded.success;
  }

  const invalid = Result.isFailure(decoded)
    ? issueProblems(decoded.failure.issue, input, options).filter(
        (problem) => !problem.topLevelUnknown,
      )
    : [];
  return yield* invalidFields(options.ref, options.what, [...unknownKeys, ...invalid]);
});

/**
 * Describes a value briefly for "got ..." messages.
 *
 * @param value - Any parsed value; strings are quoted, objects summarized.
 */
export function describeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return 'a list';
  }

  if (Predicate.isObject(value)) {
    return 'a set of fields';
  }

  return JSON.stringify(value) ?? String(value);
}

/**
 * Describes a rejected field value for "got ..." messages: a list by its length, a long string by
 * its start and its length, anything else as {@link describeValue} does.
 *
 * @param value - The value the field was given.
 */
export function describeGiven(value: unknown): string {
  if (Array.isArray(value)) {
    return `a list of ${value.length} item${value.length === 1 ? '' : 's'}`;
  }

  if (typeof value === 'string' && value.length > QUOTE_MAX_CHARS) {
    const start = `${value.slice(0, QUOTE_MAX_CHARS - 1)}…`;
    return `${JSON.stringify(start)} (${value.length} characters)`;
  }

  return describeValue(value);
}

/**
 * A problem for each key the schema does not define, with the caller's fix, else the closest known
 * key, else every known key.
 *
 * @param input - The parsed fields.
 * @param known - The keys the schema defines.
 * @param options - What the fields are, and the caller's fix for unknown keys.
 */
function unknownKeyProblems<S extends FieldsSchema>(
  input: Readonly<Record<string, unknown>>,
  known: readonly string[],
  options: DecodeFieldsOptions<S>,
): Problem[] {
  return Object.keys(input)
    .filter((key) => !known.includes(key))
    .map((key) => ({
      message: `"${key}" is not a ${options.what} field.`,
      fix: options.unknownKeyFix?.(key) ?? closestKeyFix(key, known),
    }));
}

/**
 * The fix for an unknown key: rename it to the closest known key, or remove it and see the list.
 *
 * @param key - The unknown key.
 * @param known - The keys the schema defines.
 */
function closestKeyFix(key: string, known: readonly string[]): string {
  const closest = suggest(key, known);
  return closest === undefined
    ? `Remove it. Known fields: ${known.join(', ')}.`
    : `Rename it to "${closest}".`;
}

/**
 * A problem for each field the schema rejects: missing, or with the value that was given and the
 * field's fix.
 *
 * @param issue - The schema's issue for the whole record.
 * @param input - The parsed fields, to quote the given values.
 * @param options - The fixes per field.
 */
function issueProblems<S extends FieldsSchema>(
  issue: SchemaIssue.Issue,
  input: Readonly<Record<string, unknown>>,
  options: DecodeFieldsOptions<S>,
): IssueProblem[] {
  const known = new Set(Object.keys(options.schema.fields));
  return formatIssues(issue).issues.map(({ path = [], message }) => {
    const keys = path.map((segment) => (typeof segment === 'object' ? segment.key : segment));
    const field = String(keys[0] ?? '');
    const label = formatPath(keys);
    const hint = Object.hasOwn(options.hints, field) ? options.hints[field] : undefined;
    const fix = hint ?? `Check the "${label}" field.`;
    const topLevelUnknown = keys.length === 1 && !known.has(field);
    if (message === MISSING_KEY_MESSAGE) {
      return { message: `${label} is required.`, fix, topLevelUnknown };
    }

    if (EXCESS_KEY_PATTERN.test(message)) {
      const where = formatPath(keys.slice(0, -1));
      return {
        message: `${label} is not a field of ${where}.`,
        fix: `Remove "${String(keys.at(-1))}" or fix its spelling. ${fix}`,
        topLevelUnknown,
      };
    }

    const given = describeGiven(valueAt(input, keys));
    return { message: `${label}: ${message}, got ${given}.`, fix, topLevelUnknown };
  });
}

/**
 * Formats a field path the way authors write it: `slides[0]`, `brand.name`.
 *
 * @param keys - Path segments; numbers become indexes.
 */
function formatPath(keys: readonly PropertyKey[]): string {
  return keys
    .map((key, index) => {
      if (typeof key === 'number') {
        return `[${key}]`;
      }

      return index === 0 ? String(key) : `.${String(key)}`;
    })
    .join('');
}

/**
 * The value at a path, or `undefined` when the path leaves the objects and lists of the input.
 *
 * @param input - Any value.
 * @param keys - The path to follow.
 */
function valueAt(input: unknown, keys: readonly PropertyKey[]): unknown {
  let value = input;
  for (const key of keys) {
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }

    value = Reflect.get(value, key);
  }

  return value;
}
