import type { SlotContentKind } from '@deckster/engine/layout';

import { deckCommand } from '@deckster/engine/command';

import type { RuleViolation, SlideRule, SlotSnapshot } from '#lint/types.ts';

/**
 * The kinds that are one block each (a table, a chart, a photo), which a slot made for exactly one
 * of them holds once.
 */
const SINGLE_BLOCK_KINDS = new Set<string>(['table', 'chart', 'diagram', 'code', 'image', 'video']);

/**
 * The kinds that also take a measured kind: a slot for text takes headings, quotes and numbers set
 * as text; a slot for quotes or numbers takes the text around them.
 */
const ALSO_ACCEPTED_BY: ReadonlyMap<string, readonly SlotContentKind[]> = new Map([
  ['text', ['text', 'quote', 'number', 'heading']],
  ['heading', ['heading', 'text']],
  ['quote', ['quote', 'text']],
  ['number', ['number', 'text']],
]);

/**
 * How a measured kind is named in messages.
 */
const KIND_NAMES: ReadonlyMap<string, string> = new Map([
  ['heading', 'a heading'],
  ['quote', 'a quote'],
  ['number', 'a number'],
  ['table', 'a table'],
  ['chart', 'a chart'],
  ['diagram', 'a diagram'],
  ['image', 'an image'],
  ['video', 'a video'],
]);

/**
 * How several blocks of a single-block kind are named in messages.
 */
const KIND_PLURALS: ReadonlyMap<string, string> = new Map([
  ['table', 'tables'],
  ['chart', 'charts'],
  ['diagram', 'diagrams'],
  ['code', 'code blocks'],
  ['image', 'images'],
  ['video', 'videos'],
]);

/**
 * Content a slot's layout is not designed for: a list in a slot that does not take bullets (a
 * statement, a section summary), a kind the contract's `accepts` does not list (text or a second
 * table in the table layout's one-table slot, a chart in a caption), or more than one block in a
 * slot made for exactly one table, chart, diagram, code block, image or video. A slot that accepts
 * `component` takes anything. What each slot accepts comes from the layout's contract (`deck
 * layouts --json`).
 */
export const slotContentRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'slot-content',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Slot content does not change with the step.
   */
  scope: 'slide',

  /**
   * The slide renders, but not as the layout was designed.
   */
  severity: 'error',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description:
    "A slot holds content its layout's contract does not accept: a list where it takes no " +
    'bullets, another kind than it lists, or more than the one table, chart or image it is for.',

  /**
   * Reports each slot with a list it does not take, kinds it does not accept, or more than one
   * block where it takes exactly one.
   */
  check: ({ snapshot, layout }) =>
    snapshot.slots.flatMap((slot): RuleViolation[] => {
      const contract =
        layout !== undefined && Object.hasOwn(layout.slots, slot.name)
          ? layout.slots[slot.name]
          : undefined;
      const accepts = contract?.accepts;
      if (accepts === undefined || layout === undefined) {
        return [];
      }

      const selector = `[data-slot="${slot.name}"]`;
      const listed = listViolations(slot, layout.name, accepts, selector);
      if (accepts.includes('component')) {
        return listed;
      }

      return [
        ...listed,
        ...kindViolations(slot, layout.name, contract?.description, accepts, selector),
      ];
    }),
};

/**
 * The violation of a slot that holds a list while its layout takes no bullets, if it does.
 *
 * @param slot - The measured slot.
 * @param layoutName - The layout's name, for the message.
 * @param accepts - What the contract lists for the slot.
 * @param selector - The slot's selector.
 */
function listViolations(
  slot: SlotSnapshot,
  layoutName: string,
  accepts: readonly SlotContentKind[],
  selector: string,
): RuleViolation[] {
  const holdsList = slot.bullets > 0 && !accepts.includes('bullets');
  if (!holdsList) {
    return [];
  }

  return [
    {
      message:
        `The ${slot.name} slot holds a list of ${slot.bullets} items; the ${layoutName} ` +
        `layout sets it as ${accepts.join(' or ')}.`,
      fix:
        'Write it as a sentence, or move the points to a layout made for a list (content or ' +
        'split; `' +
        deckCommand() +
        ' layouts`).',
      selector,
    },
  ];
}

/**
 * The violation of a slot that holds kinds its contract does not accept, or more than one block
 * where it takes exactly one, if it does.
 *
 * @param slot - The measured slot.
 * @param layoutName - The layout's name, for the message.
 * @param description - The contract's description, which the fix starts with.
 * @param accepts - What the contract lists for the slot.
 * @param selector - The slot's selector.
 */
function kindViolations(
  slot: SlotSnapshot,
  layoutName: string,
  description: string | undefined,
  accepts: readonly SlotContentKind[],
  selector: string,
): RuleViolation[] {
  const unaccepted = unacceptedKinds(slot, accepts);
  const single = accepts.length === 1 && SINGLE_BLOCK_KINDS.has(accepts[0] ?? '');
  const kind = accepts[0] ?? '';
  const count = slot.kinds?.[kind] ?? 0;
  const severalBlocks = single && count > 1;
  if (unaccepted.length === 0 && !severalBlocks) {
    return [];
  }

  const held = [
    ...unaccepted.map((entry) => KIND_NAMES.get(entry) ?? entry),
    ...(severalBlocks ? [`${count} ${KIND_PLURALS.get(kind) ?? kind}`] : []),
  ];
  return [
    {
      message:
        `The ${slot.name} slot holds ${held.join(' and ')}; the ${layoutName} layout ` +
        `takes ${single ? `exactly one: ${kind}` : accepts.join(', ')} there.`,
      fix: `${description ?? ''} Move the rest to another slide or slot.`.trim(),
      selector,
    },
  ];
}

/**
 * The kinds a slot holds that its contract accepts in no form; lists are reported on their own.
 *
 * @param slot - The measured slot.
 * @param accepts - What the contract lists.
 */
function unacceptedKinds(slot: SlotSnapshot, accepts: readonly SlotContentKind[]): string[] {
  return Object.entries(slot.kinds ?? {})
    .filter(([kind, count]) => count > 0 && kind !== 'bullets')
    .map(([kind]) => kind)
    .filter((kind) => {
      const acceptedBy: readonly string[] = ALSO_ACCEPTED_BY.get(kind) ?? [kind];
      return !accepts.some((entry) => acceptedBy.includes(entry));
    });
}
