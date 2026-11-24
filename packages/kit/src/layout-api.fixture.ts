import { readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

/**
 * One name a public entry module re-exports.
 */
export type ReexportedName = {
  /**
   * The name as the source module declares it.
   */
  name: string;

  /**
   * Whether the entry re-exports it as a type, which leaves nothing at run time.
   */
  isType: boolean;

  /**
   * The module declaring it, as a path under `src`.
   */
  module: string;
};

const REEXPORT = /^export\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/gmu;
const IMPORT = /^import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/gmu;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//gu;
const LINE_COMMENT = /^[ \t]*\/\/.*$/gmu;
const TYPE_NAME = /\b[A-Z][A-Za-z0-9]*\b/gu;
const OPENERS = '([{';
const CLOSERS = ')]}';
const TYPE_LITERAL_LEADERS = ':|&<,(=?';

/**
 * Lists the names an entry module re-exports and the module each comes from.
 *
 * @param srcDir - The kit's `src` folder.
 * @param entry - The entry module, as a path under `srcDir`.
 * @returns The names, sorted case-insensitively.
 */
export function reexportedNames(srcDir: string, entry: string): ReexportedName[] {
  const code = stripComments(readFileSync(join(srcDir, entry), 'utf8'));
  const names: ReexportedName[] = [];
  for (const match of code.matchAll(REEXPORT)) {
    const module = (match[2] ?? '').replace(/^#/u, '');
    for (const part of (match[1] ?? '').split(',')) {
      const text = part.trim();
      if (text !== '') {
        names.push({
          name: text.replace(/^type\s+/u, ''),
          isType: text.startsWith('type '),
          module,
        });
      }
    }
  }

  return names.sort((a, b) => compareText(a.name.toLowerCase(), b.name.toLowerCase()));
}

/**
 * Prints the declaration of an exported name as one stable text: a function or component as its
 * signature (a destructured parameter becomes `props`), a type as its definition, and a constant as
 * its annotation and the first line of its value (`<text>` for a string, whose wording is not part
 * of the API). Comments, line wrapping and trailing commas do not show, so formatting changes leave
 * the text alone.
 *
 * It reads source text, because the TypeScript compiler of this workspace has no JavaScript API. A
 * type that is inferred (a `Schema` constant) is not printed; the first line of its value is.
 *
 * @param srcDir - The kit's `src` folder.
 * @param declaration - A name from {@link reexportedNames}.
 * @returns The declaration, and the types its signature names that the same file declares.
 * @throws When the module has no top-level `export function|const|type` for the name.
 */
export function printDeclaration(srcDir: string, declaration: ReexportedName): string {
  const source = stripComments(readFileSync(join(srcDir, declaration.module), 'utf8'));
  const printed = printExport(source, declaration.name);
  if (printed === undefined) {
    throw new Error(
      `${declaration.module} has no top-level export of ${declaration.name}: ` +
        'declare it with export function, export const or export type, or extend the snapshot reader.',
    );
  }

  return printed;
}

/**
 * Prints the project types the given printed declarations name, each once and with the types they
 * name in turn: those their module declares, and those it imports from another project module.
 *
 * @param srcDir - The kit's `src` folder.
 * @param declarations - The names whose signatures to read.
 * @returns The type definitions, grouped by module and sorted by name.
 */
export function printReferencedTypes(srcDir: string, declarations: ReexportedName[]): string[] {
  const printed: string[] = [];
  const seen = new Set(
    declarations.map((declaration) => `${declaration.module}#${declaration.name}`),
  );
  const pending = declarations.map((declaration) => ({
    module: declaration.module,
    text: printDeclaration(srcDir, declaration),
  }));
  while (pending.length > 0) {
    const { module, text } = pending.pop() ?? { module: '', text: '' };
    for (const name of new Set(text.match(TYPE_NAME) ?? [])) {
      const found = findType(srcDir, module, name);
      if (found !== undefined && !seen.has(`${found.module}#${found.name}`)) {
        seen.add(`${found.module}#${found.name}`);
        printed.push(`${found.module} ${found.definition}`);
        pending.push({ module: found.module, text: found.definition });
      }
    }
  }

  return printed.sort(compareText);
}

/**
 * Finds the definition of a type a module names: in the module itself, or in the project module it
 * imports the name from (following one import, under the name that module declares it by).
 */
function findType(
  srcDir: string,
  module: string,
  name: string,
): { module: string; name: string; definition: string } | undefined {
  const source = stripComments(readFileSync(join(srcDir, module), 'utf8'));
  const own = printType(source, name);
  if (own !== undefined) {
    return { module, name, definition: own };
  }

  const imported = importOf(source, name);
  if (imported === undefined) {
    return undefined;
  }

  if (!imported.specifier.startsWith('#') && !imported.specifier.startsWith('.')) {
    return undefined;
  }

  const target = imported.specifier.startsWith('#')
    ? imported.specifier.slice(1)
    : posix.join(dirname(module), imported.specifier);
  const targetSource = stripComments(readFileSync(join(srcDir, target), 'utf8'));
  const definition = printType(targetSource, imported.name);
  return definition === undefined ? undefined : { module: target, name: imported.name, definition };
}

/**
 * The import that brings a local name into a module: its specifier and the name the imported module
 * declares it by.
 */
function importOf(source: string, local: string): { specifier: string; name: string } | undefined {
  for (const match of source.matchAll(IMPORT)) {
    for (const part of (match[1] ?? '').split(',')) {
      const [name = '', alias = name] = part
        .trim()
        .replace(/^type\s+/u, '')
        .split(/\s+as\s+/u);
      if (alias.trim() === local) {
        return { specifier: match[2] ?? '', name: name.trim() };
      }
    }
  }

  return undefined;
}

function printExport(source: string, name: string): string | undefined {
  const match = new RegExp(
    `^export\\s+(?:async\\s+)?(function|const|let|type)\\s+${name}\\b`,
    'mu',
  ).exec(source);
  if (match === null) {
    return undefined;
  }

  const kind = match[1] ?? 'const';
  if (kind === 'function') {
    return printFunction(source, match.index + match[0].length - name.length, name);
  }

  return kind === 'type' ? printType(source, name) : printConstant(source, match.index);
}

function printType(source: string, name: string): string | undefined {
  const match = new RegExp(`^(?:export\\s+)?type\\s+${name}\\b`, 'mu').exec(source);
  if (match === null) {
    return undefined;
  }

  const end = findOutside(source, match.index, (char) => char === ';');
  const lines = source
    .slice(match.index, end + 1)
    .replace(/^export\s+/u, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
  return lines.join('\n');
}

function printConstant(source: string, start: number): string {
  const equals = findOutside(source, start, (char) => char === '=');
  const header = collapse(source.slice(start, equals)).replace(/^export\s+/u, '');
  const lines = source.slice(equals + 1).split('\n');
  const first = (lines.find((line) => line.trim() !== '') ?? '').trim();
  return `${header} = ${/^['"`]/u.test(first) ? '<text>' : first}`;
}

function printFunction(source: string, nameStart: number, name: string): string {
  const open = source.indexOf('(', nameStart);
  const close = matching(source, open);
  const body = findBody(source, close + 1);
  const returns = collapse(source.slice(close + 1, body));
  return `function ${name}(${collapse(withoutDestructuring(source.slice(open + 1, close)))})${returns}`;
}

/**
 * The index of the `{` that opens a function body, starting after its parameter list: the first
 * brace at depth 0 that does not begin a type literal.
 */
function findBody(source: string, from: number): number {
  let depth = 0;
  let previous = '';
  for (let index = from; index < source.length; index += 1) {
    const char = source[index] ?? '';
    if (char === '{' && depth === 0 && !TYPE_LITERAL_LEADERS.includes(previous)) {
      return index;
    }

    if (OPENERS.includes(char)) {
      depth += 1;
    } else if (CLOSERS.includes(char)) {
      depth -= 1;
    }

    previous = /\s/u.test(char) ? previous : char;
  }

  return source.length;
}

/**
 * The index of the first character at bracket depth 0, from `from`, that the predicate accepts.
 */
function findOutside(source: string, from: number, accepts: (char: string) => boolean): number {
  let depth = 0;
  for (let index = from; index < source.length; index += 1) {
    const char = source[index] ?? '';
    if (OPENERS.includes(char)) {
      depth += 1;
    } else if (CLOSERS.includes(char)) {
      depth -= 1;
    } else if (depth === 0 && accepts(char) && source[index + 1] !== '>') {
      return index;
    }
  }

  return source.length - 1;
}

function matching(source: string, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index] ?? '';
    if (OPENERS.includes(char)) {
      depth += 1;
    } else if (CLOSERS.includes(char)) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return source.length - 1;
}

/**
 * Replaces a destructured first parameter with `props`, so the text names the type and not the
 * fields the component happens to read.
 */
function withoutDestructuring(params: string): string {
  const start = params.search(/\S/u);
  if (params[start] !== '{') {
    return params;
  }

  return `props${params.slice(matching(params, start) + 1)}`;
}

function collapse(text: string): string {
  return text
    .trim()
    .replace(/,$/u, '')
    .replace(/,\s*([)\]}>])/gu, '$1')
    .replace(/;\s*\}/gu, ' }')
    .replace(/\s+/gu, ' ')
    .replace(/,$/u, '')
    .replace(/\(\s+/gu, '(')
    .replace(/\s+\)/gu, ')')
    .trim();
}

/**
 * Orders two texts by code unit, which gives the same order on every machine and locale.
 */
function compareText(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  return a < b ? -1 : 1;
}

function stripComments(source: string): string {
  return source.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '');
}
