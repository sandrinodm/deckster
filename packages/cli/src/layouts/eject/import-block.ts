/**
 * The import statements at the top of a TypeScript module, read from its text and printed back the
 * way the repository's formatter prints them: one statement per module and kind, grouped, sorted
 * and wrapped at the line width. `deckster layouts eject` uses it to point a kit layout's imports
 * at the packages and files a copy of that layout can reach.
 */

/**
 * The widest line the formatter allows.
 */
const MAX_LINE_CHARS = 100;

/**
 * Matches one `import … from '…'` statement, on one line or several: an optional `type`, an
 * optional default name, an optional namespace, an optional braced list and the specifier.
 */
const IMPORT_FROM =
  /^import\s+(type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\*\s+as\s+([\w$]+)\s*)?(?:\{([^}]*)\}\s*)?from\s*'([^']+)';?[ \t]*$/gmu;

/**
 * Matches `import '…'`, as a module imports a stylesheet.
 */
const SIDE_EFFECT_IMPORT = /^import\s+'([^']+)';?[ \t]*$/gmu;

/**
 * Matches text that is only blank.
 */
const BLANK = /^\s*$/u;

/**
 * Matches the `type` keyword in front of one name of a braced list.
 */
const INLINE_TYPE = /^type\s+/u;

/**
 * Matches the ` as ` between a name and its local alias.
 */
const ALIAS_SEPARATOR = /\s+as\s+/u;

/**
 * Matches the start of a relative specifier.
 */
const RELATIVE_SPECIFIER = /^\.\.?\//u;

/**
 * The position of the first of the two groups (types, then values) of `#` imports.
 */
const INTERNAL_GROUP = 2;

/**
 * The position of the first of the two groups (types, then values) of relative imports.
 */
const RELATIVE_GROUP = 4;

/**
 * One name of a braced import list.
 */
export type NamedImport = {
  /**
   * The name as the module exports it.
   */
  readonly name: string;

  /**
   * The local name, or nothing when it is the exported name.
   */
  readonly alias: string | undefined;

  /**
   * Whether the name is written `type name` in a statement that is not `import type`.
   */
  readonly typeOnly: boolean;
};

/**
 * One import statement.
 */
export type ImportStatement = {
  /**
   * Whether it is `import type`.
   */
  readonly typeOnly: boolean;

  /**
   * The default import's local name, if it has one.
   */
  readonly defaultName: string | undefined;

  /**
   * The local name of `* as name`, if it has one.
   */
  readonly namespace: string | undefined;

  /**
   * The braced names; empty for a side-effect import.
   */
  readonly named: readonly NamedImport[];

  /**
   * The module specifier, as written.
   */
  readonly specifier: string;

  /**
   * Whether it is `import '…'`, with no names.
   */
  readonly sideEffect: boolean;
};

/**
 * The import statements found at the top of a module.
 */
export type ImportBlock = {
  /**
   * The statements, in source order.
   */
  readonly statements: readonly ImportStatement[];

  /**
   * Where the first statement starts in the source.
   */
  readonly start: number;

  /**
   * Where the last statement ends in the source.
   */
  readonly end: number;
};

/**
 * A statement with its place in the source.
 */
type Located = {
  /**
   * The statement.
   */
  readonly statement: ImportStatement;

  /**
   * Where it starts.
   */
  readonly start: number;

  /**
   * Where it ends.
   */
  readonly end: number;
};

/**
 * Reads the run of import statements at the top of a module: every statement from the first one on,
 * as long as only blank lines separate them. A comment or code between two imports ends the run, so
 * the statements after it are not part of the block.
 *
 * @param source - The module's text.
 * @returns The block, or nothing when the module has no import.
 */
export function parseImports(source: string): ImportBlock | undefined {
  const located = [...locateImports(source)].sort((a, b) => a.start - b.start);
  const [first] = located;
  if (first === undefined) {
    return undefined;
  }

  const run = [first];
  for (const next of located.slice(1)) {
    const previous = run.at(-1) ?? first;
    if (!BLANK.test(source.slice(previous.end, next.start))) {
      break;
    }

    run.push(next);
  }

  return {
    statements: run.map((entry) => entry.statement),
    start: first.start,
    end: (run.at(-1) ?? first).end,
  };
}

/**
 * Prints import statements as the formatter does: statements of one module and kind merged, then
 * grouped (types from packages, values from packages, `#` types, `#` values, relative types,
 * relative values) with a blank line between groups, sorted by specifier inside a group, and
 * wrapped one name per line when a statement is wider than the line width. A side-effect import
 * belongs to the value group of its specifier and comes after the group's other imports, in the
 * order written.
 *
 * @param statements - The statements, in any order.
 * @returns The text of the block, without a trailing newline.
 */
export function printImports(statements: readonly ImportStatement[]): string {
  const groups = new Map<number, ImportStatement[]>();
  for (const statement of mergeStatements(statements)) {
    const group = groupOf(statement);
    groups.set(group, [...(groups.get(group) ?? []), statement]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, members]) => {
      const sorted = members
        .filter((member) => !member.sideEffect)
        .toSorted((a, b) => compareNames(a.specifier, b.specifier));
      const sideEffects = members.filter((member) => member.sideEffect);
      return [...sorted, ...sideEffects].map(printStatement).join('\n');
    })
    .join('\n\n');
}

/**
 * Finds every import statement in a module, wherever it stands.
 */
function locateImports(source: string): Located[] {
  const found: Located[] = [];
  for (const match of source.matchAll(IMPORT_FROM)) {
    const [text, type, defaultName, namespace, names, specifier = ''] = match;
    found.push({
      statement: {
        typeOnly: type !== undefined,
        defaultName,
        namespace,
        named: names === undefined ? [] : parseNames(names),
        specifier,
        sideEffect: false,
      },
      start: match.index,
      end: match.index + text.length,
    });
  }

  for (const match of source.matchAll(SIDE_EFFECT_IMPORT)) {
    found.push({
      statement: {
        typeOnly: false,
        defaultName: undefined,
        namespace: undefined,
        named: [],
        specifier: match[1] ?? '',
        sideEffect: true,
      },
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return found;
}

/**
 * Splits the inside of `{ a, type b as c }` into its names.
 */
function parseNames(body: string): NamedImport[] {
  return body
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const typeOnly = INLINE_TYPE.test(part);
      const [name = '', alias] = part.replace(INLINE_TYPE, '').split(ALIAS_SEPARATOR);
      return { name: name.trim(), alias: alias?.trim(), typeOnly };
    });
}

/**
 * Merges the statements that import braced names from one module with the same kind, so a module is
 * imported once for its types and once for its values. Statements with a default or namespace
 * import, and side-effect imports, stay as they are; a repeated side-effect import is dropped.
 */
function mergeStatements(statements: readonly ImportStatement[]): ImportStatement[] {
  const merged: ImportStatement[] = [];
  for (const statement of statements) {
    const index = merged.findIndex((other) => canMerge(other, statement));
    const other = merged[index];
    if (other === undefined) {
      merged.push(statement);
    } else if (!statement.sideEffect) {
      merged[index] = { ...other, named: [...other.named, ...statement.named] };
    }
  }

  return merged;
}

/**
 * Tells whether two statements can be one: the same module and kind, and neither names a default or
 * a namespace.
 */
function canMerge(a: ImportStatement, b: ImportStatement): boolean {
  /**
   * Tells whether a statement names neither a default nor a namespace.
   *
   * @param statement - One statement.
   */
  const isPlain = (statement: ImportStatement): boolean =>
    statement.defaultName === undefined && statement.namespace === undefined;
  return (
    a.specifier === b.specifier &&
    a.typeOnly === b.typeOnly &&
    a.sideEffect === b.sideEffect &&
    isPlain(a) &&
    isPlain(b)
  );
}

/**
 * The formatter's group of a statement, as a position: lower groups print first.
 */
function groupOf(statement: ImportStatement): number {
  const kind = statement.typeOnly ? 0 : 1;
  if (RELATIVE_SPECIFIER.test(statement.specifier)) {
    return RELATIVE_GROUP + kind;
  }

  return statement.specifier.startsWith('#') ? INTERNAL_GROUP + kind : kind;
}

/**
 * Prints one statement on one line, or with one name per line when that line is too wide.
 */
function printStatement(statement: ImportStatement): string {
  if (statement.sideEffect) {
    return `import '${statement.specifier}';`;
  }

  const names = statement.named
    .toSorted((a, b) => compareNames(a.name, b.name))
    .map((named) => {
      const local = named.alias === undefined ? named.name : `${named.name} as ${named.alias}`;
      return named.typeOnly ? `type ${local}` : local;
    });
  const head = [
    ...(statement.defaultName === undefined ? [] : [statement.defaultName]),
    ...(statement.namespace === undefined ? [] : [`* as ${statement.namespace}`]),
  ];
  const keyword = statement.typeOnly ? 'import type' : 'import';
  const tail = `from '${statement.specifier}';`;
  if (names.length === 0) {
    return `${keyword} ${head.join(', ')} ${tail}`;
  }

  const lead = head.length === 0 ? '' : `${head.join(', ')}, `;
  const oneLine = `${keyword} ${lead}{ ${names.join(', ')} } ${tail}`;
  if (oneLine.length <= MAX_LINE_CHARS) {
    return oneLine;
  }

  return [`${keyword} ${lead}{`, ...names.map((name) => `  ${name},`), `} ${tail}`].join('\n');
}

/**
 * Orders two names as the formatter does: without regard to case, then by code unit.
 */
function compareNames(a: string, b: string): number {
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  if (lowerA !== lowerB) {
    return lowerA < lowerB ? -1 : 1;
  }

  if (a === b) {
    return 0;
  }

  return a < b ? -1 : 1;
}
