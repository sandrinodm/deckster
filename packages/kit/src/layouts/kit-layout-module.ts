/**
 * Where a kit layout's component lives, which the deck plugin relies on to import each kit layout
 * on its own.
 */
export type KitLayoutModule = {
  /**
   * The module, relative to the kit's `src/` folder, with forward slashes:
   * `layouts/<name>-layout.tsx`.
   */
  readonly file: string;

  /**
   * The name it exports the layout's definition under: `<camelName>Layout`.
   */
  readonly exportName: string;
};

/**
 * The pattern of a hyphen and the letter or digit after it, in a kebab-case name.
 */
const KEBAB_JOIN_PATTERN = /-([a-z0-9])/gu;

/**
 * The module of a kit layout and its export: `do-dont` is `doDontLayout` in
 * `layouts/do-dont-layout.tsx`. Every layout in the kit's catalog follows it, which a kit test
 * asserts.
 *
 * @param name - A kit layout name, in kebab-case.
 * @returns The file and the export name; for a name the kit does not have, the module it would
 *   have, which does not exist.
 */
export function kitLayoutModule(name: string): KitLayoutModule {
  const camel = name.replaceAll(KEBAB_JOIN_PATTERN, (_, letter: string) => letter.toUpperCase());
  return { file: `layouts/${name}-layout.tsx`, exportName: `${camel}Layout` };
}
