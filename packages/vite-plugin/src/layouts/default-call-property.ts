import type { parseSync as ParseSync } from 'vite';

import { Predicate } from 'effect';
import { createRequire } from 'node:module';

/**
 * Vite's parser, loaded on first use so that importing this module does not load `vite`.
 */
type Parser = typeof ParseSync;

/**
 * The expressions that wrap a value without changing it: `x satisfies T`, `x as T`, `(x)`.
 */
const WRAPPER_TYPES = new Set([
  'TSSatisfiesExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'ParenthesizedExpression',
]);

let parser: Parser | undefined;

/**
 * What a module's `export default <callee>({ ... })` says about one property of its argument.
 */
export type DefaultCallProperty =
  | {
      /**
       * The property is there with a string literal value.
       */
      readonly kind: 'string';

      /**
       * The string.
       */
      readonly value: string;
    }
  | {
      /**
       * The property is there, with a value that is not a string literal.
       */
      readonly kind: 'other';
    }
  | {
      /**
       * The default export is such a call and its object has no such property.
       */
      readonly kind: 'absent';
    }
  | {
      /**
       * The module does not parse, or its default export is not a call of the callee with an object
       * literal.
       */
      readonly kind: 'unreadable';
    };

/**
 * Reads one property of the object a module passes to its default-exported call, such as the `name`
 * of `export default defineLayout({ name: 'funnel', component })` or the `deckster` of `export
 * default defineDeck({ ..., deckster: '>=0.10' })`, from the syntax tree and without running the
 * module. Comments and the rest of the module never count, and `satisfies`, `as` and parentheses
 * around the call or the object are looked through. A default export that names a top-level `const`
 * (`export const titleLayout = defineLayout({ ... }); export default titleLayout;`) is followed to
 * that declaration.
 *
 * @param text - The module source.
 * @param callee - The name the default export calls, such as `defineLayout`.
 * @param property - The property to read.
 * @param lang - How to parse the source: `ts` for a `.ts` file, `tsx` (the default) for `.tsx`.
 * @returns The property's string value, or whether it is there with another value, missing, or the
 *   module cannot be read that way.
 */
export function readDefaultCallProperty(
  text: string,
  callee: string,
  property: string,
  lang: 'ts' | 'tsx' = 'tsx',
): DefaultCallProperty {
  const argument = defaultCallArgument(text, callee, lang);
  if (argument === undefined) {
    return { kind: 'unreadable' };
  }

  const properties = Array.isArray(argument.properties) ? argument.properties : [];
  const found = properties.find((node: unknown) => isNamedProperty(node, property));
  if (found === undefined) {
    const hasSpread = properties.some((node: unknown) => nodeType(node) === 'SpreadElement');
    return hasSpread ? { kind: 'unreadable' } : { kind: 'absent' };
  }

  const value = unwrap(Reflect.get(Object(found), 'value'));
  const literal: unknown =
    nodeType(value) === 'Literal' ? Reflect.get(Object(value), 'value') : undefined;
  return typeof literal === 'string' ? { kind: 'string', value: literal } : { kind: 'other' };
}

/**
 * The object literal a module's default export passes to a call of `callee`, or `undefined`.
 *
 * @param text - The module source.
 * @param callee - The called name.
 * @param lang - How to parse the source.
 */
function defaultCallArgument(
  text: string,
  callee: string,
  lang: 'ts' | 'tsx',
): Record<string, unknown> | undefined {
  let program: unknown;
  try {
    parser ??= (createRequire(import.meta.url)('vite') as { parseSync: Parser }).parseSync;
    const parsed = parser(`module.${lang}`, text, { lang });
    if (parsed.errors.length > 0) {
      return undefined;
    }

    program = parsed.program;
  } catch {
    return undefined;
  }

  const body: unknown = Predicate.isObject(program) ? program.body : undefined;
  const statements: readonly unknown[] = Array.isArray(body) ? body : [];
  const exported = statements.find((node) => nodeType(node) === 'ExportDefaultDeclaration');
  const declaration = unwrap(Reflect.get(Object(exported), 'declaration'));
  const call =
    nodeType(declaration) === 'Identifier'
      ? constValue(statements, Reflect.get(Object(declaration), 'name'))
      : declaration;
  if (!Predicate.isObject(call) || call.type !== 'CallExpression') {
    return undefined;
  }

  const name: unknown = Predicate.isObject(call.callee) ? call.callee.name : undefined;
  const args: unknown = call.arguments;
  const argument = unwrap(Array.isArray(args) ? args[0] : undefined);
  return name === callee && Predicate.isObject(argument) && argument.type === 'ObjectExpression'
    ? argument
    : undefined;
}

/**
 * The value a top-level `const` declaration, exported or not, gives a name, unwrapped; `undefined`
 * when no single `const` declares it.
 *
 * @param statements - The module's top-level statements.
 * @param name - The name.
 */
function constValue(statements: readonly unknown[], name: unknown): unknown {
  const declarators = statements.flatMap((statement) => {
    const declaration =
      nodeType(statement) === 'ExportNamedDeclaration'
        ? Reflect.get(Object(statement), 'declaration')
        : statement;
    const isConst =
      nodeType(declaration) === 'VariableDeclaration' &&
      Reflect.get(Object(declaration), 'kind') === 'const';
    const list: unknown = isConst ? Reflect.get(Object(declaration), 'declarations') : [];
    return Array.isArray(list) ? list : [];
  });
  const matches = declarators.filter((declarator: unknown) => {
    const id: unknown = Predicate.isObject(declarator) ? declarator.id : undefined;
    return nodeType(id) === 'Identifier' && Reflect.get(Object(id), 'name') === name;
  });
  return matches.length === 1 ? unwrap(Reflect.get(Object(matches[0]), 'init')) : undefined;
}

/**
 * Whether a node is a plain, non-computed property with this key.
 *
 * @param node - A node of an object literal.
 * @param key - The key.
 */
function isNamedProperty(node: unknown, key: string): boolean {
  if (!Predicate.isObject(node) || node.type !== 'Property' || node.computed === true) {
    return false;
  }

  return keyName(node.key) === key;
}

/**
 * The name a property key gives: an identifier's name or a literal's value.
 *
 * @param key - The key node.
 */
function keyName(key: unknown): unknown {
  if (!Predicate.isObject(key)) {
    return undefined;
  }

  return key.type === 'Identifier' ? key.name : key.value;
}

/**
 * A node with its type-only and parenthesis wrappers taken off.
 *
 * @param node - Any node.
 */
function unwrap(node: unknown): unknown {
  let current = node;
  while (Predicate.isObject(current) && WRAPPER_TYPES.has(String(current.type))) {
    current = current.expression;
  }

  return current;
}

/**
 * A node's `type`, or `undefined` for something that is not a node.
 *
 * @param node - Any value.
 */
function nodeType(node: unknown): unknown {
  return Predicate.isObject(node) ? node.type : undefined;
}
