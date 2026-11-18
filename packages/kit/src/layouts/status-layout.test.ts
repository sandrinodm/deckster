import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  MAX_STATUS_ITEMS,
  MIN_STATUS_ITEMS,
  STATUS_NAME_MAX_CHARS,
  STATUS_LABEL_MAX_CHARS,
  STATUS_NOTE_MAX_CHARS,
  STATUS_OWNER_MAX_CHARS,
  STATUS_STATES,
  statusLayoutContract,
} from '#layouts/status-layout.contract.ts';

/**
 * A complete workstream without an owner.
 */
const ITEM = { name: 'Planting', status: 'on-track', note: 'The last trees arrive on Friday.' };

/**
 * Decodes the layout and common fields with the same excess-property policy as a deck build.
 *
 * @param frontmatter - The report fields without the layout name.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...statusLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'status', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the status layout contract', () => {
  it('accepts three to seven workstreams and rejects either count outside the range', () => {
    for (let count = MIN_STATUS_ITEMS; count <= MAX_STATUS_ITEMS; count += 1) {
      expect(() => decode({ items: Array(count).fill(ITEM) })).not.toThrow();
    }

    expect(() => decode({ items: Array(MIN_STATUS_ITEMS - 1).fill(ITEM) })).toThrow('at least 3');
    expect(() => decode({ items: Array(MAX_STATUS_ITEMS + 1).fill(ITEM) })).toThrow('at most 7');
  });

  it('accepts every named state and refuses arbitrary status text', () => {
    for (const status of STATUS_STATES) {
      expect(() => decode({ items: Array(3).fill({ ...ITEM, status }) })).not.toThrow();
    }

    expect(() => decode({ items: Array(3).fill({ ...ITEM, status: 'green' }) })).toThrow(
      'on-track',
    );
  });

  it('takes mixed ownership and defaults to a static report with chrome', () => {
    expect(decode({ items: [ITEM, ITEM, ITEM] })).toMatchObject({ items: [ITEM, ITEM, ITEM] });
    const decoded = Schema.decodeUnknownSync(statusLayoutContract.schema)({
      items: [ITEM, ITEM, ITEM],
    });
    expect(decoded.items[0]).not.toHaveProperty('owner');
    expect(decode({ items: [ITEM, { ...ITEM, owner: 'Dana Okafor' }, ITEM] })).toMatchObject({
      reveal: false,
      chrome: true,
      labels: {
        name: 'Workstream',
        status: 'Status',
        owner: 'Owner',
        note: 'Update',
        'on-track': 'On track',
        'at-risk': 'At risk',
        blocked: 'Blocked',
        done: 'Done',
      },
    });
    expect(decode({ items: Array(3).fill(ITEM), reveal: true, chrome: false })).toMatchObject({
      reveal: true,
      chrome: false,
    });
    expect(() => decode({ items: Array(3).fill({ ...ITEM, note: '' }) })).toThrow(
      'length of at least 1',
    );
    expect(() => decode({ items: Array(3).fill({ status: 'done', note: 'Complete' }) })).toThrow(
      'name',
    );
  });

  it('accepts each text field at its limit and refuses one character more', () => {
    for (const [field, limit] of [
      ['name', STATUS_NAME_MAX_CHARS],
      ['owner', STATUS_OWNER_MAX_CHARS],
      ['note', STATUS_NOTE_MAX_CHARS],
    ] as const) {
      expect(() =>
        decode({ items: Array(3).fill({ ...ITEM, [field]: 'x'.repeat(limit) }) }),
      ).not.toThrow();
      expect(() =>
        decode({ items: Array(3).fill({ ...ITEM, [field]: 'x'.repeat(limit + 1) }) }),
      ).toThrow(`at most ${limit} characters`);
    }
  });

  it('accepts partial labels and bounds every column and state label', () => {
    const items = Array(MIN_STATUS_ITEMS).fill(ITEM);
    expect(decode({ items, labels: { name: 'Team', blocked: 'Blocked' } })).toMatchObject({
      labels: { name: 'Team', blocked: 'Blocked' },
    });

    for (const key of ['name', 'status', 'owner', 'note', ...STATUS_STATES]) {
      expect(() =>
        decode({ items, labels: { [key]: 'x'.repeat(STATUS_LABEL_MAX_CHARS) } }),
      ).not.toThrow();
      expect(() =>
        decode({ items, labels: { [key]: 'x'.repeat(STATUS_LABEL_MAX_CHARS + 1) } }),
      ).toThrow(`at most ${STATUS_LABEL_MAX_CHARS} characters`);
      expect(() => decode({ items, labels: { [key]: '' } })).toThrow('length of at least 1');
    }

    expect(() => decode({ items, labels: { unknown: 'Label' } })).toThrow(
      'Expected no excess property',
    );
  });

  it('rejects unknown item fields and maps native title and context placeholders', () => {
    expect(() => decode({ items: Array(3).fill({ ...ITEM, colour: 'green' }) })).toThrow(
      'Expected no excess property',
    );
    expect(statusLayoutContract.pptx).toMatchObject({
      type: 'title-only',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
  });
});
