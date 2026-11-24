import type {
  AnyLayoutContract,
  ContentBudget,
  LayoutExample,
  SlotContract,
} from '@deckster/engine/layout';

import { deckCommand } from '@deckster/engine/command';
import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { BODY_SLOT } from '@deckster/engine/slots';
import { Result, Schema, SchemaIssue } from 'effect';

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
   * drops or narrows, or an example of the original it rejects. The replacement must not be used.
   */
  readonly errors: readonly ReplacementProblem[];

  /**
   * Slides still build but lose something: a PowerPoint mapping the replacement does not have.
   */
  readonly warnings: readonly ReplacementProblem[];

  /**
   * Changes worth knowing about: every budget and title limit that differs from the original.
   * Tighter limits are allowed; lint then flags the slides over them.
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
 * deck written for the original: every field the original requires stays required and every field
 * it accepts is accepted; every slot it has stays, required where it was, accepting at least what
 * it accepted; its example and every limit case of the kit's stress test (`LIMIT_CASES`) decode
 * against the replacement and pass its `checks`; and a required title stays required. A dropped
 * PowerPoint mapping is a warning, and every changed budget or title limit a note.
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
    notes: [...budgetNotes(original, replacement), ...titleNotes(original, replacement)],
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
 * The errors for the original's fields: one the replacement does not have, and one the original
 * requires that the replacement leaves optional.
 *
 * @param original - The replaced layout's contract.
 * @param replacement - The replacement's contract.
 */
function fieldProblems(
  original: AnyLayoutContract,
  replacement: AnyLayoutContract,
): ReplacementProblem[] {
  const name = original.name;
  return Object.keys(original.schema.fields).flatMap((field): ReplacementProblem[] => {
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
}

/**
 * The errors for the original's slots: one the replacement drops, makes optional where the original
 * requires it, or lets accept less than the original did. `body`, which every layout has, can only
 * lose its `required` flag or what it accepts.
 *
 * @param original - The replaced layout's contract.
 * @param replacement - The replacement's contract.
 */
function slotProblems(
  original: AnyLayoutContract,
  replacement: AnyLayoutContract,
): ReplacementProblem[] {
  return Object.keys(original.slots).flatMap((slot): ReplacementProblem[] => {
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
 * limit cases that fail to decode or fail the replacement's `checks`.
 *
 * @param original - The replaced layout's contract.
 * @param replacement - The replacement's contract.
 */
function sampleProblems(
  original: AnyLayoutContract,
  replacement: AnyLayoutContract,
): ReplacementProblem[] {
  return replacementSamples(original).flatMap((sample): ReplacementProblem[] => {
    const shown = JSON.stringify(sample.frontmatter);
    const decoded = decodeSlide(replacement, sample.frontmatter);
    if (Result.isFailure(decoded)) {
      return [
        {
          message:
            `The original ${original.name} layout accepts ${sample.label} (${shown}), and the ` +
            `replacement rejects it: ${decoded.failure}.`,
          fix:
            "Accept every value the original accepts for its fields: widen the replacement's " +
            "schema to match the original's.",
        },
      ];
    }

    const failed = replacement.checks?.(decoded.success) ?? [];
    return failed.map((problem) => ({
      message:
        `The original ${original.name} layout accepts ${sample.label} (${shown}), and the ` +
        `replacement's checks reject it: ${problem.path}: ${problem.message}`,
      fix: "Loosen the replacement's `checks` so they pass every slide the original accepts.",
    }));
  });
}

/**
 * The error for a title the original requires and the replacement does not.
 *
 * @param original - The replaced layout's contract.
 * @param replacement - The replacement's contract.
 */
function titleProblems(
  original: AnyLayoutContract,
  replacement: AnyLayoutContract,
): ReplacementProblem[] {
  if (original.title?.required !== true || replacement.title?.required === true) {
    return [];
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
  const slots = new Set([...Object.keys(original.budget), ...Object.keys(replacement.budget)]);
  return [...slots].flatMap((slot) => {
    const before = budgetOf(original, slot);
    const after = budgetOf(replacement, slot);
    return BUDGET_LIMITS.flatMap((limit): ReplacementProblem[] => {
      if (before?.[limit] === after?.[limit]) {
        return [];
      }

      return [
        {
          message:
            `The budget of "${slot}" sets ${limit} to ${describeLimit(after?.[limit])}; the ` +
            `original ${original.name} layout sets ${describeLimit(before?.[limit])}.`,
          fix:
            `Nothing to do if that is intended: \`${deckCommand()} lint\` checks existing ` +
            'slides against the new budget.',
        },
      ];
    });
  });
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
 * A layout's budget for one slot.
 *
 * @param contract - The layout's contract.
 * @param slot - The slot name.
 */
function budgetOf(contract: AnyLayoutContract, slot: string): ContentBudget | undefined {
  const budget: Readonly<Record<string, ContentBudget | undefined>> = contract.budget;
  return Object.hasOwn(budget, slot) ? budget[slot] : undefined;
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
 * Decodes frontmatter as a slide of a layout: the fields every slide has plus the layout's own,
 * rejecting fields the layout does not have, as the build does.
 *
 * @param contract - The layout's contract.
 * @param frontmatter - The layout's fields.
 * @returns The decoded frontmatter, or the first problem as `<path>: <message>`.
 */
function decodeSlide(
  contract: AnyLayoutContract,
  frontmatter: Readonly<Record<string, unknown>>,
): Result.Result<Record<string, unknown>, string> {
  const schema: Schema.Decoder<Record<string, unknown>> = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...contract.schema.fields,
  }) as never;
  const decoded = Schema.decodeUnknownResult(schema, { onExcessProperty: 'error' })({
    ...frontmatter,
    layout: contract.name,
  });
  if (Result.isSuccess(decoded)) {
    return Result.succeed(decoded.success);
  }

  const [first] = formatIssues(decoded.failure.issue).issues;
  const where = first?.path?.map(String).join('.') ?? '';
  return Result.fail(where === '' ? (first?.message ?? 'invalid') : `${where}: ${first?.message}`);
}
