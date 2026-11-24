import type { AnyLayoutContract } from '@deckster/engine/layout';
import type { LimitCase } from '@deckster/kit/limit-cases';

import { deckCommand } from '@deckster/engine/command';
import { KEBAB_CASE_PATTERN } from '@deckster/engine/names';
import { BODY_SLOT } from '@deckster/engine/slots';
import { importContracts } from '@deckster/vite-plugin';
import { Effect, FileSystem, Result, Schema, SchemaIssue } from 'effect';
import path from 'node:path';

/**
 * The optional file in a code layout's folder whose default export lists its limit cases.
 */
export const LIMITS_FILE = 'limits.ts';

/**
 * The problem id of a `limits.ts` that loads but is not a list of limit cases.
 */
export const LIMITS_INVALID = 'layout-limits-invalid';

/**
 * The shape of `limits.ts` in words, for fixes.
 */
const LIMITS_SHAPE =
  "Export `export default [{ name: 'full-body', frontmatter: {}, filled: [] }] satisfies " +
  "readonly LimitCase[]`, with `import type { LimitCase } from '@deckster/kit/limit-cases'`.";

/**
 * The fix for a `limits.ts` that imports something it may not or throws.
 */
const LOAD_FIX =
  '`limits.ts` is loaded like `contract.ts`: import only `effect`, `@deckster/engine/layout`, ' +
  '`@deckster/kit/layout-fields`, `@deckster/brand`, types (`import type`), and `.ts` files in ' +
  `the layout's own folder or in \`layouts/_shared/\`. ${LIMITS_SHAPE}`;

/**
 * Formats schema issues as a list of paths and messages.
 */
const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

/**
 * One limit case as `limits.ts` writes it: the fields of `LimitCase` from
 * `@deckster/kit/limit-cases`, with a kebab-case name, since it becomes part of a file name.
 */
const LimitCaseEntry = Schema.Struct({
  name: Schema.String.check(
    Schema.isPattern(KEBAB_CASE_PATTERN, {
      message: 'Expected a kebab-case case name, such as "full-body"',
    }),
  ),
  frontmatter: Schema.Record(Schema.String, Schema.Unknown),
  filled: Schema.Array(Schema.String),
  body: Schema.optionalKey(Schema.Boolean),
  bodyMdx: Schema.optionalKey(Schema.String),
});

/**
 * The default export of `limits.ts`.
 */
const LimitsExport = Schema.Array(LimitCaseEntry);

/**
 * A code layout whose limit cases to load.
 */
export type LimitsSubject = {
  /**
   * The layout name.
   */
  readonly name: string;

  /**
   * Its contract, to check the slots the cases fill.
   */
  readonly contract: AnyLayoutContract;

  /**
   * Its absolute folder, `layouts/<name>/`.
   */
  readonly dir: string;
};

/**
 * Why a layout's `limits.ts` gives no cases.
 */
export type LimitsProblem = {
  /**
   * `layout-contract-imports` or `layout-load-failed` from the loader, `layout-held` during an
   * agent turn, or {@link LIMITS_INVALID}.
   */
  readonly code: string;

  /**
   * The absolute path of `limits.ts`.
   */
  readonly file: string;

  /**
   * What is wrong.
   */
  readonly message: string;

  /**
   * How to fix it.
   */
  readonly fix: string;
};

/**
 * One layout's limit cases, or why there are none to trust.
 */
export type LayoutLimitsLoad =
  | {
      /**
       * The layout name.
       */
      readonly name: string;

      /**
       * The file loaded and holds valid cases, or the layout has no `limits.ts` (no cases).
       */
      readonly kind: 'cases';

      /**
       * The cases, in file order.
       */
      readonly cases: readonly LimitCase[];
    }
  | {
      /**
       * The layout name.
       */
      readonly name: string;

      /**
       * The file did not load or is not a list of cases.
       */
      readonly kind: 'problem';

      /**
       * What is wrong.
       */
      readonly problem: LimitsProblem;
    };

/**
 * Loads the `limits.ts` of each layout that has one, in one batch through `importContracts`: the
 * same import check, loader and agent-turn gate as contracts, so a `limits.ts` written during an
 * agent turn is never run. Each default export is checked: a list of cases with kebab-case names,
 * no name twice, and only named slots the contract has in `filled`. A layout with no `limits.ts`
 * has no cases.
 *
 * It never fails: each layout's outcome is a value.
 *
 * @param subjects - The layouts, with their contracts and folders.
 * @param root - The absolute workspace root.
 * @returns One outcome per layout, in the order given.
 */
export const loadLayoutLimits = Effect.fn('loadLayoutLimits')(function* (
  subjects: readonly LimitsSubject[],
  root: string,
): Effect.fn.Return<readonly LayoutLimitsLoad[], never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const present = yield* Effect.filter(subjects, (subject) =>
    fs.exists(path.join(subject.dir, LIMITS_FILE)).pipe(Effect.orElseSucceed(() => false)),
  );
  const loads = yield* importContracts(
    present.map((subject) => path.join(subject.dir, LIMITS_FILE)),
    { root },
  );
  const byFile = new Map(loads.map((load) => [load.file, load]));
  return subjects.map((subject): LayoutLimitsLoad => {
    const file = path.join(subject.dir, LIMITS_FILE);
    const load = byFile.get(file);
    if (load === undefined) {
      return { name: subject.name, kind: 'cases', cases: [] };
    }

    switch (load.kind) {
      case 'loaded': {
        return decodeCases(subject, file, load.exported);
      }

      case 'held': {
        return problem(subject, {
          code: 'layout-held',
          file,
          message:
            'An agent turn is changing files, and this limits.ts was not loaded before it began.',
          fix: `Run \`${deckCommand()} layouts check\` again once the turn has ended.`,
        });
      }

      case 'failed': {
        return problem(subject, {
          code: load.problem.code,
          file,
          message: load.problem.message,
          fix: LOAD_FIX,
        });
      }
    }
  });
});

/**
 * Checks a loaded default export: the list of cases, their names and the slots they fill.
 *
 * @param subject - The layout.
 * @param file - The absolute path of `limits.ts`.
 * @param exported - The default export.
 */
function decodeCases(subject: LimitsSubject, file: string, exported: unknown): LayoutLimitsLoad {
  const decoded = Schema.decodeUnknownResult(LimitsExport, {
    errors: 'all',
    onExcessProperty: 'error',
  })(exported);
  if (Result.isFailure(decoded)) {
    const issues = formatIssues(decoded.failure.issue).issues.map(
      ({ path: at = [], message }) =>
        `${at.length === 0 ? 'the default export' : at.map(segmentName).join('.')}: ${message}`,
    );
    return invalid(
      subject,
      file,
      `Its default export is not a list of limit cases (${issues.join('; ')}).`,
    );
  }

  const cases = decoded.success;
  const names = cases.map((limitCase) => limitCase.name);
  const twice = names.find((name, index) => names.indexOf(name) !== index);
  if (twice !== undefined) {
    return invalid(subject, file, `Two limit cases are named "${twice}".`);
  }

  const slots = new Set(Object.keys(subject.contract.slots));
  for (const limitCase of cases) {
    const unknown = limitCase.filled.find((slot) => slot === BODY_SLOT || !slots.has(slot));
    if (unknown !== undefined) {
      const named = [...slots].filter((slot) => slot !== BODY_SLOT);
      return invalid(
        subject,
        file,
        `The case "${limitCase.name}" fills "${unknown}", which is not a named slot of ` +
          `${subject.name}${named.length === 0 ? '' : ` (it has ${named.join(', ')})`}.`,
      );
    }
  }

  return { name: subject.name, kind: 'cases', cases };
}

/**
 * The outcome for a `limits.ts` that loaded but is not valid.
 *
 * @param subject - The layout.
 * @param file - The absolute path of `limits.ts`.
 * @param message - What is wrong.
 */
function invalid(subject: LimitsSubject, file: string, message: string): LayoutLimitsLoad {
  return problem(subject, {
    code: LIMITS_INVALID,
    file,
    message,
    fix:
      `${LIMITS_SHAPE} \`filled\` lists the named slots to fill besides body; \`body: false\` ` +
      'leaves body empty.',
  });
}

/**
 * The outcome for a layout whose `limits.ts` gives no cases to trust.
 *
 * @param subject - The layout.
 * @param found - What is wrong.
 */
function problem(subject: LimitsSubject, found: LimitsProblem): LayoutLimitsLoad {
  return { name: subject.name, kind: 'problem', problem: found };
}

/**
 * One segment of a schema issue's path as text.
 *
 * @param segment - A key or an index, possibly wrapped as `{ key }`.
 */
function segmentName(segment: PropertyKey | { readonly key: PropertyKey }): string {
  return String(typeof segment === 'object' ? segment.key : segment);
}
