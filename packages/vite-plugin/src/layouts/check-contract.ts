import type { AnyLayoutContract, ContentBudget } from '@deckster/engine/layout';

import { SLIDE_FRONTMATTER_HINTS, SlideFrontmatter } from '@deckster/engine/frontmatter';
import { SLOT_CONTENT_KINDS } from '@deckster/engine/layout';
import { KEBAB_CASE_PATTERN } from '@deckster/engine/names';
import {
  BODY_SLOT,
  SLOT_ELEMENT,
  SLOT_NAME_PATTERN,
  SLOTS_ELEMENT,
  slotTag,
} from '@deckster/engine/slots';
import { Effect, Predicate, Result, Schema } from 'effect';

import type { Problem } from '#errors.ts';

import { decodeFields } from '#validation/decode-fields.ts';

/**
 * Component names MDX slides use without importing them, which a slot tag must not shadow.
 */
const RESERVED_TAGS = new Set(['Step', 'Notes', SLOTS_ELEMENT, SLOT_ELEMENT]);

/**
 * The limits a content budget may set.
 */
const BUDGET_LIMITS = new Set(['maxWords', 'maxBullets', 'maxLines']);

/**
 * The content kinds a slot may accept.
 */
const CONTENT_KINDS = new Set<string>(SLOT_CONTENT_KINDS);

/**
 * The frontmatter fields every slide has, which a layout's schema must not redefine.
 */
const BASE_FIELDS = new Set(Object.keys(SlideFrontmatter.fields));

/**
 * The brackets that mark a list in a limit's path, such as the `[]` of `stats[].label`.
 */
const LIST_BRACKETS_PATTERN = /\[\]$/u;

/**
 * The schema a slide that names this layout is decoded with: the fields every slide has plus the
 * layout's own.
 *
 * @param contract - The layout's contract.
 */
export function slideSchemaFor(
  contract: AnyLayoutContract,
): Schema.Struct<typeof SlideFrontmatter.fields> {
  return Schema.Struct({ ...SlideFrontmatter.fields, ...contract.schema.fields });
}

/**
 * The fixes for every field of a slide that names this layout.
 *
 * @param contract - The layout's contract.
 */
export function slideHintsFor(contract: AnyLayoutContract): Readonly<Record<string, string>> {
  const hints: Record<string, string> = { ...SLIDE_FRONTMATTER_HINTS };
  for (const [field, hint] of Object.entries(contract.hints ?? {})) {
    if (typeof hint === 'string') {
      hints[field] = hint;
    }
  }

  return hints;
}

/**
 * Everything wrong with a layout contract, each with its fix: a name that is not kebab-case, a
 * missing description, a default surface that is not a surface name, schema fields that redefine a
 * field every slide has, slot names that are not camelCase or shadow a built-in component, slots
 * without a description or with unknown content kinds, budgets for slots the layout lacks, and an
 * example whose frontmatter does not decode.
 *
 * @param value - The contract as the catalog module exports it.
 * @param generated - Whether the contract is generated from a brand layout. Its example can have an
 *   empty body when every slot is optional or the layout has no slots.
 * @returns The problems; empty for a valid contract.
 */
export function checkContract(value: unknown, generated = false): Problem[] {
  if (!isContractShape(value)) {
    return [
      {
        message: 'A catalog entry is not a layout contract.',
        fix:
          'List contracts made with ' +
          '`defineLayoutContract({ name, description, schema, slots, budget, example })`.',
      },
    ];
  }

  const where = `Layout "${value.name}"`;
  return [
    ...nameProblems(value, where),
    ...surfaceProblems(value, where),
    ...fieldProblems(value, where),
    ...Object.entries(value.slots).flatMap(([slot, contract]) =>
      slotProblems(slot, contract, where),
    ),
    ...budgetProblems(value, where),
    ...variantProblems(value, where),
    ...titleProblems(value, where),
    ...checksProblems(value, where),
    ...exampleProblems(value, where, generated),
  ];
}

/**
 * Whether a value has the fields of a contract with the right types, so the detailed checks can
 * read them.
 *
 * @param value - A catalog entry.
 */
function isContractShape(value: unknown): value is AnyLayoutContract {
  return (
    Predicate.isObject(value) &&
    typeof value.name === 'string' &&
    Schema.isSchema(value.schema) &&
    Predicate.isObject(Reflect.get(value.schema, 'fields')) &&
    Predicate.isObject(value.slots) &&
    Predicate.isObject(value.budget) &&
    Predicate.isObject(value.example)
  );
}

/**
 * Problems with the layout's name and description.
 *
 * @param contract - The contract.
 * @param where - The layout, for messages.
 */
function nameProblems(contract: AnyLayoutContract, where: string): Problem[] {
  const problems: Problem[] = [];
  if (!KEBAB_CASE_PATTERN.test(contract.name)) {
    problems.push({
      message: `${where}: the name is not kebab-case.`,
      fix: 'Name the layout in lowercase words joined by hyphens, such as "split" or "big-number".',
    });
  }

  if (typeof contract.description !== 'string' || contract.description.trim() === '') {
    problems.push({
      message: `${where} has no description.`,
      fix: 'Say in a sentence when to use the layout; `deckster layouts` prints it for agents.',
    });
  }

  return problems;
}

/**
 * Problems with the layout's default surface: one that is not a kebab-case surface name.
 *
 * @param contract - The contract.
 * @param where - The layout, for messages.
 */
function surfaceProblems(contract: AnyLayoutContract, where: string): Problem[] {
  const { surface } = contract;
  if (surface === undefined || (typeof surface === 'string' && KEBAB_CASE_PATTERN.test(surface))) {
    return [];
  }

  return [
    {
      message: `${where}: the default surface is not a kebab-case surface name.`,
      fix: 'Name a brand surface such as "accent" or "inverse", or leave `surface` out.',
    },
  ];
}

/**
 * Problems with the layout's frontmatter fields: names that every slide already has.
 *
 * @param contract - The contract.
 * @param where - The layout, for messages.
 */
function fieldProblems(contract: AnyLayoutContract, where: string): Problem[] {
  return Object.keys(contract.schema.fields)
    .filter((field) => BASE_FIELDS.has(field))
    .map((field) => ({
      message: `${where} redefines the "${field}" field, which every slide has.`,
      fix: `Remove "${field}" from the layout's schema, or give the layout's field another name.`,
    }));
}

/**
 * Problems with one slot: its name and tag, its description and the content kinds it accepts.
 *
 * @param slot - The slot name.
 * @param contract - What the layout says about it.
 * @param where - The layout, for messages.
 */
function slotProblems(slot: string, contract: unknown, where: string): Problem[] {
  const problems: Problem[] = [];
  if (!SLOT_NAME_PATTERN.test(slot)) {
    problems.push({
      message: `${where}: the slot name "${slot}" is not camelCase.`,
      fix:
        'Name slots with a lowercase letter, then letters and digits, ' +
        'such as "left" or "quoteSource".',
    });
  }

  if (RESERVED_TAGS.has(slotTag(slot))) {
    problems.push({
      message:
        `${where}: the slot "${slot}" would be written <${slotTag(slot)}>, ` +
        'a built-in component.',
      fix: 'Give the slot another name.',
    });
  }

  if (!Predicate.isObject(contract) || typeof contract.description !== 'string') {
    problems.push({
      message: `${where}: the slot "${slot}" has no description.`,
      fix: 'Describe what goes in the slot: `{ description, accepts, required }`.',
    });
    return problems;
  }

  const accepts = Array.isArray(contract.accepts) ? contract.accepts : [];
  const unknownKinds = accepts.filter((kind) => !CONTENT_KINDS.has(String(kind)));
  if (accepts.length === 0 || unknownKinds.length > 0) {
    problems.push({
      message: `${where}: the slot "${slot}" accepts ${describeKinds(accepts, unknownKinds)}.`,
      fix: `List what the slot is for from: ${SLOT_CONTENT_KINDS.join(', ')}.`,
    });
  }

  return problems;
}

/**
 * Problems with the content budget: budgets for slots the layout does not have, unknown limits and
 * limits that are not positive integers.
 *
 * @param contract - The contract.
 * @param where - The layout, for messages.
 */
function budgetProblems(contract: AnyLayoutContract, where: string): Problem[] {
  const slots = new Set([...Object.keys(contract.slots), BODY_SLOT]);
  return Object.entries(contract.budget).flatMap(([slot, budget]): Problem[] => {
    if (!slots.has(slot)) {
      return [
        {
          message: `${where} budgets "${slot}", which is not one of its slots.`,
          fix: `Budget only its slots: ${[...slots].join(', ')}.`,
        },
      ];
    }

    return limitProblems(slot, budget, where, contract);
  });
}

/**
 * Problems with the limits of one slot's budget.
 *
 * @param slot - The slot name.
 * @param budget - Its budget.
 * @param where - The layout, for messages.
 */
function limitProblems(
  slot: string,
  budget: ContentBudget | undefined,
  where: string,
  contract: AnyLayoutContract,
): Problem[] {
  const invalid = Object.entries(budget ?? {})
    .filter(([limit, value]) => !BUDGET_LIMITS.has(limit) || !isPositiveInteger(value))
    .map(([limit]) => ({
      message:
        `${where}: the "${slot}" budget's "${limit}" is not a limit the build knows, ` +
        'or not a positive integer.',
      fix: `Use ${[...BUDGET_LIMITS].join(', ')}, each a whole number of 1 or more.`,
    }));
  // Prose wraps at the brand's type size, so a line budget on it would pass in one brand and fail
  // in another; only lines that never wrap (code) are budgeted in lines.
  const accepts =
    (Object.hasOwn(contract.slots, slot) ? contract.slots[slot]?.accepts : undefined) ?? [];
  const wraps = budget?.maxLines !== undefined && !accepts.includes('code');
  return wraps
    ? [
        ...invalid,
        {
          message:
            `${where}: the "${slot}" budget sets maxLines, but the slot holds prose, whose ` +
            "lines depend on the brand's type size.",
          fix:
            'Budget prose in maxWords and maxBullets, which every brand counts alike; keep ' +
            'maxLines for slots that accept code.',
        },
      ]
    : invalid;
}

/**
 * Problems with the layout's variants: unnamed ones, conditions on fields the layout does not have
 * or slots it lacks, field limits on paths outside its fields, and budgets for unknown slots or
 * with invalid limits.
 *
 * @param contract - The contract.
 * @param where - The layout, for messages.
 */
function variantProblems(contract: AnyLayoutContract, where: string): Problem[] {
  const slots = new Set([...Object.keys(contract.slots), BODY_SLOT]);
  const fields = new Set([...Object.keys(contract.schema.fields), ...BASE_FIELDS]);
  return (contract.variants ?? []).flatMap((variant, index): Problem[] => {
    const name = typeof variant.name === 'string' && variant.name !== '' ? variant.name : undefined;
    const label = `${where}: variant ${name === undefined ? `#${index + 1}` : `"${name}"`}`;
    const problems: Problem[] = [];
    if (name === undefined) {
      problems.push({ message: `${label} has no name.`, fix: 'Name it, such as "ratio 5:7".' });
    }

    const conditionFields = [
      ...Object.keys(variant.when.fields ?? {}),
      ...Object.keys(variant.when.counts ?? {}),
    ];
    for (const field of conditionFields.filter((key) => !fields.has(key))) {
      problems.push({
        message: `${label} selects on "${field}", which is not a field of the layout.`,
        fix: `Select on one of: ${[...fields].join(', ')}.`,
      });
    }

    for (const slot of (variant.when.filled ?? []).filter((key) => !slots.has(key))) {
      problems.push({
        message: `${label} needs the slot "${slot}" filled, which the layout does not have.`,
        fix: `Name one of its slots: ${[...slots].join(', ')}.`,
      });
    }

    for (const [path, limit] of Object.entries(variant.fields ?? {})) {
      const field = path.split('.')[0]?.replace(LIST_BRACKETS_PATTERN, '') ?? '';
      if (!fields.has(field)) {
        problems.push({
          message: `${label} limits "${path}", which is not in a field of the layout.`,
          fix: `Limit a path into one of: ${[...fields].join(', ')}, such as "stats[].label".`,
        });
      } else if (!isPositiveInteger(limit.maxChars)) {
        problems.push({
          message: `${label}: the limit on "${path}" has no maxChars of 1 or more.`,
          fix: 'Give the most characters the field may have, such as `{ maxChars: 32 }`.',
        });
      }
    }

    for (const [slot, budget] of Object.entries(variant.budget)) {
      problems.push(
        ...(slots.has(slot)
          ? limitProblems(slot, budget, label, contract)
          : [
              {
                message: `${label} budgets "${slot}", which is not one of its slots.`,
                fix: `Budget only its slots: ${[...slots].join(', ')}.`,
              },
            ]),
      );
    }

    return problems;
  });
}

/**
 * Problems with the layout's title contract: a length that is not a positive integer.
 *
 * @param contract - The contract.
 * @param where - The layout, for messages.
 */
function titleProblems(contract: AnyLayoutContract, where: string): Problem[] {
  const max = contract.title?.maxChars;
  if (max === undefined || isPositiveInteger(max)) {
    return [];
  }

  return [
    {
      message: `${where}: the title's maxChars is not a positive integer.`,
      fix: 'Give the longest title the layout sets, in characters, such as `maxChars: 60`.',
    },
  ];
}

/**
 * Problems with the example: frontmatter that does not decode as a slide of this layout, or a body
 * that is not text.
 *
 * @param contract - The contract.
 * @param where - The layout, for messages.
 * @param generated - Whether the example was generated from the brand layout's regions.
 */
function exampleProblems(
  contract: AnyLayoutContract,
  where: string,
  generated: boolean,
): Problem[] {
  const { example } = contract;
  const problems: Problem[] = [];
  const bodyMayBeBlank = generated && !Object.values(contract.slots).some((slot) => slot?.required);
  if (typeof example.body !== 'string' || (!bodyMayBeBlank && example.body.trim() === '')) {
    problems.push({
      message: `${where}: the example has no body.`,
      fix: 'Write the MDX of a slide that uses the layout well in `example.body`.',
    });
  }

  const decoded = Effect.runSync(
    Effect.result(
      decodeFields(
        { ...example.frontmatter, layout: contract.name },
        {
          schema: slideSchemaFor(contract),
          hints: slideHintsFor(contract),
          what: 'frontmatter',
          ref: { file: '', displayPath: '' },
        },
      ),
    ),
  );
  if (Result.isFailure(decoded)) {
    for (const problem of decoded.failure.problems) {
      problems.push({
        message: `${where}: example frontmatter: ${problem.message}`,
        fix: problem.fix,
      });
    }
  } else if (contract.checks !== undefined) {
    for (const problem of contract.checks(decoded.success)) {
      problems.push({
        message: `${where}: example frontmatter: ${problem.path}: ${problem.message}`,
        fix: problem.fix,
      });
    }
  }

  return problems;
}

/**
 * Problems with the layout's cross-field checks: `checks` that is not a function.
 *
 * @param contract - The contract.
 * @param where - The layout, for messages.
 */
function checksProblems(contract: AnyLayoutContract, where: string): Problem[] {
  const checks: unknown = Reflect.get(contract, 'checks');
  return checks === undefined || typeof checks === 'function'
    ? []
    : [
        {
          message: `${where}: \`checks\` is not a function.`,
          fix:
            'Write `checks(frontmatter) { return [] }` returning `{ path, message, fix }` ' +
            'problems.',
        },
      ];
}

/**
 * What a slot accepts that is wrong, for the message: nothing, or the unknown kinds.
 *
 * @param accepts - What the slot lists.
 * @param unknownKinds - The entries that are not content kinds.
 */
function describeKinds(accepts: readonly unknown[], unknownKinds: readonly unknown[]): string {
  return accepts.length === 0 ? 'nothing' : unknownKinds.map(String).join(', ');
}

/**
 * Whether a value is an integer of 1 or more.
 *
 * @param value - Any value.
 */
function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}
