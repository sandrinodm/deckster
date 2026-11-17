/**
 * What an MDX extension knows about the deck it compiles for.
 */
export type MdxContext = {
  /**
   * The absolute workspace root, the folder that contains `decks/`.
   */
  workspaceRoot: string;

  /**
   * The absolute folder of the deck being compiled.
   */
  deckDir: string;

  /**
   * The parts of the deck's brand that build-time transforms read.
   */
  brand: {
    /**
     * The brand name.
     */
    name: string;

    /**
     * The brand's icon set and the stroke width it draws icons with.
     */
    icons: { set: string; strokeWidth: number };

    /**
     * The names of the brand's image treatments, `plain` (which every brand has) among them.
     */
    treatments: readonly string[];
  };
};

/**
 * The remark and rehype plugins an extension adds to every slide's MDX compile. Entries are unified
 * plugins or `[plugin, options]` pairs, as `@mdx-js/mdx` accepts them. A plugin reports a problem
 * with `file.message(...)` (a warning the build prints) or `file.fail(...)` (a build error that
 * names the slide and line). On a slide, `file.data.frontmatter` is the slide's validated
 * frontmatter, with the layout's defaults applied.
 */
export type MdxPlugins = {
  /**
   * Plugins that run on the markdown tree, before MDX turns it into JavaScript.
   */
  remarkPlugins?: readonly unknown[];

  /**
   * Plugins that run on the HTML tree.
   */
  rehypePlugins?: readonly unknown[];
};

/**
 * A build-time extension of the MDX pipeline, loaded in Node by `@deckster/vite-plugin` from the
 * modules its `mdxExtensions` option lists. The kit uses one to highlight code and to turn media
 * and icon tags into imports, so none of that work ships to the browser.
 */
export type MdxExtension = {
  /**
   * A unique name, used in error messages.
   */
  name: string;

  /**
   * Creates the plugins for one deck. It runs for every slide, so keep any expensive state (such as
   * a highlighter) in the module, not in this function.
   */
  plugins: (context: MdxContext) => MdxPlugins;
};

/**
 * Declares an MDX extension; it returns its argument unchanged and exists for type inference.
 *
 * @param extension - What the extension contributes.
 */
export function defineMdxExtension(extension: MdxExtension): MdxExtension {
  return extension;
}
