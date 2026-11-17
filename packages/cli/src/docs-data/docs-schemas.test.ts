import { DECK_CONFIG_HINTS } from '@deckster/engine/config';
import { describe, expect, it } from 'vite-plus/test';

import { brandJsonSchema, deckConfigJsonSchema } from '#docs-data/docs-schemas.ts';

/**
 * A JSON Schema object node, as far as these tests read it.
 */
type ObjectNode = {
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly additionalProperties?: unknown;
  readonly required?: readonly string[];
};

/**
 * Every node of a JSON value that declares `properties`, depth first.
 *
 * @param value - Any JSON value.
 */
function objectNodes(value: unknown): ObjectNode[] {
  if (Array.isArray(value)) {
    return value.flatMap(objectNodes);
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const own = 'properties' in value ? [value as ObjectNode] : [];
  return [...own, ...Object.values(value).flatMap(objectNodes)];
}

describe('deckConfigJsonSchema', () => {
  it('names every deck config field, requires the title and slides and rejects others', () => {
    const schema = deckConfigJsonSchema() as ObjectNode & { $schema: string };
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(Object.keys(schema.properties ?? {}).toSorted()).toEqual(
      Object.keys(DECK_CONFIG_HINTS).toSorted(),
    );
    expect(schema.required).toEqual(['title', 'slides']);
    expect(schema.additionalProperties).toBe(false);
  });

  it('gives the same JSON on every call', () => {
    expect(JSON.stringify(deckConfigJsonSchema())).toBe(JSON.stringify(deckConfigJsonSchema()));
  });
});

describe('brandJsonSchema', () => {
  it('requires the token groups, keeps the overrides optional and closes every object', () => {
    const schema = brandJsonSchema() as ObjectNode;
    expect(schema.required).toEqual(
      expect.arrayContaining(['name', 'label', 'color', 'typography', 'chrome', 'motion']),
    );
    expect(schema.required).not.toContain('charts');
    const nodes = objectNodes(schema);
    expect(nodes.length).toBeGreaterThan(1);
    for (const node of nodes) {
      expect(node.additionalProperties).not.toBe(true);
    }
  });

  it('gives the same JSON on every call', () => {
    expect(JSON.stringify(brandJsonSchema())).toBe(JSON.stringify(brandJsonSchema()));
  });
});
