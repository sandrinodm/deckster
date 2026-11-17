import type { BrandTokens } from '@deckster/brand';

import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect } from 'effect';

import type { ElementSnapshot, SlideRule } from '#lint/types.ts';

import { CARD_FIXTURE_BRAND, fixtureBrandTokens } from '#lint/fixture-brands.fixture.ts';
import { diagramBadgeOverlapRule } from '#lint/rules/diagram-badge-overlap.ts';
import { diagramCardMissingRule } from '#lint/rules/diagram-card-missing.ts';
import { diagramEdgeOverlapRule } from '#lint/rules/diagram-edge-overlap.ts';
import { diagramLabelOverlapRule } from '#lint/rules/diagram-label-overlap.ts';
import { diagramLongWordRule } from '#lint/rules/diagram-long-word.ts';
import { diagramOverlapRule } from '#lint/rules/diagram-overlap.ts';
import { diagramSmallTextRule } from '#lint/rules/diagram-small-text.ts';
import { diagramTooDenseRule } from '#lint/rules/diagram-too-dense.ts';
import { diagramUnlabeledEdgeRule } from '#lint/rules/diagram-unlabeled-edge.ts';
import { element, slideRuleInput, testBrandTokens } from '#lint/snapshot.fixture.ts';

/**
 * The messages a rule reports for the given elements.
 *
 * @param rule - The rule.
 * @param tokens - The brand.
 * @param elements - The slide's elements.
 */
function messages(rule: SlideRule, tokens: BrandTokens, elements: ElementSnapshot[]): string[] {
  return rule.check(slideRuleInput(tokens, { elements })).map((violation) => violation.message);
}

/**
 * A diagram root at index 0 with the given data.
 *
 * @param data - Its `data-*` attributes.
 */
function root(data: Record<string, string>): ElementSnapshot {
  return element({
    index: 0,
    selector: 'figure.kit-diagram',
    data: { diagram: 'flow', 'diagram-id': 'stack', ...data },
    rect: { x: 0, y: 0, width: 1600, height: 700 },
  });
}

/**
 * A part of the diagram.
 *
 * @param index - Its index.
 * @param overrides - Its fields.
 */
function part(index: number, overrides: Partial<ElementSnapshot>): ElementSnapshot {
  return element({ index, parent: 0, selector: `div:nth-of-type(${index})`, ...overrides });
}

layer(NodeServices.layer)('diagram lint rules', (it) => {
  it.effect(
    'diagram-too-dense reports a diagram over the node budget, or cramped, and not one within it',
    () =>
      Effect.gen(function* () {
        const tokens = yield* testBrandTokens('default');
        expect(
          messages(diagramTooDenseRule, tokens, [
            root({ 'diagram-nodes': '14', 'diagram-edges': '9' }),
          ]),
        ).toEqual([
          'The <Flow> "stack" shows 14 nodes and 9 edges at once; a slide carries about 12 nodes and 16 edges.',
        ]);
        expect(
          messages(diagramTooDenseRule, tokens, [
            root({ 'diagram-nodes': '6', 'diagram-edges': '6', 'diagram-cramped': 'true' }),
          ])[0],
        ).toContain('tighter than its gutters');
        expect(
          messages(diagramTooDenseRule, tokens, [
            root({ 'diagram-nodes': '6', 'diagram-edges': '7' }),
          ]),
        ).toEqual([]);
      }),
  );

  it.effect(
    'diagram-label-overlap reports a label over a node or another label, or flagged by the kit',
    () =>
      Effect.gen(function* () {
        const tokens = yield* testBrandTokens('default');
        const node = part(1, {
          text: 'OrdersPostgres',
          data: { 'diagram-part': 'node', 'node-title': 'Orders' },
          rect: { x: 100, y: 100, width: 200, height: 100 },
        });
        const over = part(2, {
          text: 'SQL',
          data: { 'diagram-part': 'edge-label' },
          rect: { x: 250, y: 120, width: 60, height: 30 },
        });
        const clear = part(3, {
          text: 'HTTPS',
          data: { 'diagram-part': 'edge-label' },
          rect: { x: 500, y: 120, width: 80, height: 30 },
        });
        const flagged = part(4, {
          text: 'gRPC',
          data: { 'diagram-part': 'edge-label', 'label-overlap': 'true' },
          rect: { x: 900, y: 120, width: 60, height: 30 },
        });
        expect(
          messages(diagramLabelOverlapRule, tokens, [root({}), node, over, clear, flagged]),
        ).toEqual([
          'The <Flow> "stack" has the edge label "SQL" over the node "Orders".',
          'The <Flow> "stack" has the edge label "gRPC" squeezed against the edge label "HTTPS".',
        ]);
      }),
  );

  it.effect(
    'diagram-unlabeled-edge reports doubled edges and unlabeled siblings of labeled ones only',
    () =>
      Effect.gen(function* () {
        const tokens = yield* testBrandTokens('default');
        const edge = (index: number, from: string, to: string, label?: string) =>
          part(index, {
            data: {
              'diagram-part': 'edge',
              edge: `${from}->${to}#${index}`,
              'edge-from': from,
              'edge-to': to,
              ...(label === undefined ? {} : { 'edge-label': label }),
            },
          });
        const found = messages(diagramUnlabeledEdgeRule, tokens, [
          root({}),
          edge(1, 'api', 'db', 'SQL'),
          edge(2, 'api', 'cache'),
          edge(3, 'web', 'api'),
          edge(4, 'a', 'b'),
          edge(5, 'b', 'a'),
        ]);
        expect(found).toEqual([
          'The <Flow> "stack" has an unlabeled edge from "api" to "cache" that a reader cannot tell apart from its neighbours.',
          'The <Flow> "stack" has an unlabeled edge from "a" to "b" that a reader cannot tell apart from its neighbours.',
          'The <Flow> "stack" has an unlabeled edge from "b" to "a" that a reader cannot tell apart from its neighbours.',
        ]);
      }),
  );

  it.effect(
    'diagram-small-text reports text drawn under the caption and label steps, once per diagram',
    () =>
      Effect.gen(function* () {
        const tokens = yield* testBrandTokens('default');
        const small = part(1, { text: 'Dock 3', fontSizePx: 14, inSvg: true });
        const smaller = part(2, { text: 'Dock 4', fontSizePx: 12, inSvg: true });
        const label = part(3, { text: 'VPC', fontSizePx: 22 });
        expect(messages(diagramSmallTextRule, tokens, [root({}), small, smaller, label])).toEqual([
          'The <Flow> "stack" sets "Dock 3" at 14px, under the brand\'s 22px for diagram text.',
        ]);
        expect(messages(diagramSmallTextRule, tokens, [root({}), label])).toEqual([]);
      }),
  );

  it.effect('names a diagram by its title rather than a generated id', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      expect(
        messages(diagramTooDenseRule, tokens, [
          root({
            'diagram-id': 'flow-r3',
            'diagram-title': 'Checkout path',
            'diagram-nodes': '14',
            'diagram-edges': '2',
          }),
        ])[0],
      ).toContain('The <Flow> "Checkout path" shows 14 nodes');
    }),
  );

  it.effect('diagram-overlap reports parts drawn on top of each other as an error', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      expect(diagramOverlapRule.severity).toBe('error');
      expect(
        messages(diagramOverlapRule, tokens, [
          root({ 'diagram-overlap': '"CDN" and "WAF"; group "Edge" and group "Core"' }),
        ]),
      ).toEqual([
        'The <Flow> "stack" draws "CDN" and "WAF"; group "Edge" and group "Core" on top of each other.',
      ]);
      expect(messages(diagramOverlapRule, tokens, [root({})])).toEqual([]);
    }),
  );

  it.effect('diagram-edge-overlap warns about edges left on one line', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      expect(
        messages(diagramEdgeOverlapRule, tokens, [
          root({ 'diagram-edge-overlap': 'the edge "a to d" and the edge "b to c"' }),
        ]),
      ).toEqual([
        'The <Flow> "stack" runs the edge "a to d" and the edge "b to c" along one line, so they read as one edge.',
      ]);
    }),
  );

  it.effect('diagram-badge-overlap warns about a badge left on an edge', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      expect(
        messages(diagramBadgeOverlapRule, tokens, [
          root({ 'diagram-badge-overlap': '"Payments" badge on the edge "api to pay"' }),
        ]),
      ).toEqual([
        'The <Flow> "stack" draws "Payments" badge on the edge "api to pay", hiding part of the line or its arrowhead.',
      ]);
      expect(messages(diagramBadgeOverlapRule, tokens, [root({})])).toEqual([]);
      expect(diagramBadgeOverlapRule.severity).toBe('warning');
    }),
  );

  it.effect('diagram-long-word names the text a diagram had to break or cut', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const found = messages(diagramLongWordRule, tokens, [
        root({ 'diagram-long-text': 'the edge label "OrderCancelledAfterShipmentEvent"' }),
      ]);
      expect(found).toEqual([
        'The <Flow> "stack" has to break or cut the edge label "OrderCancelledAfterShipmentEvent": a word is wider than the room it has.',
      ]);
      expect(messages(diagramLongWordRule, tokens, [root({})])).toEqual([]);
    }),
  );

  it.effect(
    'diagram-card-missing reports each card name the brand lacks once per diagram, with a fix',
    () =>
      Effect.gen(function* () {
        const tokens = yield* fixtureBrandTokens(CARD_FIXTURE_BRAND);
        const node = (index: number, title: string, data: Record<string, string>) =>
          part(index, { data: { 'diagram-part': 'node', 'node-title': title, ...data } });
        const shape = part(1, {
          data: { 'diagram-part': 'node-shape', card: 'default', 'card-missing': 'zebra-stripe' },
        });
        const orders = node(2, 'Orders', { card: 'default', 'card-missing': 'zebra-stripe' });
        const ledger = node(3, 'Ledger', { card: 'tint', 'card-missing': 'zebra-stripe' });
        const fine = node(4, 'Cache', { card: 'raised' });
        // A stylesheet older than the brand marks a card the brand has: not reported.
        const stale = node(5, 'Queue', { card: 'default', 'card-missing': 'dark' });
        const band = part(6, { data: { 'diagram-part': 'layer', 'card-missing': 'tnt' } });
        const bandTitle = part(7, { parent: 6, text: 'Edge' });
        const violations = diagramCardMissingRule.check(
          slideRuleInput(tokens, {
            elements: [root({}), shape, orders, ledger, fine, stale, band, bandTitle],
          }),
        );
        expect(violations.map((violation) => violation.message)).toEqual([
          'The <Flow> "stack" asks for the card "zebra-stripe" on the node "Orders" and the node ' +
            '"Ledger", which the card-fixture brand does not have, so they are drawn with the ' +
            'next card in the order (the card for their kind, else "default").',
          'The <Flow> "stack" asks for the card "tnt" on the layer "Edge", which the card-fixture ' +
            "brand does not have, so it is drawn with the stack's own look.",
        ]);
        const cards = 'default, outline, solid, tint, raised, dark, paper';
        expect(Object.keys(tokens.diagram.cards).join(', ')).toBe(cards);
        expect(violations[0]?.fix).toBe(
          'Change the `card` on the <Flow> tag, or on each of those parts, in ' +
            `decks/test/slides/s.mdx to one of the card-fixture brand's cards: ${cards}. The ` +
            'standard cards (default, outline, solid, tint, raised) exist in every brand, so a ' +
            'deck that uses only those renders in any brand.',
        );
        expect(violations[1]?.fix).toBe(
          'Did you mean "tint"? Change the `card` in decks/test/slides/s.mdx to one of the ' +
            `card-fixture brand's cards: ${cards}. The standard cards (default, outline, solid, ` +
            'tint, raised) exist in every brand, so a deck that uses only those renders in any ' +
            'brand.',
        );
        expect(violations[0]?.selector).toBe(orders.selector);
        expect(diagramCardMissingRule.severity).toBe('warning');
        expect(messages(diagramCardMissingRule, tokens, [root({}), fine])).toEqual([]);
      }),
  );
});
