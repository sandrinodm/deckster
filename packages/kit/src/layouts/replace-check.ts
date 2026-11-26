import type {
  AnyLayoutContract,
  ContentBudget,
  FieldProblem,
  LayoutExample,
  LayoutVariant,
  SlotContract,
} from '@deckster/engine/layout';

import { deckCommand } from '@deckster/engine/command';
import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { BODY_SLOT } from '@deckster/engine/slots';
import { Cause, Exit, Option, Result, Schema, SchemaIssue } from 'effect';

import { isRequiredField, ownField, ownSlot } from '#layouts/contract-lookup.ts';
import { LIMIT_CASES } from '#layouts/limit-cases.ts';

/**
 * The limits a content budget can set, in the order notes list them.
 */
const BUDGET_LIMITS = ['maxWords', 'maxBullets', 'maxLines'] as const;

/**
 * Flattens a schema issue into one entry per field, each with its path and message.
 */
const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

/**
 * One finding of {@link checkReplacement}: what differs from the original layout and what to do.
 */
export type ReplacementProblem = {
  /**
   * What is wrong, as a sentence that names the original's value.
   */
  readonly message: string;

  /**
   * How to fix it, as a sentence the author can act on.
   */
  readonly fix: string;
};

/**
 * What {@link checkReplacement} finds, by how much it matters.
 */
export type ReplacementCheck = {
  /**
   * Slides written for the original would stop building: a field, slot or title the replacement
   * drops, narrows or newly requires, or an example of the original it rejects. The replacement
   * must not be used.
   */
  readonly errors: readonly ReplacementProblem[];

  /**
   * Slides still build but lose something: a PowerPoint mapping the replacement does not have.
   */
  readonly warnings: readonly ReplacementProblem[];

  /**
   * Changes worth knowing about: every budget, variant budget and title limit that differs from the
   * original, and every variant the replacement adds or drops. Tighter limits are allowed; lint
   * then flags the slides over them.
   */
  readonly notes: readonly ReplacementProblem[];
};

/**
 * One frontmatter the original layout accepts, which the replacement must accept too.
 */
type SampleFrontmatter = {
  /**
   * Where it comes from, for messages, such as `its example` or `the limit case "2-messages"`.
   */
  readonly label: string;

  /**
   * The layout's fields, without `layout`.
   */
  readonly frontmatter: Readonly<Record<string, unknown>>;
};

/**
 * Checks that a code layout can replace a kit or engine layout of the same name without breaking a
 * deck written for the original: every field the original requires stays required, every field it
 * accepts is accepted, and no field it leaves optional or lacks becomes required; every slot it has
 * stays, required where it was, accepting at least what it accepted, and no slot becomes required
 * that was not; its example and every limit case of the kit's stress test (`LIMIT_CASES`) decode
 * against the replacement and pass its `checks` (a schema or `checks` that throws is an error, not
 * a crash); and the title is required exactly when the original requires it. A dropped PowerPoint
 * mapping is a warning, and every changed budget, variant or title limit a note.
 *
 * A limit case the original itself does not accept alone (the stress test adds fields to some) is
 * skipped. Real slides are checked by the build and by `checkReplacedSlides` in the deck plugin.
 *
 * @param original - The contract of the layout being replaced.
 * @param replacement - The code layout's contract, which says `replaces: true`.
 * @returns The errors, warnings and notes; all empty when the replacement fits.
 */
export function checkReplacement(
  original: AnyLayoutContract,
  replacement: AnyLayoutContract,
): ReplacementCheck {
  return {
    errors: [
      ...fieldProblems(original, replacement),
      ...slotProblems(original, replacement),
      ...sampleProblems(original, replacement),
      ...titleProblems(original, replacement),
    ],
    warnings: pptxWarnings(original, replacement),
    notes: [
      ...budgetNotes(original, replacement),
      ...variantNotes(original, replacement),
      ...titleNotes(original, replacement),
    ],
  };
}

/**
 * The frontmatter samples {@link checkReplacement} decodes against a replacement of a layout: the
 * layout's example and its limit cases, each only when the layout itself accepts it.
 *
 * @param original - The contract of the layout being replaced.
 * @returns The samples, the example first.
 */
export function replacementSamples(original: AnyLayoutContract): readonly SampleFrontmatter[] {
  const cases = Object.hasOwn(LIMIT_CASES, original.name) ? (LIMIT_CASES[original.name] ?? []) : [];
  const samples: SampleFrontmatter[] = [
    { label: 'its example', frontmatter: exampleFrontmatter(original.example) },
    ...cases.map((limitCase) => ({
      label: `the limit case "${limitCase.name}"`,
      frontmatter: limitCase.frontmatter,
    })),
  ];
  return samples.filter((sample) => Result.isSuccess(decodeSlide(original, sample.frontmatter)));
}

/**
 * The errors for fields: one of the original's the replacement does not have, one the original
 * requires that the replacement leaves optional, and one the replacement requires that the original
 * leaves optional or does not have.
 *
 * @param original - The replaced layout's contract.
 * @param replacement - The replacement's contract.
 */
function fieldProblems(
  original: AnyLayoutContract,
  replacement: AnyLayoutContract,
): ReplacementProblem[] {
  const name = original.name;
  const originalFields = Object.keys(original.schema.fields);
  const missing = originalFields.flatMap((field): ReplacementProblem[] => {
    const isRequired = isRequiredField(original, field);
    if (ownField(replacement, field) === undefined) {
      return [
        {
          message:
            `The replacement has no field "${field}", which the original ${name} layout ` +
            `${isRequired ? 'requires' : 'accepts'}, so slides that set it stop building.`,
          fix:
            `Add \`${field}\` to the replacement's schema, accepting what the original does ` +
            `(\`${deckCommand()} layouts --json\` prints it).`,
        },
      ];
    }

    if (isRequired && !isRequiredField(replacement, field)) {
      return [
        {
          message:
            `The original ${name} layout requires the field "${field}", and the replacement ` +
            'makes it optional.',
          fix: `Make \`${field}\` required in the replacement's schema, as it is in the original.`,
        },
      ];
    }

    return [];
  });
  const required = newlyRequiredFields(original, replacement).map((field): ReplacementProblem => ({
    message:
      `The replacement requires the field "${field}", which the original ${name} layout ` +
      `${originalStance(ownField(original, field) !== undefined)}, so ` +
      'slides that leave it out stop building.',
    fix: `Make \`${field}\` optional or give it a default in the replacement's schema.`,
  }));
  return [...missing, ...required];
}

/**
 * How a message says the original treats a field or slot the replacement requires.
 *
 * @param present - Whether the original has it at all.
 */
function originalStance(present: boolean): string {
  return present ? 'leaves optional' : 'does not have';
}

/**
 * The fields the replacement requires that the original leaves optional or does not have.
 *
 * @param original - The replaced layout's contract.
 * @param replacement - The replacement's contract.
 */
function newlyRequiredFields(
  original: AnyLayoutContract,
  replacement: AnyLayoutContract,
): string[] {
  return Object.keys(replacement.schema.fields).filter(
    (field) => isRequiredField(replacement, field) && !isRequiredField(original, field),
  );
}

/**
 * The errors for slots: one of the original's the replacement drops, makes optional where the
 * original requires it, or lets accept less than the original did, and one the replacement requires
 * that the original leaves optional or does not have. `body`, which every layout has, can only lose
 * its `required` flag or what it accepts.
 *
 * @param original - The replaced layout's contract.
 * @param replacement - The replacement's contract.
 */
function slotProblems(
  original: AnyLayoutContract,
  replacement: AnyLayoutContract,
): ReplacementProblem[] {
  const kept = Object.keys(original.slots).flatMap((slot): ReplacementProblem[] => {
    const before = ownSlot(original, slot);
    const after = ownSlot(replacement, slot);
    if (before === undefined) {
      return [];
    }

    if (after === undefined && slot !== BODY_SLOT) {
      return [missingSlot(original.name, slot, before)];
    }

    return [
      ...requiredSlotProblems(original.name, slot, before, after),
      ...acceptsProblems(original.name, slot, before, after),
    ];
  });
  const required = Object.keys(replacement.slots).flatMap((slot) =>
    newlyRequiredSlot(original, slot, ownSlot(replacement, slot)),
  );
  return [...kept, ...required];
}

/**
 * The error for a slot the replacement requires and the original leaves optional or does not have.
 *
 * @param original - The replaced layout's contract.
 * @param slot - The slot name.
 * @param after - The replacement's slot contract.
 */
function newlyRequiredSlot(
  original: AnyLayoutContract,
  slot: string,
  after: SlotContract | undefined,
): ReplacementProblem[] {
  const before = ownSlot(original, slot);
  if (after?.required !== true || before?.required === true) {
    return [];
  }

  return [
    {
      message:
        `The replacement requires the slot "${slot}", which the original ${original.name} ` +
        `layout ${originalStance(before !== undefined)}, so slides that ` +
        'leave it empty stop building.',
      fix: `Drop \`required: true\` from the replacement's \`${slot}\` slot.`,
    },
  ];
}

/**
 * The error for a slot of the original that the replacement does not have.
 *
 * @param name - The layout name.
 * @param slot - The slot name.
 * @param before - The original's slot contract.
 */
function missingSlot(name: string, slot: string, before: SlotContract): ReplacementProblem {
  const accepts = before.accepts.map((kind) => `'${kind}'`).join(', ');
  return {
    message:
      `The replacement has no slot "${slot}", which the original ${name} layout ` +
      `${before.required === true ? 'requires' : 'has'} (accepting ${before.accepts.join(', ')}).`,
    fix:
      `Add \`${slot}: { description, accepts: [${accepts}]` +
      `${before.required === true ? ', required: true' : ''} }\` to the replacement's slots.`,
  };
}

/**
 * The error for a slot the original requires and the replacement does not.
 *
 * @param name - The layout name.
 * @param slot - The slot name.
 * @param before - The original's slot contract.
 * @param after - The replacement's, when it declares the slot.
 */
function requiredSlotProblems(
  name: string,
  slot: string,
  before: SlotContract,
  after: SlotContract | undefined,
): ReplacementProblem[] {
  if (before.required !== true || after?.required === true) {
    return [];
  }

  return [
    {
      message:
        `The original ${name} layout requires the slot "${slot}", and the replacement ` +
        'does not.',
      fix: `Mark \`${slot}\` \`required: true\` in the replacement's slots, as in the original.`,
    },
  ];
}

/**
 * The error for a slot that accepts less in the replacement than in the original. A `body` the
 * replacement does not describe accepts anything.
 *
 * @param name - The layout name.
 * @param slot - The slot name.
 * @param before - The original's slot contract.
 * @param after - The replacement's, when it declares the slot.
 */
function acceptsProblems(
  name: string,
  slot: string,
  before: SlotContract,
  after: SlotContract | undefined,
): ReplacementProblem[] {
  if (after === undefined) {
    return [];
  }

  const dropped = before.accepts.filter((kind) => !after.accepts.includes(kind));
  if (dropped.length === 0) {
    return [];
  }

  return [
    {
      message:
        `The slot "${slot}" accepts ${before.accepts.join(', ')} in the original ${name} ` +
        `layout; the replacement drops ${dropped.join(', ')}.`,
      fix: `Accept at least ${before.accepts.join(', ')} in the replacement's \`${slot}\` slot.`,
    },
  ];
}

/**
 * The errors for frontmatter the original accepts and the replacement does not: its example and its
 * limit cases that fail to decode or fail the replacement's `checks`. Samples that fail the same
 * way give one error, naming the first and how many others; a sample that fails on a field
 * {@link fieldProblems} already reports (missing, or newly required) gives none.
 *
 * @param original - The replaced layout's contract.
 * @param replacement - The replacement's contract.
 */
function sampleProblems(
  original: AnyLayoutContract,
  replacement: AnyLayoutContract,
): ReplacementProblem[] {
  const reported = new Set([
    ...Object.keys(original.schema.fields).filter(
      (field) => ownField(replacement, field) === undefined,
    ),
    ...newlyRequiredFields(original, replacement),
  ]);
  const failures = new Map<string, { problem: ReplacementProblem; labels: string[] }>();
  for (const sample of replacementSamples(original)) {
    for (const failure of sampleFailures(original, replacement, sample)) {
      if (reported.has(failure.field)) {
        continue;
      }

      const known = failures.get(failure.reason);
      if (known === undefined) {
        failures.set(failure.reason, { problem: failure.problem, labels: [sample.label] });
      } else {
        known.labels.push(sample.label);
      }
    }
  }

  return [...failures.values()].map(({ problem, labels }) => {
    const [first = '', ...others] = labels;
    const which = others.length === 0 ? first : `${first} and ${others.length} more`;
    return { message: problem.message.replace(SAMPLE_PLACEHOLDER, which), fix: problem.fix };
  });
}

/**
 * Stands for the samples an error is about, until they are known.
 */
const SAMPLE_PLACEHOLDER = '<samples>';

/**
 * One way a sample fails on the replacement: the top-level field at fault and the error.
 */
type SampleFailure = {
  /**
   * The top-level field the failure is about; empty when it is about none.
   */
  readonly field: string;

  /**
   * Why it fails, without the sample's values, so samples that fail alike give one error.
   */
  readonly reason: string;

  /**
   * The error, with {@link SAMPLE_PLACEHOLDER} where the samples go.
   */
  readonly problem: ReplacementProblem;
};

/**
 * How one sample fails on the replacement: it does not decode, or the replacement's `checks` reject
 * it.
 *
 * @param original - The replaced layout's contract.
 * @param replacement - The replacement's contract.
 * @param sample - Frontmatter the original accepts.
 */
function sampleFailures(
  original: AnyLayoutContract,
  replacement: AnyLayoutContract,
  sample: SampleFrontmatter,
): SampleFailure[] {
  const lead = `The original ${original.name} layout accepts ${SAMPLE_PLACEHOLDER}`;
  const decoded = decodeSlide(replacement, sample.frontmatter);
  if (Result.isFailure(decoded)) {
    return [decodeFailure(lead, sample, decoded.failure)];
  }

  const ran = runChecks(replacement, decoded.success);
  if (!ran.ok) {
    return [
      {
        field: '',
        reason: `checks failed: ${ran.reason}`,
        problem: {
          message: `${lead}, and the replacement's checks ${ran.reason}.`,
          fix: "Make the replacement's `checks` return a list of `{ path, message, fix }` problems.",
        },
      },
    ];
  }

  return ran.problems.map((problem) => ({
    field: problem.path.split(/[.[]/u)[0] ?? '',
    reason: `${problem.path}: ${problem.message}`,
    problem: {
      message: `${lead}, and the replacement's checks reject it: ${problem.path}: ${problem.message}`,
      fix: "Loosen the replacement's `checks` so they pass every slide the original accepts.",
    },
  }));
}

/**
 * The failure for a sample that does not decode as a slide of the replacement.
 *
 * @param lead - The start of the message, with {@link SAMPLE_PLACEHOLDER} where the samples go.
 * @param sample - The sample.
 * @param failure - Why it did not decode.
 */
function decodeFailure(
  lead: string,
  sample: SampleFrontmatter,
  failure: SlideDecodeFailure,
): SampleFailure {
  switch (failure.kind) {
    case 'threw':
      return {
        field: '',
        reason: `schema threw: ${failure.reason}`,
        problem: {
          message: `${lead}, and the replacement's schema threw on it: ${failure.reason}.`,
          fix:
            "Make the replacement's schema reject a value it does not accept with a schema " +
            'issue, not by throwing.',
        },
      };
    case 'rejected':
      return {
        field: failure.field,
        reason: failure.text,
        problem: {
          message:
            `${lead}${givenValue(sample, failure.field)}, and the replacement rejects it: ` +
            `${failure.text}.`,
          fix:
            "Accept every value the original accepts for its fields: widen the replacement's " +
            "schema to match the original's.",
        },
      };
  }
}

/**
 * What running a layout's `checks` gave: its problems, or why they could not be read.
 */
type ChecksRun =
  | {
      /**
       * The checks returned a list of problems.
       */
      readonly ok: true;

      /**
       * The problems; empty when the checks pass or the layout has none.
       */
      readonly problems: readonly FieldProblem[];
    }
  | {
      /**
       * The checks threw or returned something other than a list of problems.
       */
      readonly ok: false;

      /**
       * What went wrong, as the end of a sentence: `threw on it: <message>`.
       */
      readonly reason: string;
    };

/**
 * Runs a layout's `checks` on decoded frontmatter. They are user code, so a throw, or a result that
 * is not a list of problems with a string `path` and `message` (a promise, say), is returned as a
 * reason instead of failing the whole catalog.
 *
 * @param contract - The layout's contract.
 * @param frontmatter - The decoded frontmatter.
 * @returns The problems the checks report (none without `checks`), or why they could not be read.
 */
function runChecks(contract: AnyLayoutContract, frontmatter: Record<string, unknown>): ChecksRun {
  let returned: unknown;
  try {
    returned = contract.checks?.(frontmatter) ?? [];
  } catch (error) {
    return {
      ok: false,
      reason: `threw on it: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!Array.isArray(returned) || !returned.every(isFieldProblem)) {
    return { ok: false, reason: 'did not return a list of problems for it' };
  }

  return { ok: true, problems: returned };
}

/**
 * Whether a value has the parts of a {@link FieldProblem} this check reads: a string `path` and
 * `message`.
 *
 * @param value - One entry `checks` returned.
 */
function isFieldProblem(value: unknown): value is FieldProblem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    typeof value.path === 'string' &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

/**
 * The value a sample gives a field, for messages: ` (with byline: "Dana Okafor")`, shortened to
 * {@link SHOWN_VALUE_MAX_CHARS}; empty when the sample does not set the field.
 *
 * @param sample - The sample.
 * @param field - The top-level field.
 */
function givenValue(sample: SampleFrontmatter, field: string): string {
  if (field === '' || !Object.hasOwn(sample.frontmatter, field)) {
    return '';
  }

  const shown = JSON.stringify(sample.frontmatter[field]) ?? '';
  const short =
    shown.length > SHOWN_VALUE_MAX_CHARS ? `${shown.slice(0, SHOWN_VALUE_MAX_CHARS - 1)}…` : shown;
  return ` (with ${field}: ${short})`;
}

/**
 * The longest value an error quotes whole, in characters.
 */
const SHOWN_VALUE_MAX_CHARS = 60;

/**
 * The error for a title one layout requires and the other does not: the original's that the
 * replacement leaves optional, or the replacement's that the original leaves optional.
 *
 * @param original - The replaced layout's contract.
 * @param replacement - The replacement's contract.
 */
function titleProblems(
  original: AnyLayoutContract,
  replacement: AnyLayoutContract,
): ReplacementProblem[] {
  const before = original.title?.required === true;
  const after = replacement.title?.required === true;
  if (before === after) {
    return [];
  }

  if (after) {
    return [
      {
        message:
          `The replacement requires a title, and the original ${original.name} layout does ` +
          'not, so slides without one stop building.',
        fix: "Drop `required: true` from the replacement's `title`.",
      },
    ];
  }

  return [
    {
      message:
        `The original ${original.name} layout requires a title, and the replacement ` + 'does not.',
      fix: "Set `title: { required: true }` in the replacement's contract.",
    },
  ];
}

/**
 * The warning for a PowerPoint mapping the original has and the replacement does not.
 *
 * @param original - The replaced layout's contract.
 * @param replacement - The replacement's contract.
 */
function pptxWarnings(
  original: AnyLayoutContract,
  replacement: AnyLayoutContract,
): ReplacementProblem[] {
  if (original.pptx === undefined || replacement.pptx !== undefined) {
    return [];
  }

  const placeholders = original.pptx.placeholders.map((placeholder) => placeholder.kind);
  return [
    {
      message:
        `The original ${original.name} layout maps to a PowerPoint "${original.pptx.type}" ` +
        `layout (${placeholders.join(', ')}), and the replacement has no \`pptx\` mapping, so ` +
        'exported decks lose those placeholders.',
      fix:
        "Add a `pptx` mapping to the replacement's contract, pointing each placeholder at the " +
        'element or slot that holds its text.',
    },
  ];
}

/**
 * A note for every budget limit that differs between the original and the replacement.
 *
 * @param original - The replaced layout's contract.
 * @param replacement - The replacement's contract.
 */
function budgetNotes(
  original: AnyLayoutContract,
  replacement: AnyLayoutContract,
): ReplacementProblem[] {
  return limitNotes({
    layout: original.name,
    where: 'The budget',
    before: original.budget,
    after: replacement.budget,
  });
}

/**
 * A note for every variant the replacement adds or drops, and for every budget limit that differs
 * in a variant both have. Variants are matched by name.
 *
 * @param original - The replaced layout's contract.
 * @param replacement - The replacement's contract.
 */
function variantNotes(
  original: AnyLayoutContract,
  replacement: AnyLayoutContract,
): ReplacementProblem[] {
  const before = variantsByName(original);
  const after = variantsByName(replacement);
  const names = new Set([...before.keys(), ...after.keys()]);
  return [...names].flatMap((name): ReplacementProblem[] => {
    const was = before.get(name);
    const is = after.get(name);
    if (was === undefined || is === undefined) {
      return [variantPresenceNote(name, is !== undefined)];
    }

    return limitNotes({
      layout: original.name,
      where: `In the variant "${name}", the budget`,
      before: was.budget ?? {},
      after: is.budget ?? {},
    });
  });
}

/**
 * The note for a variant only one of the layouts has.
 *
 * @param name - The variant's name.
 * @param added - Whether the replacement has it (and the original not), rather than the reverse.
 */
function variantPresenceNote(name: string, added: boolean): ReplacementProblem {
  const message = added
    ? `The replacement adds the variant "${name}", so slides it matches get its budget instead ` +
      'of the base budget.'
    : `The replacement drops the variant "${name}", so slides it matches get the base budget ` +
      'instead of its budget.';
  return { message, fix: budgetFix() };
}

/**
 * The fix of every budget note: lint checks existing slides against the new budget.
 */
function budgetFix(): string {
  return (
    `Nothing to do if that is intended: \`${deckCommand()} lint\` checks existing slides ` +
    'against the new budget.'
  );
}

/**
 * What {@link limitNotes} compares: two sets of slot budgets and how to name them in messages.
 */
type LimitComparison = {
  /**
   * The replaced layout's name.
   */
  readonly layout: string;

  /**
   * How a message names the budgets, such as `The budget`.
   */
  readonly where: string;

  /**
   * The original's budgets by slot.
   */
  readonly before: Readonly<Record<string, ContentBudget | undefined>>;

  /**
   * The replacement's budgets by slot.
   */
  readonly after: Readonly<Record<string, ContentBudget | undefined>>;
};

/**
 * A note for every limit that differs between two sets of slot budgets.
 *
 * @param comparison - The budgets and how to name them.
 */
function limitNotes(comparison: LimitComparison): ReplacementProblem[] {
  const { layout, where } = comparison;
  const slots = new Set([...Object.keys(comparison.before), ...Object.keys(comparison.after)]);
  return [...slots].flatMap((slot) => {
    const before = budgetOf(comparison.before, slot);
    const after = budgetOf(comparison.after, slot);
    return BUDGET_LIMITS.flatMap((limit): ReplacementProblem[] => {
      if (before?.[limit] === after?.[limit]) {
        return [];
      }

      return [
        {
          message:
            `${where} of "${slot}" sets ${limit} to ${describeLimit(after?.[limit])}; the ` +
            `original ${layout} layout sets ${describeLimit(before?.[limit])}.`,
          fix: budgetFix(),
        },
      ];
    });
  });
}

/**
 * A layout's variants by name.
 *
 * @param contract - The layout's contract.
 */
function variantsByName(contract: AnyLayoutContract): Map<string, LayoutVariant> {
  return new Map((contract.variants ?? []).map((variant) => [variant.name, variant]));
}

/**
 * A note for a title length limit that differs between the original and the replacement.
 *
 * @param original - The replaced layout's contract.
 * @param replacement - The replacement's contract.
 */
function titleNotes(
  original: AnyLayoutContract,
  replacement: AnyLayoutContract,
): ReplacementProblem[] {
  const before = original.title?.maxChars;
  const after = replacement.title?.maxChars;
  if (before === after) {
    return [];
  }

  return [
    {
      message:
        `The title's maxChars is ${describeLimit(after)}; the original ${original.name} layout ` +
        `sets ${describeLimit(before)}.`,
      fix:
        'Nothing to do if that is intended: the build checks existing slides against the new ' +
        'limit.',
    },
  ];
}

/**
 * The budget for one slot, counting only own keys.
 *
 * @param budgets - Budgets by slot.
 * @param slot - The slot name.
 */
function budgetOf(
  budgets: Readonly<Record<string, ContentBudget | undefined>>,
  slot: string,
): ContentBudget | undefined {
  return Object.hasOwn(budgets, slot) ? budgets[slot] : undefined;
}

/**
 * A limit for messages: its number, or `no limit`.
 *
 * @param value - The limit, when one is set.
 */
function describeLimit(value: number | undefined): string {
  return value === undefined ? 'no limit' : String(value);
}

/**
 * The layout fields of an example's frontmatter, without `layout`.
 *
 * @param example - A contract's example.
 */
function exampleFrontmatter(example: LayoutExample): Readonly<Record<string, unknown>> {
  const { layout: _layout, ...fields } = example.frontmatter;
  return fields;
}

/**
 * Why {@link decodeSlide} did not decode a slide.
 */
type SlideDecodeFailure =
  | {
      /**
       * The schema rejected the frontmatter.
       */
      readonly kind: 'rejected';

      /**
       * The top-level field of the first issue; empty when it is about none.
       */
      readonly field: string;

      /**
       * The first issue, as `<path>: <message>`.
       */
      readonly text: string;
    }
  | {
      /**
       * The schema threw instead of reporting an issue, such as a transformation that throws.
       */
      readonly kind: 'threw';

      /**
       * The thrown error's message.
       */
      readonly reason: string;
    };

/**
 * Decodes frontmatter as a slide of a layout: the fields every slide has plus the layout's own,
 * rejecting fields the layout does not have, as the build does. A contract's schema is user code,
 * so a schema that throws (a transformation that throws, say) is returned as a failure instead of
 * failing the whole catalog.
 *
 * @param contract - The layout's contract.
 * @param frontmatter - The layout's fields.
 * @returns The decoded frontmatter, the first problem (its top-level field and its text as `<path>:
 *   <message>`), or what the schema threw.
 */
function decodeSlide(
  contract: AnyLayoutContract,
  frontmatter: Readonly<Record<string, unknown>>,
): Result.Result<Record<string, unknown>, SlideDecodeFailure> {
  let decoded: Exit.Exit<Record<string, unknown>, Schema.SchemaError>;
  try {
    const schema: Schema.Decoder<Record<string, unknown>> = Schema.Struct({
      ...SlideFrontmatter.fields,
      ...contract.schema.fields,
    }) as never;
    decoded = Schema.decodeUnknownExit(schema, { onExcessProperty: 'error' })({
      ...frontmatter,
      layout: contract.name,
    });
  } catch (error) {
    return Result.fail(schemaThrew(error));
  }

  if (Exit.isSuccess(decoded)) {
    return Result.succeed(decoded.value);
  }

  const failure = Cause.findErrorOption(decoded.cause);
  if (Option.isNone(failure)) {
    return Result.fail(schemaThrew(Cause.squash(decoded.cause)));
  }

  const [first] = formatIssues(failure.value.issue).issues;
  const path = first?.path?.map(String) ?? [];
  const message = first?.message ?? 'invalid';
  const text = path.length === 0 ? message : `${path.join('.')}: ${message}`;
  return Result.fail({ kind: 'rejected', field: path[0] ?? '', text });
}

/**
 * The failure for a schema that threw while decoding, or while it was built.
 *
 * @param error - What it threw.
 */
function schemaThrew(error: unknown): SlideDecodeFailure {
  return { kind: 'threw', reason: error instanceof Error ? error.message : String(error) };
}
