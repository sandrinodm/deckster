import { Predicate } from 'effect';
import path from 'node:path';

/**
 * The longest detail kept from a tool result or error, in characters.
 */
const MAX_DETAIL_CHARS = 300;

/**
 * A run of whitespace, of any length, to collapse into one space.
 */
const WHITESPACE_RUN = /\s+/g;

/**
 * Parses one line of JSONL into an object, or undefined when it is blank, not JSON or not an
 * object. Providers sometimes print other text; it is skipped, never thrown.
 *
 * @param line - One line of output.
 */
export function readJsonObject(line: string): Record<string, unknown> | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) {
    return undefined;
  }

  try {
    const value: unknown = JSON.parse(trimmed);
    return Predicate.isObject(value) && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The value as an object, or an empty one.
 *
 * @param value - Any value.
 */
export function record(value: unknown): Record<string, unknown> {
  return Predicate.isObject(value) && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * The value as an array, or an empty one.
 *
 * @param value - Any value.
 */
export function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * The value when it is a string, else undefined.
 *
 * @param value - Any value.
 */
export function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * The value when it is a finite number, else 0.
 *
 * @param value - Any value.
 */
export function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * A path the provider reported, relative to the workspace root with forward slashes; a path outside
 * the root stays absolute. The root's real path under `/private` counts as the root. A path inside
 * an alias's folder (the turn's working copy) is shown as the same path in the folder it stands
 * for.
 *
 * @param root - The absolute workspace root.
 * @param file - The reported path.
 * @param aliases - Folders shown as other folders.
 */
export function workspacePath(
  root: string,
  file: string,
  aliases: readonly { readonly from: string; readonly to: string }[] = [],
): string {
  let absolute = path.resolve(root, file);
  for (const alias of aliases) {
    for (const from of [alias.from, `/private${alias.from}`]) {
      if (absolute === from || absolute.startsWith(`${from}${path.sep}`)) {
        absolute = path.join(alias.to, path.relative(from, absolute));
      }
    }
  }

  // On macOS the CLIs report real paths: a root under /var or /tmp comes back under /private.
  for (const base of [root, `/private${root}`]) {
    const relative = path.relative(base, absolute);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      return relative.split(path.sep).join('/');
    }
  }

  return absolute;
}

/**
 * Cuts a text to one short paragraph for the panel.
 *
 * @param value - The text.
 */
export function shorten(value: string): string {
  const flat = value.replaceAll(WHITESPACE_RUN, ' ').trim();
  return flat.length > MAX_DETAIL_CHARS ? `${flat.slice(0, MAX_DETAIL_CHARS - 1)}…` : flat;
}
