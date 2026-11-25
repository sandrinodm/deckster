import type { LimitCase } from '@deckster/kit/limit-cases';

import {
  catalogLayoutNames,
  ejectClosures,
  findUnsafeCopies,
  KIT_SRC_DIR,
  type LayoutClosure,
  type PublicImport,
} from '@deckster/kit/eject-closure';
import { isContractPackage } from '@deckster/vite-plugin';
import fs from 'node:fs';
import path from 'node:path';

import {
  parseImports,
  printImports,
  type ImportStatement,
  type NamedImport,
} from '#layouts/eject/import-block.ts';
import { limitsSource } from '#layouts/eject/limits-source.ts';
import {
  kitClassTokens,
  renameClasses,
  scopeStylesheet,
  selectorClasses,
  type ClassOwner,
} from '#layouts/eject/scope-css.ts';

/**
 * Turns the kit's source of one layout into the files of a code layout that replaces it: the same
 * component, contract and stylesheet under the fixed file names, with every import pointed at a
 * public package entry, at a file of the layout or at a copied helper in `layouts/_shared/`.
 *
 * It reads the kit's source text and writes nothing, so `deckster layouts eject` can write its
 * result, `deckster layouts diff` can run it again on a newer kit, and a test can run it on a
 * changed copy of the kit.
 */

/**
 * The file name of an ejected layout's contract.
 */
export const CONTRACT_FILE = 'contract.ts';

/**
 * The file name of an ejected layout's component.
 */
export const COMPONENT_FILE = 'layout.tsx';

/**
 * The file name of an ejected layout's own stylesheet.
 */
export const STYLESHEET_FILE = 'layout.css';

/**
 * The file name of an ejected layout's limit cases.
 */
export const LIMITS_FILE = 'limits.ts';

/**
 * The folder beside the layout folders that holds the helpers ejected layouts share.
 */
export const SHARED_DIR = '_shared';

/**
 * The layout that renders a brand's data layouts. It is a kit module but not a layout of the
 * catalog, so it cannot be ejected.
 */
export const DATA_LAYOUT_RENDERER = 'brand';

/**
 * The packages an ejected file may import, besides entries of `react`, `effect` and `@deckster/*`:
 * what a workspace on an installed CLI can resolve.
 */
const WORKSPACE_PACKAGES = /^(?:react|effect|@deckster\/[a-z-]+)(?:\/|$)/u;

/**
 * Matches the kit's source files that hold code or styles.
 */
const SOURCE_FILE = /\.(?:ts|tsx|css)$/u;

/**
 * Matches test and fixture files, which are not part of an installed kit.
 */
const TEST_OR_FIXTURE_FILE = /\.(?:test|render\.test|fixture)\.(?:ts|tsx)$/u;

/**
 * Matches `export { … } from '…'` and `export * from '…'`, capturing the text before the specifier,
 * the exported names and the specifier.
 */
const REEXPORT = /^(export\s+(?:type\s+)?(\{[^}]*\}|\*)\s+from\s+)'([^']+)'/gmu;

/**
 * Matches an import of a kit-internal `#` path that the rewrite left behind.
 */
const LEFTOVER_INTERNAL = /(?:\bfrom\s+|\bimport\s*\(?\s*)'(#[^']+)'/gu;

/**
 * Matches the braces around a re-export's names.
 */
const OUTER_BRACES = /^\{|\}$/gu;

/**
 * Matches the `type` keyword in front of one re-exported name.
 */
const INLINE_TYPE = /^type\s+/u;

/**
 * Matches the ` as ` between a name and its alias.
 */
const ALIAS_SEPARATOR = /\s+as\s+/u;

/**
 * Matches a stylesheet's `@import`.
 */
const CSS_IMPORT = /@import\s/u;

/**
 * Matches the statement that defines a kit layout's contract, capturing its name.
 */
const CONTRACT_DEFINITION = /^export const (\w+) = defineLayoutContract\(/mu;

/**
 * Matches the statement that defines a kit layout's component, capturing its name.
 */
const LAYOUT_DEFINITION = /^export const (\w+) = defineLayout[<(]/mu;

/**
 * Matches a Windows line break, which the transform reads as a plain one so a kit checked out with
 * CRLF line endings ejects the same files.
 */
const CRLF = /\r\n/gu;

/**
 * What the transform needs to know about the kit's source as a whole, read once for any number of
 * layouts.
 */
export type EjectSource = {
  /**
   * The kit's `src` folder.
   */
  readonly srcDir: string;

  /**
   * The catalog's layout names, in catalog order.
   */
  readonly names: readonly string[];

  /**
   * What each layout's files reach, by layout name.
   */
  readonly closures: Readonly<Record<string, LayoutClosure>>;

  /**
   * For each stylesheet a copied helper imports (a path under `src`), the classes it owns: the ones
   * no kit code outside the layouts and the copied helpers uses. Those are renamed in the copy.
   */
  readonly helperClasses: ReadonlyMap<string, ReadonlySet<string>>;

  /**
   * For each stylesheet that a layout's own files import and that is neither the layout's own nor a
   * copied helper's (a path under `src`, such as `layouts/image-scrim.css`), the classes it owns:
   * the ones no kit file mentions but that stylesheet and the catalog layouts' own files. A
   * layout's copy renames them in its files and in its copy of the stylesheet, so the kit's copy,
   * which other kit layouts keep loading, never styles the ejected layout's markup.
   */
  readonly sharedStyleClasses: ReadonlyMap<string, ReadonlySet<string>>;

  /**
   * Problems that keep any layout from being ejected, such as two helpers with one file name.
   */
  readonly problems: readonly string[];
};

/**
 * The files of one ejected layout.
 */
export type EjectedLayout = {
  /**
   * The layout's name.
   */
  readonly name: string;

  /**
   * The files of the layout's folder, by file name.
   */
  readonly files: Readonly<Record<string, string>>;

  /**
   * The helpers it needs in `layouts/_shared/`, by file name. A helper's text is the same whichever
   * layout asks for it.
   */
  readonly shared: Readonly<Record<string, string>>;

  /**
   * Why the layout cannot be ejected as a working copy: an import the transform cannot place, a
   * helper that keeps shared state, a contract that would not load. Empty when the files work.
   */
  readonly problems: readonly string[];
};

/**
 * Where a kit file goes in an eject.
 */
type Placement = {
  /**
   * The layout's own folder, or the shared folder.
   */
  readonly folder: 'layout' | 'shared';

  /**
   * The file name there.
   */
  readonly file: string;
};

/**
 * The state of one layout's transform.
 */
type Job = {
  /**
   * The kit's source.
   */
  readonly source: EjectSource;

  /**
   * The layout's name.
   */
  readonly name: string;

  /**
   * What the layout's files reach.
   */
  readonly closure: LayoutClosure;

  /**
   * The kit classes renamed in this layout's own files and in its copies of shared stylesheets:
   * those of the helpers it copies and those its shared stylesheets own.
   */
  readonly layoutClasses: ReadonlySet<string>;

  /**
   * The stylesheets of other kit layouts that the layout's own files import, which are copied into
   * its folder, scoped to it and stripped of the kit names of the classes they own.
   */
  readonly localStyles: Set<string>;

  /**
   * Who the copy is for, which picks the prefix of renamed helper classes.
   */
  readonly owner: ClassOwner;

  /**
   * Whether the kit layout has no stylesheet of its own, so the eject adds an empty `layout.css`
   * and imports it from `layout.tsx`.
   */
  readonly addsStylesheet: boolean;

  /**
   * The problems found so far.
   */
  readonly problems: string[];
};

/**
 * Reads what the transform needs from the kit's source: the catalog, every layout's closure, the
 * classes each copied helper's stylesheet owns, and the classes each stylesheet that layouts share
 * owns.
 *
 * @param srcDir - The kit's `src` folder; the one of the running CLI unless a test passes a copy.
 * @returns The source description. Its `problems` list what would break every eject.
 */
export function readEjectSource(srcDir: string = KIT_SRC_DIR): EjectSource {
  const closures = ejectClosures(srcDir);
  const copied = new Set(Object.values(closures).flatMap((closure) => closure.copied));
  const helperStyles = new Set<string>();
  for (const module of copied) {
    for (const statement of importsOf(readSource(srcDir, module))) {
      const target = resolveModule(module, statement.specifier);
      if (target?.endsWith('.css') === true) {
        helperStyles.add(target);
      }
    }
  }

  const mentions = classMentions(srcDir);
  const outside = outsideClassTokens(mentions, new Set([...copied, ...helperStyles]));
  const helperClasses = new Map<string, ReadonlySet<string>>();
  for (const file of helperStyles) {
    const owned = selectorClasses(readSource(srcDir, file)).filter((name) => !outside.has(name));
    helperClasses.set(file, new Set(owned));
  }

  const layoutOwnFiles = new Set(Object.values(closures).flatMap((closure) => closure.own));
  const sharedStyleClasses = new Map<string, ReadonlySet<string>>();
  for (const closure of Object.values(closures)) {
    for (const file of sharedStylesOf(closure, helperClasses)) {
      if (sharedStyleClasses.has(file)) {
        continue;
      }

      const owned = selectorClasses(readSource(srcDir, file)).filter((name) =>
        [...(mentions.get(name) ?? [])].every(
          (mention) => mention === file || layoutOwnFiles.has(mention),
        ),
      );
      sharedStyleClasses.set(file, new Set(owned));
    }
  }

  return {
    srcDir,
    names: catalogLayoutNames(srcDir),
    closures,
    helperClasses,
    sharedStyleClasses,
    problems: sharedNameClashes([...copied, ...helperStyles]),
  };
}

/**
 * Builds the files of the code layout that replaces one kit layout.
 *
 * - `<name>-layout.tsx`, `.contract.ts` and `.css` become `layout.tsx`, `contract.ts` and
 *   `layout.css`; the contract gains `replaces: true`, and both modules gain the default export a
 *   code layout has, beside the names the kit exports. A layout without a stylesheet of its own
 *   gets an empty `layout.css`, imported by `layout.tsx`.
 * - An import of names that `@deckster/kit/layout-parts`, `@deckster/kit/layout-fields`,
 *   `@deckster/kit` or `@deckster/kit/diagrams` export points at that entry. Other kit modules are
 *   copied to `_shared/` and imported relatively; imports of packages stay.
 * - A copied helper's stylesheet is copied with it, and the classes it owns are renamed from `kit-…`
 *   to `own-…` in a brand's copy and `dck-…` in a deck's, in every ejected file, so the kit's copy,
 *   the brand's and the deck's never style each other's markup.
 * - A stylesheet the layout shares with other kit layouts (one it imports that is neither its own nor
 *   a copied helper's, such as `image-scrim.css`) is copied into its folder and scoped to the
 *   layout (see `scopeStylesheet`), and the classes it owns are renamed like a helper's, in the
 *   copy and in the layout's files. The kit's copy stays loaded for the kit layouts that still use
 *   it, and the rename keeps its rules off the ejected layout's markup and the copy's rules off
 *   theirs.
 * - `limits.ts` holds the given limit cases.
 * - Kit source with CRLF line endings is read as LF, so the output is the same on any checkout.
 *
 * @param source - The kit's source, from {@link readEjectSource}.
 * @param name - A layout of the catalog.
 * @param limits - The layout's limit cases, written to `limits.ts`.
 * @param owner - Whether the copy goes to a brand or a deck; a brand's when not given.
 * @returns The files, and every reason they would not work. An unknown name, including one that is
 *   only a property every object has (`constructor`), gives one problem and no files.
 */
export function transformLayout(
  source: EjectSource,
  name: string,
  limits: readonly LimitCase[],
  owner: ClassOwner = 'brand',
): EjectedLayout {
  const closure = closureOf(source, name);
  if (closure === undefined) {
    return {
      name,
      files: {},
      shared: {},
      problems: [`"${name}" is not a layout of the kit's catalog.`],
    };
  }

  const helperStyles = closure.css.filter((file) => source.helperClasses.has(file));
  const job: Job = {
    source,
    name,
    closure,
    layoutClasses: new Set([
      ...helperStyles.flatMap((file) => [...(source.helperClasses.get(file) ?? [])]),
      ...sharedStylesOf(closure, source.helperClasses).flatMap((file) => [
        ...(source.sharedStyleClasses.get(file) ?? []),
      ]),
    ]),
    localStyles: new Set(),
    owner,
    addsStylesheet: !closure.own.some((file) => file.endsWith('.css')),
    problems: [
      ...source.problems,
      ...unsafeCopies(source, name),
      ...contractProblems(source, closure),
    ],
  };
  const files: Record<string, string> = {};
  for (const file of closure.own) {
    files[placeOwn(name, file)] = transformFile(job, file);
  }

  for (const file of job.localStyles) {
    const local = path.posix.basename(file);
    if (files[local] !== undefined) {
      job.problems.push(`Two files of the layout would be named ${local}.`);
    }

    const scoped = scopeStylesheet(readSource(source.srcDir, file), name);
    job.problems.push(...scoped.problems.map((problem) => `${file}: ${problem}`));
    files[local] = renameClasses(scoped.css, job.layoutClasses, owner);
  }

  if (job.addsStylesheet) {
    files[STYLESHEET_FILE] = emptyStylesheet(name);
  }

  files[LIMITS_FILE] = limitsSource(limits);
  const shared: Record<string, string> = {};
  for (const file of [...closure.copied, ...helperStyles]) {
    shared[path.posix.basename(file)] = transformFile(job, file);
  }

  return { name, files, shared, problems: [...new Set(job.problems)] };
}

/**
 * The file name one of the layout's own kit files gets.
 */
function placeOwn(name: string, file: string): string {
  const suffix = path.posix.basename(file).slice(`${name}-layout.`.length);
  switch (suffix) {
    case 'tsx': {
      return COMPONENT_FILE;
    }

    case 'contract.ts': {
      return CONTRACT_FILE;
    }

    default: {
      return STYLESHEET_FILE;
    }
  }
}

/**
 * Where a kit file reached by the layout goes, or nothing when the closure does not hold it.
 */
function placementOf(job: Job, file: string, importer: Placement): Placement | undefined {
  if (job.closure.own.includes(file)) {
    return { folder: 'layout', file: placeOwn(job.name, file) };
  }

  if (job.closure.copied.includes(file) || job.source.helperClasses.has(file)) {
    return { folder: 'shared', file: path.posix.basename(file) };
  }

  if (file.endsWith('.css') && importer.folder === 'layout') {
    job.localStyles.add(file);
    return { folder: 'layout', file: path.posix.basename(file) };
  }

  return undefined;
}

/**
 * The transformed text of one kit file of the closure.
 */
function transformFile(job: Job, file: string): string {
  const isOwn = job.closure.own.includes(file);
  const classes = isOwn ? job.layoutClasses : allHelperClasses(job.source);
  const text = readSource(job.source.srcDir, file);
  if (file.endsWith('.css')) {
    if (CSS_IMPORT.test(text)) {
      job.problems.push(`${file} imports another stylesheet, which eject does not follow.`);
    }

    return renameClasses(text, classes, job.owner);
  }

  const placement: Placement = isOwn
    ? { folder: 'layout', file: placeOwn(job.name, file) }
    : { folder: 'shared', file: path.posix.basename(file) };
  const rewritten = renameClasses(rewriteImports(job, file, placement, text), classes, job.owner);
  for (const match of rewritten.matchAll(LEFTOVER_INTERNAL)) {
    job.problems.push(
      `${file} imports ${match[1] ?? ''} in a way eject cannot rewrite (an import below the ` +
        'first code of the file, or a dynamic import).',
    );
  }

  if (!isOwn) {
    return rewritten;
  }

  return placement.file === CONTRACT_FILE
    ? asCodeContract(job, file, rewritten)
    : asCodeLayout(job, file, rewritten);
}

/**
 * Points a module's imports and re-exports at what the copy can reach.
 */
function rewriteImports(job: Job, file: string, placement: Placement, text: string): string {
  const block = parseImports(text);
  const withImports =
    block === undefined
      ? text
      : text.slice(0, block.start) +
        printImports([
          ...block.statements.flatMap((statement) =>
            rewriteImport(job, file, placement, statement),
          ),
          ...addedImports(job, placement),
        ]) +
        text.slice(block.end);
  return withImports.replace(REEXPORT, (whole, lead: string, names: string, specifier: string) => {
    const module = resolveModule(file, specifier);
    if (module === undefined) {
      return whole;
    }

    const symbols = names === '*' ? ['*'] : namesOf(names);
    const targets = new Set(
      symbols.map((symbol) => targetOf(job, file, placement, module, symbol)),
    );
    const [target] = targets;
    if (targets.size !== 1 || target === undefined) {
      job.problems.push(`${file} re-exports from ${specifier}, which eject cannot place.`);
      return whole;
    }

    return `${lead}'${withQuery(target, specifier)}'`;
  });
}

/**
 * The imports the eject adds to a file: the empty `layout.css` of a layout that had no stylesheet,
 * in its component.
 */
function addedImports(job: Job, placement: Placement): ImportStatement[] {
  if (!job.addsStylesheet || placement.file !== COMPONENT_FILE || placement.folder !== 'layout') {
    return [];
  }

  return [
    {
      typeOnly: false,
      defaultName: undefined,
      namespace: undefined,
      named: [],
      specifier: `./${STYLESHEET_FILE}`,
      sideEffect: true,
    },
  ];
}

/**
 * The stylesheet an ejected layout gets when the kit layout has none of its own, so the file the
 * author is told to edit exists and is imported by `layout.tsx`.
 */
function emptyStylesheet(name: string): string {
  return [
    '/*',
    ` * The ${name} layout's own styles. The kit's ${name} layout has no stylesheet of its own, so`,
    ' * this one starts empty. Key its rules on the layout, as in',
    ` * \`.kit-frame[data-layout='${name}'] .x { … }\`, so they style no other layout.`,
    ' */',
    '',
  ].join('\n');
}

/**
 * A rewritten specifier with the query of the original one (`?inline`, `?url`), so Vite still loads
 * the copy the way the kit loaded the original. A public entry is returned as it is.
 */
function withQuery(target: string, original: string): string {
  const query = original.indexOf('?');
  return query === -1 || !target.startsWith('.') ? target : `${target}${original.slice(query)}`;
}

/**
 * The statements that replace one import: itself for a package, or one per place its names now come
 * from.
 */
function rewriteImport(
  job: Job,
  file: string,
  placement: Placement,
  statement: ImportStatement,
): ImportStatement[] {
  const module = resolveModule(file, statement.specifier);
  if (module === undefined) {
    if (!WORKSPACE_PACKAGES.test(statement.specifier)) {
      job.problems.push(
        `${file} imports the package ${statement.specifier}, which a workspace cannot resolve.`,
      );
    }

    return [statement];
  }

  /**
   * Where one name of the module comes from in the copy; the import as written when it has no
   * place, which the leftover check then reports.
   *
   * @param symbol - The name as the module exports it.
   */
  const target = (symbol: string): string => {
    const placed = targetOf(job, file, placement, module, symbol);
    return placed === undefined ? statement.specifier : withQuery(placed, statement.specifier);
  };
  if (statement.sideEffect) {
    return [{ ...statement, specifier: target('') }];
  }

  const split: ImportStatement[] = [];
  if (statement.defaultName !== undefined || statement.namespace !== undefined) {
    const symbol = statement.defaultName === undefined ? '*' : 'default';
    split.push({ ...statement, named: [], specifier: target(symbol) });
  }

  const byTarget = new Map<string, NamedImport[]>();
  for (const named of statement.named) {
    const specifier = target(named.name);
    byTarget.set(specifier, [...(byTarget.get(specifier) ?? []), named]);
  }

  for (const [specifier, named] of byTarget) {
    split.push({ ...statement, defaultName: undefined, namespace: undefined, named, specifier });
  }

  return split;
}

/**
 * The specifier one name of a kit module is imported by in the copy: the public entry that exports
 * it, or the relative path of the module's copy. Records a problem and returns nothing when the
 * module has no place.
 */
function targetOf(
  job: Job,
  file: string,
  placement: Placement,
  module: string,
  symbol: string,
): string | undefined {
  const entry = job.closure.publicImports.find(
    (candidate) =>
      candidate.file === file && candidate.module === module && candidate.symbols.includes(symbol),
  );
  if (entry !== undefined) {
    return entry.target;
  }

  const target = placementOf(job, module, placement);
  if (target === undefined || (placement.folder === 'shared' && target.folder === 'layout')) {
    job.problems.push(
      `${file} imports ${symbol === '' ? '' : `${symbol} from `}${module}, which is neither ` +
        'public nor a helper eject can copy.',
    );
    return undefined;
  }

  return placement.folder === target.folder
    ? `./${target.file}`
    : `../${SHARED_DIR}/${target.file}`;
}

/**
 * Makes a kit contract module a code layout's `contract.ts`: `replaces: true` after the name, and
 * the contract as the default export.
 */
function asCodeContract(job: Job, file: string, text: string): string {
  const constant = CONTRACT_DEFINITION.exec(text)?.[1];
  const nameLine = `  name: '${job.name}',\n`;
  const at = text.indexOf(nameLine);
  if (constant === undefined || at === -1) {
    job.problems.push(
      `${file} does not define its contract as \`export const … = defineLayoutContract({ name: ` +
        `'${job.name}', … })\`, so eject cannot mark it as a replacement.`,
    );
    return text;
  }

  const end = at + nameLine.length;
  return [
    `${text.slice(0, end)}  replaces: true,\n${text.slice(end)}`,
    '/**',
    " * The contract as the default export, which is how a brand's or a deck's code layout exports it.",
    ' */',
    `export default ${constant};`,
    '',
  ].join('\n');
}

/**
 * Makes a kit layout module a code layout's `layout.tsx`: the layout as the default export.
 */
function asCodeLayout(job: Job, file: string, text: string): string {
  const constant = LAYOUT_DEFINITION.exec(text)?.[1];
  if (constant === undefined) {
    job.problems.push(
      `${file} does not define its layout as \`export const … = defineLayout({ … })\`, so eject ` +
        'cannot export it as a code layout.',
    );
    return text;
  }

  return [
    text,
    '/**',
    " * The layout as the default export, which is how a brand's or a deck's code layout exports it.",
    ' */',
    `export default ${constant};`,
    '',
  ].join('\n');
}

/**
 * Why the layout's contract would not load as a code layout's: a contract runs in Node, so what it
 * reaches must be `.ts` files and the packages the contract loader allows.
 */
function contractProblems(source: EjectSource, closure: LayoutClosure): string[] {
  const contract = closure.own.find((file) => file.endsWith('.contract.ts'));
  const problems: string[] = [];
  const visited = new Set<string>();
  const pending = contract === undefined ? [] : [contract];
  while (pending.length > 0) {
    const file = pending.pop() ?? '';
    if (visited.has(file)) {
      continue;
    }

    visited.add(file);
    if (!file.endsWith('.ts')) {
      problems.push(`The contract reaches ${file}, and a contract may only import \`.ts\` files.`);
      continue;
    }

    const text = readSource(source.srcDir, file);
    const reexports = [...text.matchAll(REEXPORT)].map((match) => match[3] ?? '');
    const imports = importsOf(text)
      .filter((statement) => !statement.typeOnly)
      .map((statement) => statement.specifier);
    for (const specifier of [...imports, ...reexports]) {
      const module = resolveModule(file, specifier);
      const isPublic = closure.publicImports.some(
        (entry) => entry.file === file && entry.module === module,
      );
      if (module !== undefined && !isPublic) {
        pending.push(module);
      } else if (module === undefined && !isContractPackage(specifier)) {
        problems.push(
          `The contract reaches ${file}, which imports ${specifier}: not a package a contract ` +
            'may import.',
        );
      }
    }
  }

  for (const entry of closure.publicImports) {
    const isRuntime = visited.has(entry.file) && importsAtRuntime(source, entry);
    if (isRuntime && !isContractPackage(entry.target)) {
      problems.push(
        `The contract reaches ${entry.file}, which imports ${entry.symbols.join(', ')} from ` +
          `${entry.target}: not a package a contract may import.`,
      );
    }
  }

  return problems;
}

/**
 * Tells whether a file's import of a public entry has a runtime effect: the closure keeps every
 * import, but the contract loader ignores `import type` and names written `type name`, so only an
 * import that brings a value counts.
 */
function importsAtRuntime(source: EjectSource, entry: PublicImport): boolean {
  const text = readSource(source.srcDir, entry.file);
  const symbols = new Set<string>();
  for (const statement of importsOf(text)) {
    if (statement.typeOnly || resolveModule(entry.file, statement.specifier) !== entry.module) {
      continue;
    }

    for (const symbol of runtimeSymbols(statement)) {
      symbols.add(symbol);
    }
  }

  const reexported = [...text.matchAll(REEXPORT)].some(
    (match) => resolveModule(entry.file, match[3] ?? '') === entry.module,
  );
  return reexported || entry.symbols.some((symbol) => symbols.has(symbol));
}

/**
 * The names a value import brings at runtime, as the closure names them: `default`, `*`, each name
 * not written `type name`, and `''` for an import with no names.
 */
function runtimeSymbols(statement: ImportStatement): string[] {
  if (statement.sideEffect) {
    return [''];
  }

  return [
    ...(statement.defaultName === undefined ? [] : ['default']),
    ...(statement.namespace === undefined ? [] : ['*']),
    ...statement.named.filter((named) => !named.typeOnly).map((named) => named.name),
  ];
}

/**
 * The copied modules of a layout that keep state a copy would not share with the kit.
 */
function unsafeCopies(source: EjectSource, name: string): string[] {
  const closure = closureOf(source, name);
  const unsafe = closure === undefined ? {} : findUnsafeCopies(source.srcDir, { [name]: closure });
  return (unsafe[name] ?? []).map(
    (copy) => `The kit's ${copy.module} ${copy.reason}, so a copy of it would not work.`,
  );
}

/**
 * What a layout's files reach, or nothing for a name that is not a layout of the catalog, even one
 * every object has as a property.
 */
function closureOf(source: EjectSource, name: string): LayoutClosure | undefined {
  return Object.hasOwn(source.closures, name) ? source.closures[name] : undefined;
}

/**
 * Every class a copied helper owns, which is what a helper's own files rename: the same set
 * whichever layout the helper is copied for.
 */
function allHelperClasses(source: EjectSource): ReadonlySet<string> {
  return new Set([...source.helperClasses.values()].flatMap((classes) => [...classes]));
}

/**
 * The stylesheets a layout shares with other kit layouts: those its closure reaches that are
 * neither its own nor a copied helper's.
 */
function sharedStylesOf(
  closure: LayoutClosure,
  helperClasses: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  return closure.css.filter((file) => !closure.own.includes(file) && !helperClasses.has(file));
}

/**
 * For each kit class named as a whole word in the kit's source, the non-test files that name it.
 */
function classMentions(srcDir: string): Map<string, Set<string>> {
  const mentions = new Map<string, Set<string>>();
  const files = fs
    .readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => SOURCE_FILE.test(file) && !TEST_OR_FIXTURE_FILE.test(file));
  for (const file of files) {
    for (const token of kitClassTokens(readSource(srcDir, file))) {
      mentions.set(token, (mentions.get(token) ?? new Set()).add(file));
    }
  }

  return mentions;
}

/**
 * The kit classes used by kit code that is neither a layout nor one of the given files: classes a
 * copy must keep, because the kit's components and base styles use them.
 */
function outsideClassTokens(
  mentions: ReadonlyMap<string, ReadonlySet<string>>,
  excluded: ReadonlySet<string>,
): Set<string> {
  const tokens = new Set<string>();
  for (const [token, files] of mentions) {
    if ([...files].some((file) => !file.startsWith('layouts/') && !excluded.has(file))) {
      tokens.add(token);
    }
  }

  return tokens;
}

/**
 * The problems of helpers that would share one file name in `_shared/`.
 */
function sharedNameClashes(files: readonly string[]): string[] {
  const byName = new Map<string, string[]>();
  for (const file of files) {
    const name = path.posix.basename(file);
    byName.set(name, [...(byName.get(name) ?? []), file]);
  }

  return [...byName.entries()]
    .filter(([, sources]) => sources.length > 1)
    .map(
      ([name, sources]) =>
        `The kit's ${sources.join(' and ')} would both be copied to ${SHARED_DIR}/${name}.`,
    );
}

/**
 * The import statements at the top of a module's text.
 */
function importsOf(text: string): readonly ImportStatement[] {
  return parseImports(text)?.statements ?? [];
}

/**
 * The names inside the braces of a re-export, as the module exports them.
 */
function namesOf(braced: string): string[] {
  return braced
    .replace(OUTER_BRACES, '')
    .split(',')
    .map((part) => part.trim().replace(INLINE_TYPE, ''))
    .filter((part) => part !== '')
    .map((part) => part.split(ALIAS_SEPARATOR)[0] ?? part);
}

/**
 * Resolves a `#` or relative specifier to a path under the kit's `src`, or nothing for a package.
 */
function resolveModule(from: string, specifier: string): string | undefined {
  const [bare = ''] = specifier.split('?');
  if (bare.startsWith('#')) {
    return bare.slice(1);
  }

  return bare.startsWith('.')
    ? path.posix.normalize(path.posix.join(path.posix.dirname(from), bare))
    : undefined;
}

/**
 * Reads a kit source file as text, with LF line breaks.
 */
function readSource(srcDir: string, file: string): string {
  return fs.readFileSync(path.join(srcDir, file), 'utf8').replace(CRLF, '\n');
}
