import type { AnyLayoutContract } from '@deckster/engine/layout';

import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import catalog from '#catalog.ts';
import { LIMIT_CASES } from '#layouts/limit-cases.ts';
import { checkReplacement, replacementSamples } from '#layouts/replace-check.ts';
import { titleLayoutContract } from '#layouts/title-layout.contract.ts';

/**
 * The kit's `title` contract, which most cases change one part of.
 */
const TITLE: AnyLayoutContract = titleLayoutContract;

/**
 * A copy of the kit's `title` contract with some parts changed, as a replacement would be.
 *
 * @param changes - The parts that differ.
 */
function replacement(changes: Partial<AnyLayoutContract>): AnyLayoutContract {
  return { ...TITLE, replaces: true, ...changes };
}

/**
 * The kit's `title` schema fields with some changed or removed.
 *
 * @param changes - Fields to set; `undefined` removes one.
 */
function titleFields(
  changes: Readonly<Record<string, Schema.Struct.Fields[string] | undefined>>,
): Schema.Struct<Schema.Struct.Fields> {
  const fields: Record<string, Schema.Struct.Fields[string]> = { ...TITLE.schema.fields };
  for (const [field, schema] of Object.entries(changes)) {
    if (schema === undefined) {
      Reflect.deleteProperty(fields, field);
    } else {
      fields[field] = schema;
    }
  }

  return Schema.Struct(fields);
}

/**
 * The messages of a check's errors.
 *
 * @param contract - The replacement.
 */
function errorsOf(contract: AnyLayoutContract): string[] {
  return checkReplacement(TITLE, contract).errors.map((problem) => problem.message);
}

describe('checkReplacement', () => {
  it('finds nothing wrong with an unchanged copy of any kit layout', () => {
    for (const contract of catalog.layouts) {
      const check = checkReplacement(contract, { ...contract, replaces: true });
      expect(check, contract.name).toEqual({ errors: [], warnings: [], notes: [] });
    }
  });

  it('checks the example and every limit case of every kit layout', () => {
    for (const contract of catalog.layouts) {
      const cases = LIMIT_CASES[contract.name] ?? [];
      expect(replacementSamples(contract), contract.name).toHaveLength(cases.length + 1);
    }
  });

  describe('fields (1)', () => {
    it('fails a replacement that drops a field the original accepts', () => {
      const [error] = errorsOf(replacement({ schema: titleFields({ byline: undefined }) }));
      expect(error).toContain('The replacement has no field "byline", which the original');
      expect(error).toContain('title layout accepts');
    });

    it('fails a replacement that makes a required field optional', () => {
      const original = { ...TITLE, schema: titleFields({ date: Schema.String }) };
      const loose = replacement({
        schema: titleFields({ date: Schema.optionalKey(Schema.String) }),
      });
      const [error] = checkReplacement(original, loose).errors;
      expect(error?.message).toBe(
        'The original title layout requires the field "date", and the replacement makes it optional.',
      );
    });

    it('accepts a replacement with a new optional field', () => {
      const wider = replacement({
        schema: titleFields({ kicker: Schema.optionalKey(Schema.String) }),
      });
      expect(errorsOf(wider)).toEqual([]);
    });
  });

  describe('slots (2)', () => {
    it('fails a replacement that drops a slot, naming what it accepted', () => {
      const [error] = errorsOf(replacement({ slots: { body: TITLE.slots.body! } }));
      expect(error).toBe(
        'The replacement has no slot "media", which the original title layout has (accepting image).',
      );
    });

    it('fails a replacement whose slot accepts less, or is no longer required', () => {
      const required = {
        ...TITLE,
        slots: { ...TITLE.slots, media: { ...TITLE.slots.media!, required: true } },
      };
      const narrowed = replacement({
        slots: { ...TITLE.slots, body: { ...TITLE.slots.body!, accepts: ['bullets'] } },
      });
      expect(errorsOf(narrowed)).toEqual([
        'The slot "body" accepts text in the original title layout; the replacement drops text.',
      ]);
      expect(checkReplacement(required, replacement({})).errors.map((e) => e.message)).toEqual([
        'The original title layout requires the slot "media", and the replacement does not.',
      ]);
    });

    it('accepts a replacement whose slots accept more', () => {
      const wider = replacement({
        slots: { ...TITLE.slots, body: { ...TITLE.slots.body!, accepts: ['text', 'bullets'] } },
      });
      expect(errorsOf(wider)).toEqual([]);
    });
  });

  describe('examples and limit cases (3)', () => {
    it('fails a replacement that narrows a field the limit cases fill, once per reason', () => {
      const narrow = replacement({
        schema: titleFields({
          byline: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(5))),
        }),
      });
      expect(errorsOf(narrow)).toEqual([
        'The original title layout accepts its example and 4 more (with byline: "Dana Okafor, ' +
          'Urban Forestry Division"), and the replacement rejects it: byline: Expected a value ' +
          'with a length of at most 5.',
      ]);
    });

    it('reports a dropped field once, not again for every sample that sets it', () => {
      expect(errorsOf(replacement({ schema: titleFields({ byline: undefined }) }))).toHaveLength(1);
    });

    it('fails a replacement whose checks reject the original’s example', () => {
      const strict = replacement({
        checks: () => [{ path: 'date', message: 'No dates.', fix: 'Remove it.' }],
      });
      expect(errorsOf(strict)[0]).toContain("the replacement's checks reject it: date: No dates.");
    });

    it('accepts a replacement whose checks pass', () => {
      expect(errorsOf(replacement({ checks: () => [] }))).toEqual([]);
    });
  });

  describe('budgets (5)', () => {
    it('notes every changed limit, and fails nothing', () => {
      const check = checkReplacement(
        TITLE,
        replacement({
          budget: { body: { maxWords: 10 } },
          title: { required: true, maxChars: 30 },
        }),
      );
      expect(check.errors).toEqual([]);
      expect(check.notes.map((note) => note.message)).toEqual([
        'The budget of "body" sets maxWords to 10; the original title layout sets 14.',
        "The title's maxChars is 30; the original title layout sets 36.",
      ]);
    });

    it('notes nothing for the same budgets', () => {
      expect(checkReplacement(TITLE, replacement({})).notes).toEqual([]);
    });
  });

  describe('PowerPoint (6)', () => {
    it('warns when the replacement drops the PowerPoint mapping', () => {
      const { pptx: _pptx, ...withoutPptx } = TITLE;
      const check = checkReplacement(TITLE, { ...withoutPptx, replaces: true });
      expect(check.errors).toEqual([]);
      expect(check.warnings.map((warning) => warning.message)).toEqual([
        'The original title layout maps to a PowerPoint "title" layout (title, subtitle), and ' +
          'the replacement has no `pptx` mapping, so exported decks lose those placeholders.',
      ]);
    });

    it('does not warn when the replacement maps to PowerPoint too', () => {
      expect(checkReplacement(TITLE, replacement({})).warnings).toEqual([]);
    });
  });

  describe('title (7)', () => {
    it('fails a replacement that makes a required title optional', () => {
      expect(errorsOf(replacement({ title: { maxChars: 36 } }))).toEqual([
        'The original title layout requires a title, and the replacement does not.',
      ]);
    });

    it('accepts a replacement that keeps the title required', () => {
      expect(errorsOf(replacement({ title: { required: true, maxChars: 36 } }))).toEqual([]);
    });
  });
});
