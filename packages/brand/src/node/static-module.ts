import type { parseAst as ParseAst } from 'vite-plus';

import { createRequire } from 'node:module';

/**
 * The signature of Vite's `parseAst`.
 */
// oxlint-disable-next-line typescript/no-deprecated
type Parser = typeof ParseAst;

/**
 * The parser, once loaded.
 */
let parser: Parser | undefined;

/**
 * Loads `parseAst` on first use. A static import would pull `vite-plus` (about 100 ms) into every
 * command that imports this package, such as the start of `deck present --agent`, which parses no
 * module until the dev server starts.
 */
function loadParser(): Parser {
  parser ??= (createRequire(import.meta.url)('vite-plus') as { parseAst: Parser }).parseAst;
  return parser;
}

/**
 * A module whose default export is a plain data literal, read without running it.
 */
export type StaticModule =
  | {
      /**
       * The module is data only.
       */
      readonly ok: true;

      /**
       * The default export's value.
       */
      readonly value: unknown;
    }
  | {
      /**
       * The module needs to run to know its value.
       */
      readonly ok: false;

      /**
       * What makes it more than data, as a sentence.
       */
      readonly reason: string;
    };

/**
 * The one function a data-only module may call, and the package it comes from.
 */
export type StaticCallee = {
  /**
   * The function name, such as `defineDeck`.
   */
  readonly name: string;

  /**
   * The package it is imported from, such as `@deckster/engine/config`.
   */
  readonly from: string;
};

/**
 * The callee of a deck config.
 */
export const DECK_CONFIG_CALLEE: StaticCallee = {
  /**
   * The function.
   */
  name: 'defineDeck',

  /**
   * Its package.
   */
  from: '@deckster/engine/config',
};

/**
 * The callee of a brand file.
 */
export const BRAND_CALLEE: StaticCallee = {
  /**
   * The function.
   */
  name: 'defineBrand',

  /**
   * Its package.
   */
  from: '@deckster/brand',
};

/**
 * A parsed syntax node, as far as this module reads it.
 */
type AstNode = Readonly<Record<string, unknown>> & {
  /**
   * The node type.
   */
  readonly type: string;
};

/**
 * Thrown inside the evaluator when a node is more than data.
 */
class NotStatic extends Error {}

/**
 * Whether a value is a syntax node.
 *
 * @param value - Anything.
 */
function isNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'type') === 'string'
  );
}

/**
 * A child node of a node, or a failure naming what is missing.
 *
 * @param node - The node.
 * @param key - The child's key.
 */
function child(node: AstNode, key: string): AstNode {
  const value = node[key];
  if (!isNode(value)) {
    throw new NotStatic(`a ${node.type} without ${key}`);
  }

  return value;
}

/**
 * The value of an expression that is a literal: strings, numbers, booleans and null, template
 * strings without `${}`, arrays and objects of those (plain keys, no spreads, no methods, no
 * computed keys), a sign before a number, and `as` / `satisfies` / parentheses around any of them.
 *
 * @param node - The expression.
 * @throws NotStatic for anything else.
 */
function literalValue(node: AstNode): unknown {
  switch (node.type) {
    case 'Literal': {
      if (node['regex'] !== undefined || node['bigint'] !== undefined) {
        throw new NotStatic('a regular expression or big integer');
      }

      const { value } = node;
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
        return value;
      }

      throw new NotStatic('an unusual literal');
    }

    case 'TemplateLiteral': {
      const expressions = node['expressions'];
      const quasis = node['quasis'];
      if (!Array.isArray(expressions) || expressions.length > 0 || !Array.isArray(quasis)) {
        throw new NotStatic('a template string with expressions');
      }

      return quasis
        .map((quasi: unknown) =>
          isNode(quasi) ? Reflect.get(Object(quasi['value']), 'cooked') : '',
        )
        .join('');
    }

    case 'UnaryExpression': {
      const argument = literalValue(child(node, 'argument'));
      if (typeof argument !== 'number' || (node['operator'] !== '-' && node['operator'] !== '+')) {
        throw new NotStatic(`the operator ${String(node['operator'])}`);
      }

      return node['operator'] === '-' ? -argument : argument;
    }

    case 'ArrayExpression': {
      const elements = node['elements'];
      if (!Array.isArray(elements)) {
        throw new NotStatic('an unreadable array');
      }

      return elements.map((element: unknown) => {
        if (!isNode(element) || element.type === 'SpreadElement') {
          throw new NotStatic('a spread or a hole in an array');
        }

        return literalValue(element);
      });
    }

    case 'ObjectExpression': {
      const properties = node['properties'];
      if (!Array.isArray(properties)) {
        throw new NotStatic('an unreadable object');
      }

      const result: Record<string, unknown> = {};
      for (const property of properties) {
        if (
          !isNode(property) ||
          property.type !== 'Property' ||
          property['kind'] !== 'init' ||
          property['computed'] === true ||
          property['method'] === true ||
          property['shorthand'] === true
        ) {
          throw new NotStatic('a spread, method, getter, shorthand or computed key in an object');
        }

        const name = keyName(child(property, 'key'));
        if (typeof name !== 'string' || name === '__proto__') {
          throw new NotStatic('an object key that is not a plain name');
        }

        result[name] = literalValue(child(property, 'value'));
      }

      return result;
    }

    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
      return literalValue(child(node, 'expression'));
    default:
      throw new NotStatic(`a ${node.type}`);
  }
}

/**
 * The name of a plain object key: an identifier, a string or a number.
 *
 * @param key - The key node.
 */
function keyName(key: AstNode): string | undefined {
  if (key.type === 'Identifier') {
    return typeof key['name'] === 'string' ? key['name'] : undefined;
  }

  return key.type === 'Literal' && ['string', 'number'].includes(typeof key['value'])
    ? String(key['value'])
    : undefined;
}

/**
 * Reads a module's default export without running it, when the module is data only: at most one
 * import, of the allowed function from its package and nothing else; type-only imports and
 * declarations; and `export default <callee>({...})` (or a bare literal) whose argument is a
 * literal. Anything else (other imports, statements, calls, variables, computed values) means the
 * module has to run, and the answer says why. Used for the files the dev server would otherwise
 * import as code: a deck's `deck.config.ts` and a brand's `brand.ts`.
 *
 * @param text - The module's source.
 * @param callee - The function the default export may be wrapped in.
 */
export function readStaticModule(text: string, callee: StaticCallee): StaticModule {
  let program: unknown;
  try {
    // oxlint-disable-next-line typescript/no-deprecated
    program = loadParser()(text, { lang: 'ts' });
  } catch (error) {
    return {
      ok: false,
      reason: `It does not parse: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!isNode(program) || !Array.isArray(program['body'])) {
    return { ok: false, reason: 'It does not parse as a module.' };
  }

  let value: unknown;
  let exported = false;
  try {
    for (const statement of program['body']) {
      if (!isNode(statement)) {
        throw new NotStatic('an unreadable statement');
      }

      if (statement.type === 'ImportDeclaration') {
        checkImport(statement, callee);
      } else if (statement.type === 'ExportDefaultDeclaration') {
        value = defaultValue(child(statement, 'declaration'), callee);
        exported = true;
      } else if (
        !['TSTypeAliasDeclaration', 'TSInterfaceDeclaration', 'EmptyStatement'].includes(
          statement.type,
        )
      ) {
        throw new NotStatic(`a ${statement.type} statement`);
      }
    }
  } catch (error) {
    if (error instanceof NotStatic) {
      return { ok: false, reason: `It contains ${error.message}, not only data.` };
    }

    throw error;
  }

  return exported
    ? { ok: true, value }
    : { ok: false, reason: 'It has no `export default` literal.' };
}

/**
 * Accepts a type-only import, or an import of the callee alone from its package.
 *
 * @param statement - The import declaration.
 * @param callee - The allowed function.
 * @throws NotStatic for any other import.
 */
function checkImport(statement: AstNode, callee: StaticCallee): void {
  if (statement['importKind'] === 'type') {
    return;
  }

  const source = child(statement, 'source')['value'];
  const specifiers = statement['specifiers'];
  const onlyCallee =
    source === callee.from &&
    Array.isArray(specifiers) &&
    specifiers.length > 0 &&
    specifiers.every(
      (specifier: unknown) =>
        isNode(specifier) &&
        specifier.type === 'ImportSpecifier' &&
        (specifier['importKind'] === 'type' ||
          (Reflect.get(Object(specifier['imported']), 'name') === callee.name &&
            Reflect.get(Object(specifier['local']), 'name') === callee.name)),
    );
  if (!onlyCallee) {
    throw new NotStatic(`an import from "${String(source)}"`);
  }
}

/**
 * The value of `export default <callee>(literal)` or `export default literal`.
 *
 * @param declaration - What follows `export default`.
 * @param callee - The allowed function.
 * @throws NotStatic for anything else.
 */
function defaultValue(declaration: AstNode, callee: StaticCallee): unknown {
  if (declaration.type !== 'CallExpression') {
    return literalValue(declaration);
  }

  const called = child(declaration, 'callee');
  const args = declaration['arguments'];
  if (
    called.type !== 'Identifier' ||
    called['name'] !== callee.name ||
    !Array.isArray(args) ||
    args.length !== 1 ||
    !isNode(args[0])
  ) {
    throw new NotStatic(`a call other than ${callee.name}(literal)`);
  }

  return literalValue(args[0]);
}
