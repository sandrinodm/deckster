import { createRequire } from 'node:module';

import { failBuild, type KitFile } from '#mdx/kit-file.ts';
import {
  attributeValue,
  defaultImport,
  findAttribute,
  identifierAttribute,
  walk,
  type EstreeNode,
  type MdastNode,
} from '#mdx/mdast.ts';
import { nearestNames } from '#mdx/nearest-names.ts';

/**
 * The parts of a vfile the plugin uses.
 */
export type IconFile = Pick<KitFile, 'fail'>;

/**
 * Options of {@link remarkKitIcons}.
 */
export type IconOptions = {
  /**
   * The Iconify set the brand uses, such as `lucide`; the set a bare icon name comes from.
   */
  set: string;
};

/**
 * The names a set's `icons.json` defines.
 */
type IconSet = {
  /**
   * The icon ids.
   */
  icons: Record<string, unknown>;

  /**
   * Alternative ids for icons.
   */
  aliases?: Record<string, unknown>;
};

/**
 * The most suggestions an unknown icon name gets.
 */
const MAX_SUGGESTIONS = 6;

/**
 * Icon sets read so far, by set id.
 */
const sets = new Map<string, IconSet>();

/**
 * The kit's own `require`, so icon sets resolve from the kit's dependencies.
 */
const require = createRequire(import.meta.url);

/**
 * A remark plugin that resolves `<Icon name="rocket" />` at build time. The name is looked up in
 * the brand's icon set (or in `set:name` form, another installed set), checked, and replaced by an
 * import of `~icons/<set>/<name>`, which `unplugin-icons` serves as a React component. Only the
 * icons the slides name end up in the bundle. An unknown name fails the build with the set's
 * closest names as the fix. An `<Icon>` written inside a JavaScript expression, such as the `icon`
 * prop of `<LinkCard icon={<Icon name="book" />}>`, is resolved the same way.
 *
 * @param options - The brand's icon set.
 */
export function remarkKitIcons(options: IconOptions): (tree: MdastNode, file: IconFile) => void {
  return (tree, file) => {
    const imports: MdastNode[] = [];
    const locals = new Map<string, string>();
    /**
     * The binding of an icon's component, checked and imported the first time a slide names it.
     *
     * @param name - The name as written.
     * @param node - The element or expression it is written in, for the place of a failure.
     */
    const bindingOf = (name: string, node: MdastNode): string => {
      const { set, icon } = splitName(name, options.set);
      checkIcon(set, icon, name, node, file);
      const id = `${set}/${icon}`;
      let local = locals.get(id);
      if (local === undefined) {
        local = `kitIcon${locals.size}`;
        locals.set(id, local);
        imports.push(defaultImport(local, `~icons/${id}`));
      }

      return local;
    };
    walk(tree, (node) => {
      for (const program of expressionPrograms(node)) {
        resolveExpressionIcons(program, (name) => bindingOf(name, node));
      }

      const name = node.name === 'Icon' ? attributeValue(node, 'name') : undefined;
      if (typeof name !== 'string' || findAttribute(node, 'icon') !== undefined) {
        return false;
      }

      node.attributes?.push(identifierAttribute('icon', bindingOf(name, node)));
      return false;
    });
    tree.children = [...imports, ...(tree.children ?? [])];
  };
}

/**
 * Splits `set:name` into its parts; a bare name uses the brand's set.
 *
 * @param name - The name as written.
 * @param fallback - The brand's set.
 */
export function splitName(name: string, fallback: string): { set: string; icon: string } {
  const [first, second] = name.split(':');
  return second === undefined
    ? { set: fallback, icon: name }
    : { set: first ?? fallback, icon: second };
}

/**
 * Fails the build when the set is not installed or does not have the icon, with the closest names
 * the set has as the fix.
 *
 * @param set - The set id.
 * @param icon - The icon id.
 * @param written - The name as written, for the message.
 * @param node - The element, for the place.
 * @param file - The vfile.
 */
export function checkIcon(
  set: string,
  icon: string,
  written: string,
  node: MdastNode,
  file: IconFile,
): void {
  if (!hasIcon(set, icon)) {
    failBuild(
      file,
      {
        rule: 'icon-unknown',
        problem: `<Icon name="${written}"> ${unknownIconReason(set)}`,
        fix: unknownIconFix(set, icon),
      },
      node,
    );
  }
}

/**
 * Why an icon name was not found, to follow the name in a message: the set is not installed, or
 * does not have it.
 *
 * @param set - The set id.
 */
export function unknownIconReason(set: string): string {
  return readSet(set) === undefined
    ? `needs the "${set}" icon set, which is not installed.`
    : `is not an icon of the ${set} set.`;
}

/**
 * The fix for an icon name a set does not have: the set, the closest names it has and where to
 * browse it; or, for a set that is not installed, how to add it.
 *
 * @param set - The set id.
 * @param icon - The icon id as written.
 */
export function unknownIconFix(set: string, icon: string): string {
  const data = readSet(set);
  if (data === undefined) {
    return (
      `Add \`@iconify-json/${set}\` to @deckster/kit, or use a name from the brand's set without the ` +
      '`set:` prefix.'
    );
  }

  const near = nearestNames(
    icon,
    [...Object.keys(data.icons), ...Object.keys(data.aliases ?? {})],
    MAX_SUGGESTIONS,
  );
  const choice =
    near.length === 0
      ? `No name in the ${set} set is close to "${icon}".`
      : `Closest names in the ${set} set: ${near.join(', ')}.`;
  return (
    `${choice} Browse the set at https://icon-sets.iconify.design/${set}/. A deck that renders ` +
    "in several brands needs a name that every brand's set has."
  );
}

/**
 * Whether an installed Iconify set has an icon, by name or alias.
 *
 * @param set - The set id.
 * @param icon - The icon id.
 * @returns `false` when the set is not installed or lacks the icon.
 */
export function hasIcon(set: string, icon: string): boolean {
  const data = readSet(set);
  return (
    data !== undefined &&
    (icon in data.icons || (data.aliases !== undefined && icon in data.aliases))
  );
}

/**
 * Reads an installed Iconify set, once.
 *
 * @param set - The set id.
 * @returns The set; `undefined` when its package is not installed.
 */
function readSet(set: string): IconSet | undefined {
  const known = sets.get(set);
  if (known !== undefined) {
    return known;
  }

  try {
    const data = require(`@iconify-json/${set}/icons.json`) as IconSet;
    sets.set(set, data);
    return data;
  } catch {
    return undefined;
  }
}

/**
 * The programs of a node's JavaScript expressions: a `{...}` expression's own, and those of its
 * attributes written as expressions (`icon={<Icon name="book" />}`). ESM blocks are left alone.
 *
 * @param node - Any mdast node.
 */
function expressionPrograms(node: MdastNode): EstreeNode[] {
  const programs: EstreeNode[] = [];
  if (node.type !== 'mdxjsEsm' && node.data?.estree !== undefined) {
    programs.push(node.data.estree);
  }

  for (const attribute of node.attributes ?? []) {
    const value = attribute.value;
    if (typeof value === 'object' && value !== null && value.data?.estree !== undefined) {
      programs.push(value.data.estree);
    }
  }

  return programs;
}

/**
 * Gives every `<Icon name="...">` inside a JavaScript expression the `icon` its name resolves to,
 * as the plugin does for an `<Icon>` written as an element of the slide. An `<Icon>` that already
 * has an `icon`, or whose name is not a literal string, is left as written.
 *
 * @param program - The expression's program.
 * @param bindingOf - The imported binding of a name; it fails the build for an unknown one.
 */
function resolveExpressionIcons(program: EstreeNode, bindingOf: (name: string) => string): void {
  walkEstree(program, (node) => {
    if (node.type !== 'JSXOpeningElement' || jsxName(node.name) !== 'Icon') {
      return;
    }

    const attributes = node.attributes as EstreeNode[];
    if (jsxAttribute(attributes, 'icon') !== undefined) {
      return;
    }

    const name = literalString(jsxAttribute(attributes, 'name')?.value);
    if (name === undefined) {
      return;
    }

    attributes.push({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'icon' },
      value: {
        type: 'JSXExpressionContainer',
        expression: { type: 'Identifier', name: bindingOf(name) },
      },
    });
  });
}

/**
 * Calls the visitor on every estree node under a node, depth first.
 *
 * @param node - The root.
 * @param visitor - Called with each node.
 */
function walkEstree(node: EstreeNode, visitor: (node: EstreeNode) => void): void {
  visitor(node);
  for (const [key, value] of Object.entries(node)) {
    // Source positions and comments are not part of the tree.
    if (key === 'loc' || key === 'range' || key === 'comments') {
      continue;
    }

    for (const child of Array.isArray(value) ? value : [value]) {
      if (isEstreeNode(child)) {
        walkEstree(child, visitor);
      }
    }
  }
}

/**
 * Whether a value is an estree node.
 *
 * @param value - Any field of a node.
 */
function isEstreeNode(value: unknown): value is EstreeNode {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'type') === 'string'
  );
}

/**
 * The name of a JSX element, when it is a plain identifier such as `Icon`.
 *
 * @param name - The opening element's `name`.
 */
function jsxName(name: unknown): string | undefined {
  return isEstreeNode(name) && name.type === 'JSXIdentifier' ? String(name.name) : undefined;
}

/**
 * The attribute with a name among a JSX element's attributes.
 *
 * @param attributes - The opening element's attributes.
 * @param name - The attribute name.
 */
function jsxAttribute(attributes: readonly EstreeNode[], name: string): EstreeNode | undefined {
  return attributes.find(
    (attribute) => attribute.type === 'JSXAttribute' && jsxName(attribute.name) === name,
  );
}

/**
 * The string an attribute value holds when it is a literal: `name="book"` or `name={'book'}`.
 *
 * @param value - The attribute's value.
 */
function literalString(value: unknown): string | undefined {
  if (!isEstreeNode(value)) {
    return undefined;
  }

  const literal = value.type === 'JSXExpressionContainer' ? value.expression : value;
  return isEstreeNode(literal) && literal.type === 'Literal' && typeof literal.value === 'string'
    ? literal.value
    : undefined;
}
