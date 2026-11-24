import type { AnyLayoutContract, SlotContract } from '@deckster/engine/layout';

import { Schema } from 'effect';

/**
 * The contract of a slot a layout declares, or `undefined` when it declares none by that name. Only
 * the contract's own keys count, so a slot named like an `Object` method is never found by
 * accident.
 *
 * @param contract - The layout's contract.
 * @param slot - The slot name.
 * @returns The slot's contract, or `undefined`.
 */
export function ownSlot(contract: AnyLayoutContract, slot: string): SlotContract | undefined {
  return Object.hasOwn(contract.slots, slot) ? contract.slots[slot] : undefined;
}

/**
 * The schema of one of a layout's own frontmatter fields, or `undefined` when it has no such field.
 *
 * @param contract - The layout's contract.
 * @param field - The field name.
 * @returns The field's schema, or `undefined`.
 */
export function ownField(
  contract: AnyLayoutContract,
  field: string,
): Schema.Struct.Fields[string] | undefined {
  return Object.hasOwn(contract.schema.fields, field) ? contract.schema.fields[field] : undefined;
}

/**
 * Decodes one field of a layout alone, as a slide's frontmatter would.
 *
 * @param contract - The layout's contract.
 * @param field - The field name.
 * @param input - The frontmatter to decode, which may have the field.
 * @returns The decoded object, or `undefined` when the layout has no such field or it does not
 *   decode from the input.
 */
export function decodeField(
  contract: AnyLayoutContract,
  field: string,
  input: Readonly<Record<string, unknown>>,
): object | undefined {
  const schema = ownField(contract, field);
  if (schema === undefined) {
    return undefined;
  }

  try {
    const only: Schema.Decoder<object> = Schema.Struct({ [field]: schema }) as never;
    return Schema.decodeUnknownSync(only)(input);
  } catch {
    return undefined;
  }
}

/**
 * Whether a slide must write a field: the layout has it, it fails to decode without it and it has
 * no default.
 *
 * @param contract - The layout's contract.
 * @param field - The field name.
 * @returns `false` for a field the layout does not have.
 */
export function isRequiredField(contract: AnyLayoutContract, field: string): boolean {
  return ownField(contract, field) !== undefined && decodeField(contract, field, {}) === undefined;
}
