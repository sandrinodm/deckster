import { Schema } from 'effect';

/**
 * Matches lowercase words joined by single hyphens, such as `request-flow`.
 */
export const KEBAB_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Builds a string schema for a kebab-case name, used for slide ids, layout names and surfaces.
 *
 * @param kind - What the name identifies, used in the failure message ("slide id", "layout").
 * @returns A schema that rejects empty strings, uppercase letters, spaces and repeated hyphens.
 */
export function KebabName(kind: string): Schema.String {
  return Schema.String.check(
    Schema.isPattern(KEBAB_CASE_PATTERN, {
      message: `Expected a ${kind} in kebab-case, such as "request-flow"`,
    }),
  );
}
