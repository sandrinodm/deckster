/**
 * An mdast node, reduced to the fields the kit's remark plugins read and write. MDX adds JSX nodes
 * (`mdxJsxFlowElement`, `mdxJsxTextElement`) and ESM blocks (`mdxjsEsm`) to markdown's own.
 */
export type MdastNode = {
  /**
   * The node type, such as `code` or `mdxJsxFlowElement`.
   */
  type: string;

  /**
   * The element name of a JSX node.
   */
  name?: string | null;

  /**
   * The attributes of a JSX node.
   */
  attributes?: MdxAttribute[];

  /**
   * The text of a text, code or expression node.
   */
  value?: string;

  /**
   * The language of a fenced code block.
   */
  lang?: string | null;

  /**
   * The text after the language of a fenced code block.
   */
  meta?: string | null;

  /**
   * The address of a markdown image or link.
   */
  url?: string;

  /**
   * The alternative text of a markdown image.
   */
  alt?: string | null;

  /**
   * The child nodes.
   */
  children?: MdastNode[];

  /**
   * Parser data; for an expression or ESM node, the program as `estree`.
   */
  data?: { estree?: EstreeNode };

  /**
   * Where the node is in the source, when the parser recorded it: offsets in UTF-16 code units and
   * 1-based columns.
   */
  position?: {
    start: { offset?: number; column?: number; line?: number };
    end: { offset?: number };
  };
};

/**
 * A JSX attribute. Its value is a string, `null` for a bare attribute, or an expression.
 */
export type MdxAttribute = {
  /**
   * `mdxJsxAttribute`, or `mdxJsxExpressionAttribute` for a spread.
   */
  type: string;

  /**
   * The attribute name.
   */
  name?: string;

  /**
   * The value.
   */
  value?: AttributeValue;
};

/**
 * The value of a JSX attribute: a string, `null` for a bare attribute, or an expression.
 */
export type AttributeValue =
  | string
  | null
  | { type: 'mdxJsxAttributeValueExpression'; value: string; data?: { estree?: EstreeNode } };

/**
 * An estree node, which the kit only walks for literals.
 */
export type EstreeNode = {
  /**
   * The node type.
   */
  type: string;

  /**
   * Any other field of the node.
   */
  [field: string]: unknown;
};

/**
 * The JSX node types.
 */
export const JSX_TYPES = new Set(['mdxJsxFlowElement', 'mdxJsxTextElement']);

/**
 * Calls the visitor on every node, depth first, with the node's parent and index so it can replace
 * itself. Children added by the visitor are visited too.
 *
 * @param node - The root.
 * @param visitor - Returns `true` to skip the node's children.
 */
export function walk(
  node: MdastNode,
  visitor: (node: MdastNode, parent: MdastNode | undefined, index: number) => boolean | void,
  parent?: MdastNode,
  index: number = 0,
): void {
  if (visitor(node, parent, index) === true) {
    return;
  }

  const children = node.children ?? [];
  for (let position = 0; position < children.length; position += 1) {
    const child = children[position];
    if (child !== undefined) {
      walk(child, visitor, node, position);
    }
  }
}

/**
 * The attribute with a name on a JSX node.
 *
 * @param node - A JSX node.
 * @param name - The attribute name.
 */
export function findAttribute(node: MdastNode, name: string): MdxAttribute | undefined {
  return node.attributes?.find((attribute) => attribute.name === name);
}

/**
 * The static value of an attribute: a string, a literal expression (number, boolean, string,
 * template without substitutions, array or object of those) or `true` for a bare attribute.
 *
 * @param node - A JSX node.
 * @param name - The attribute name.
 * @returns The value; `undefined` when the attribute is missing or its value is not static.
 */
export function attributeValue(node: MdastNode, name: string): unknown {
  const attribute = findAttribute(node, name);
  if (attribute === undefined) {
    return undefined;
  }

  const { value } = attribute;
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'string') {
    return value;
  }

  const expression = firstExpression(value.data?.estree);
  return expression === undefined ? undefined : staticValue(expression);
}

/**
 * Sets a string, number or boolean attribute, replacing one of the same name. A `true` boolean
 * becomes a bare attribute; `false` and numbers become literal expressions.
 *
 * @param node - A JSX node, changed in place.
 * @param name - The attribute name.
 * @param value - The value.
 */
export function setAttribute(
  node: MdastNode,
  name: string,
  value: string | number | boolean,
): void {
  removeAttribute(node, name);
  node.attributes ??= [];
  node.attributes.push({ type: 'mdxJsxAttribute', name, value: attributeNodeValue(value) });
}

/**
 * Removes an attribute.
 *
 * @param node - A JSX node, changed in place.
 * @param name - The attribute name.
 */
export function removeAttribute(node: MdastNode, name: string): void {
  node.attributes = (node.attributes ?? []).filter((attribute) => attribute.name !== name);
}

/**
 * The text of a node that holds one static string: a text child, or an expression such as
 * `{`code`}`.
 *
 * @param node - A JSX node.
 * @returns The text; `undefined` when the children are not one static string.
 */
export function childText(node: MdastNode): string | undefined {
  const children = node.children ?? [];
  const [only] = children;
  if (children.length !== 1 || only === undefined) {
    return undefined;
  }

  if (only.type === 'mdxFlowExpression' || only.type === 'mdxTextExpression') {
    const expression = firstExpression(only.data?.estree);
    const value = expression === undefined ? undefined : staticValue(expression);
    return typeof value === 'string' ? value : undefined;
  }

  if (only.type === 'paragraph') {
    return childText(only);
  }

  return only.type === 'text' ? only.value : undefined;
}

/**
 * Evaluates an estree expression that is made only of literals.
 *
 * @param node - An expression node.
 * @returns The value; `undefined` for anything that needs to run.
 */
export function staticValue(node: EstreeNode): unknown {
  switch (node.type) {
    case 'Literal':
      return node['value'];
    case 'TemplateLiteral': {
      const quasis = node['quasis'];
      const only =
        Array.isArray(quasis) && quasis.length === 1 ? (quasis[0] as EstreeNode) : undefined;
      const cooked =
        only === undefined ? undefined : (only['value'] as { cooked?: string } | undefined);
      return cooked?.cooked;
    }

    case 'UnaryExpression': {
      const argument = staticValue(node['argument'] as EstreeNode);
      return node['operator'] === '-' && typeof argument === 'number' ? -argument : undefined;
    }

    case 'ArrayExpression':
      return (node['elements'] as EstreeNode[]).map(staticValue);
    case 'ObjectExpression':
      return staticObject(node['properties'] as EstreeNode[]);
    default:
      return undefined;
  }
}

/**
 * The expression of a program that is one expression statement.
 *
 * @param program - A program node.
 */
function firstExpression(program: EstreeNode | undefined): EstreeNode | undefined {
  const body = program?.['body'];
  const statement = Array.isArray(body) ? (body[0] as EstreeNode | undefined) : undefined;
  return statement?.['expression'] as EstreeNode | undefined;
}

/**
 * Evaluates the properties of an object literal whose keys and values are static.
 *
 * @param properties - The `properties` of an `ObjectExpression`.
 */
function staticObject(properties: readonly EstreeNode[]): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {};
  for (const property of properties) {
    const key = property['key'] as EstreeNode | undefined;
    const name = key?.['name'] ?? key?.['value'];
    if (property.type !== 'Property' || (typeof name !== 'string' && typeof name !== 'number')) {
      return undefined;
    }

    result[String(name)] = staticValue(property['value'] as EstreeNode);
  }

  return result;
}

/**
 * The attribute value node for a string, number or boolean.
 *
 * @param value - The value.
 */
function attributeNodeValue(value: string | number | boolean): AttributeValue {
  if (typeof value === 'string') {
    return value;
  }

  if (value === true) {
    return null;
  }

  return expressionAttributeValue(
    String(value),
    expressionProgram({ type: 'Literal', value, raw: String(value) }),
  );
}

/**
 * An attribute value written as an expression: its source text and the program that evaluates it.
 *
 * @param source - The expression as written.
 * @param program - The program MDX emits for the expression.
 */
function expressionAttributeValue(source: string, program: EstreeNode): AttributeValue {
  return { type: 'mdxJsxAttributeValueExpression', value: source, data: { estree: program } };
}

/**
 * A program that is the single expression statement `expression`, the shape MDX emits for an
 * attribute.
 *
 * @param expression - The expression.
 */
function expressionProgram(expression: EstreeNode): EstreeNode {
  return {
    type: 'Program',
    sourceType: 'module',
    comments: [],
    body: [{ type: 'ExpressionStatement', expression }],
  };
}

/**
 * A JSX flow element node.
 *
 * @param name - The element name.
 * @param attributes - Its attributes.
 * @param children - Its children.
 */
export function jsxElement(
  name: string,
  attributes: MdxAttribute[],
  children: MdastNode[] = [],
): MdastNode {
  return { type: 'mdxJsxFlowElement', name, attributes, children };
}

/**
 * An `import name from 'specifier'` ESM block, with the estree MDX needs to emit it.
 *
 * @param local - The local binding.
 * @param specifier - The module to import.
 */
export function defaultImport(local: string, specifier: string): MdastNode {
  return {
    type: 'mdxjsEsm',
    value: `import ${local} from ${JSON.stringify(specifier)}`,
    data: {
      estree: {
        type: 'Program',
        sourceType: 'module',
        comments: [],
        body: [
          {
            type: 'ImportDeclaration',
            attributes: [],
            specifiers: [
              { type: 'ImportDefaultSpecifier', local: { type: 'Identifier', name: local } },
            ],
            source: { type: 'Literal', value: specifier, raw: JSON.stringify(specifier) },
          },
        ],
      },
    },
  };
}

/**
 * An attribute whose value is the identifier of an imported binding.
 *
 * @param name - The attribute name.
 * @param identifier - The binding.
 */
export function identifierAttribute(name: string, identifier: string): MdxAttribute {
  return {
    type: 'mdxJsxAttribute',
    name,
    value: expressionAttributeValue(
      identifier,
      expressionProgram({ type: 'Identifier', name: identifier }),
    ),
  };
}

/**
 * The source of a node's children exactly as the file has it, from the first child's start to the
 * last child's end, with the indentation the MDX nesting added taken off the lines after the first.
 * Markdown inside is not interpreted: `https://x.test/?a=1` and `*x*` come back as written.
 *
 * @param node - A JSX element with children.
 * @param source - The file's source, the vfile's `value`.
 * @returns The text; `undefined` when the node has no children or the parser kept no offsets.
 */
export function sourceOfChildren(node: MdastNode, source: unknown): string | undefined {
  const children = node.children ?? [];
  const start = children[0]?.position?.start.offset;
  const end = children.at(-1)?.position?.end.offset;
  if (typeof source !== 'string' || start === undefined || end === undefined || end < start) {
    return undefined;
  }

  const [first = '', ...rest] = source.slice(start, end).split('\n');
  const indents = rest
    .filter((line) => line.trim() !== '')
    .map((line) => line.length - line.trimStart().length);
  const indent = indents.length === 0 ? 0 : Math.min(...indents);
  return [first, ...rest.map((line) => line.slice(indent))].join('\n').trim();
}

/**
 * An attribute whose value is an array of imported bindings, such as `posters={[a, b]}`.
 *
 * @param name - The attribute name.
 * @param identifiers - The bindings, in order.
 */
export function identifierArrayAttribute(
  name: string,
  identifiers: readonly string[],
): MdxAttribute {
  return {
    type: 'mdxJsxAttribute',
    name,
    value: expressionAttributeValue(
      `[${identifiers.join(', ')}]`,
      expressionProgram({
        type: 'ArrayExpression',
        elements: identifiers.map((identifier) => ({ type: 'Identifier', name: identifier })),
      }),
    ),
  };
}
