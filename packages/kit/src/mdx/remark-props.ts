import { propsProblem } from '#components/check-component-props.ts';
import { JSX_TYPES, walk, type EstreeNode, type MdastNode } from '#mdx/mdast.ts';

/**
 * The parts of a vfile the plugin uses.
 */
export type PropsFile = {
  /**
   * Throws a build error that names the slide and line of `place`.
   */
  fail: (reason: string, place?: unknown, origin?: string) => never;
};

/**
 * A remark plugin that checks the attributes of the kit's components (`deckster components`) as the
 * slide writes them: an attribute a component does not take fails the build with the closest one it
 * does (`<Download href>` names `file`), and so does a required attribute left out. An element that
 * spreads props (`{...props}`) is checked only for the names it writes, and a name the slide
 * imports is its own component, not the kit's, and is left alone.
 */
export function remarkKitProps(): (tree: MdastNode, file: PropsFile) => void {
  return (tree, file) => {
    const imported = importedNames(tree);
    walk(tree, (node) => {
      if (!JSX_TYPES.has(node.type) || typeof node.name !== 'string' || imported.has(node.name)) {
        return false;
      }

      const attributes = node.attributes ?? [];
      const given = attributes.flatMap((attribute) =>
        attribute.type === 'mdxJsxAttribute' && attribute.name !== undefined
          ? [attribute.name]
          : [],
      );
      const spreads = attributes.some((attribute) => attribute.type !== 'mdxJsxAttribute');
      const problem = propsProblem({ name: node.name, given, checkRequired: !spreads });
      if (problem !== undefined) {
        file.fail(problem, node, 'deck:component-props');
      }

      return false;
    });
  };
}

/**
 * The local names the slide's `import` statements bind.
 *
 * @param tree - The mdast root.
 */
function importedNames(tree: MdastNode): Set<string> {
  const imports = (tree.children ?? []).filter((node) => node.type === 'mdxjsEsm');
  return new Set(imports.flatMap((node) => localNames(node)));
}

/**
 * The local names one `import` block binds, such as `Download` for `import Download from ...`.
 *
 * @param esm - An `mdxjsEsm` node.
 */
function localNames(esm: MdastNode): string[] {
  const body = esm.data?.estree?.['body'];
  const statements = Array.isArray(body) ? (body as EstreeNode[]) : [];
  const specifiers = statements.flatMap((statement) => {
    const list = statement['specifiers'];
    return Array.isArray(list) ? (list as EstreeNode[]) : [];
  });
  return specifiers.flatMap((specifier) => {
    const local = specifier['local'] as EstreeNode | undefined;
    const name = local?.['name'];
    return typeof name === 'string' ? [name] : [];
  });
}
