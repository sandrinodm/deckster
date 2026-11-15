import path from 'node:path';

/**
 * The export conditions to follow, most specific first. `types` wins because it names the
 * declaration file; the rest give a JavaScript file whose declaration TypeScript finds beside it.
 */
const CONDITIONS = ['types', 'import', 'node', 'default'];

/**
 * Turns a package's `exports` into `compilerOptions.paths` entries. TypeScript does not read
 * `exports` for a path mapped to a folder, so each public specifier is mapped to its file instead.
 * Targets with a wildcard keep it: `./*` becomes `<name>/*` mapped to `<dir>/dist/*`. A `.js`
 * target loses its extension so TypeScript finds the `.d.ts` beside it.
 *
 * @param name - The specifier the package is imported by, such as `effect`.
 * @param dir - The folder of the package that holds the types (the `@types` package when the
 *   package has none of its own).
 * @param manifest - That package's parsed `package.json`.
 * @returns The entries; empty when the manifest has no `exports`.
 */
export function packagePaths(
  name: string,
  dir: string,
  manifest: unknown,
): Record<string, string[]> {
  const exports =
    typeof manifest === 'object' && manifest !== null && 'exports' in manifest
      ? manifest.exports
      : undefined;
  if (typeof exports !== 'object' || exports === null || Array.isArray(exports)) {
    return {};
  }

  const paths: Record<string, string[]> = {};
  for (const [subpath, value] of Object.entries(exports)) {
    const target = pickTarget(value);
    if (subpath.startsWith('.') && subpath !== './package.json' && target !== undefined) {
      paths[subpath === '.' ? name : `${name}${subpath.slice(1)}`] = [
        path.join(dir, withoutScriptExtension(target)),
      ];
    }
  }

  return paths;
}

/**
 * Drops a `.js` extension, so TypeScript looks for the declaration beside the script. A path that
 * names an existing `.js` file is taken as that file, with no types.
 *
 * @param target - A path relative to the package.
 */
function withoutScriptExtension(target: string): string {
  return target.endsWith('.js') ? target.slice(0, -'.js'.length) : target;
}

/**
 * The file an `exports` value names, following the conditions in order.
 *
 * @param value - A string, a conditions object, an array of those, or `null`.
 * @returns The relative file, or `undefined` when nothing usable is named.
 */
function pickTarget(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(pickTarget).find((target) => target !== undefined);
  }

  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const conditions = new Map(Object.entries(value));
  for (const condition of CONDITIONS) {
    const target = pickTarget(conditions.get(condition));
    if (target !== undefined) {
      return target;
    }
  }

  return undefined;
}
