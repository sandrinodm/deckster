import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  ACTION_DUE_MAX_CHARS,
  ACTION_HEADING_MAX_CHARS,
  ACTION_OWNER_MAX_CHARS,
  ACTION_BADGE_MAX_CHARS,
  ACTION_TITLE_MAX_CHARS,
  actionsLayoutContract,
  MAX_ACTIONS,
  MIN_ACTIONS,
} from '#layouts/actions-layout.contract.ts';

/**
 * A complete action with an accountable owner and a readable period.
 */
const ACTION = { title: 'Book the crews', owner: 'Dana Okafor', due: 'Q1 2027' };

/**
 * Decode the shared and layout fields exactly as a slide does.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...actionsLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'actions', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the actions layout contract', () => {
  it('takes three to six complete actions and defaults to a static list with chrome', () => {
    expect(decode({ actions: Array(MIN_ACTIONS).fill(ACTION) })).toMatchObject({
      reveal: false,
      chrome: true,
      badge: 'In progress',
      labels: { action: 'Action', owner: 'Owner', due: 'Due' },
    });
    expect(() => decode({ actions: Array(MAX_ACTIONS).fill(ACTION) })).not.toThrow();
    expect(() => decode({ actions: Array(MIN_ACTIONS - 1).fill(ACTION) })).toThrow(
      'at least 3 actions',
    );
    expect(() => decode({ actions: Array(MAX_ACTIONS + 1).fill(ACTION) })).toThrow(
      'at most 6 actions',
    );
  });

  it('requires all three columns and refuses empty or excessive text', () => {
    for (const [field, limit] of [
      ['title', ACTION_TITLE_MAX_CHARS],
      ['owner', ACTION_OWNER_MAX_CHARS],
      ['due', ACTION_DUE_MAX_CHARS],
    ] as const) {
      for (const value of [undefined, '', 'x'.repeat(limit + 1)]) {
        expect(() => decode({ actions: [{ ...ACTION, [field]: value }, ACTION, ACTION] })).toThrow(
          field,
        );
      }

      expect(() =>
        decode({ actions: [{ ...ACTION, [field]: 'x'.repeat(limit) }, ACTION, ACTION] }),
      ).not.toThrow();
    }
  });

  it('accepts translated badge and labels with defaults for omitted columns', () => {
    const actions = [ACTION, ACTION, ACTION];
    expect(decode({ actions, badge: 'En cours', labels: { due: 'Échéance' } })).toMatchObject({
      badge: 'En cours',
      labels: { action: 'Action', owner: 'Owner', due: 'Échéance' },
    });
    expect(() => decode({ actions, badge: 'x'.repeat(ACTION_BADGE_MAX_CHARS) })).not.toThrow();
    for (const badge of ['', 'x'.repeat(ACTION_BADGE_MAX_CHARS + 1)]) {
      expect(() => decode({ actions, badge })).toThrow('badge');
    }

    for (const heading of ['action', 'owner', 'due']) {
      expect(() =>
        decode({ actions, labels: { [heading]: 'x'.repeat(ACTION_HEADING_MAX_CHARS) } }),
      ).not.toThrow();
      for (const value of ['', 'x'.repeat(ACTION_HEADING_MAX_CHARS + 1)]) {
        expect(() => decode({ actions, labels: { [heading]: value } })).toThrow(heading);
      }
    }
  });

  it('marks one action by number and checks it against the actual list', () => {
    const actions = [ACTION, ACTION, ACTION];
    expect(decode({ actions, current: 2, reveal: true })).toMatchObject({
      current: 2,
      reveal: true,
    });
    for (const current of [0, 1.5, MAX_ACTIONS + 1]) {
      expect(() => decode({ actions, current })).toThrow('current');
    }

    expect(actionsLayoutContract.checks?.({ actions, current: 3 } as never)).toEqual([]);
    expect(actionsLayoutContract.checks?.({ actions, current: 4 } as never)).toEqual([
      expect.objectContaining({ path: 'current', fix: expect.any(String) }),
    ]);
  });

  it('maps the title and context to PowerPoint and rejects unknown fields', () => {
    expect(actionsLayoutContract.pptx).toMatchObject({
      type: 'title-only',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
    expect(() => decode({ actions: [ACTION, ACTION, ACTION], status: 'Old' })).toThrow('excess');
    expect(() => decode({ actions: [ACTION, ACTION, ACTION], highlight: 2 })).toThrow(
      'Expected no excess property',
    );
  });
});
