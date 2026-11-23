import * as NodeServices from '@effect/platform-node/NodeServices';
import { afterAll, describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { collectDocsData, writeDocsData } from '#data/collect-data.ts';
import { brandJsonSchema, deckConfigJsonSchema } from '#data/json-schemas.ts';
import { deckOutput } from '#data/run-deck.ts';
import { REPO_ROOT } from '#scratch-workspace.fixture.ts';
import { DECK_BIN } from '#script-support.ts';

/**
 * The workspace's `deckster`. The tests ask it for the CLI reference too, so its help is the
 * repository's wording; `data.ts` asks the packed CLI instead.
 */
const DECK = { executable: DECK_BIN, prefix: [] };

/**
 * A small allowlist: one deck and two brands, out of their alphabetical order.
 */
const OPTIONS = {
  root: REPO_ROOT,
  decks: ['hello'],
  brands: ['nocturne', 'default'],
  deck: DECK,
  installedDeck: DECK,
};

/**
 * The files the export writes, one per key of the collected data.
 */
const FILES = [
  'layouts.json',
  'components.json',
  'charts.json',
  'diagrams.json',
  'icons.json',
  'cli.json',
  'brands.json',
  'slides.json',
  'brand-schema.json',
  'deck-config.json',
  'meta.json',
];

/**
 * How long a test that starts `deckster` a few times may take, in milliseconds.
 */
const DECK_TEST_TIMEOUT_MS = 60_000;

/**
 * The export, collected once: it starts `deckster` about twenty times.
 */
const data = await Effect.runPromise(
  collectDocsData(OPTIONS).pipe(Effect.provide(NodeServices.layer)),
);

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-data-'));

afterAll(() => {
  fs.rmSync(out, { recursive: true, force: true });
});

/**
 * A value as it reads back from JSON, so it compares with parsed command output.
 *
 * @param value - Any JSON value.
 */
function asJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

/**
 * What a `deckster` command line prints, parsed as JSON.
 *
 * @param argv - The arguments after `deckster`.
 */
const printedJson = Effect.fn('printedJson')(function* (argv: readonly string[]) {
  return JSON.parse(yield* deckOutput(DECK, REPO_ROOT, argv)) as unknown;
});

describe('collectDocsData', () => {
  it.effect(
    'gives each catalog exactly as its command prints it with --json',
    () =>
      Effect.gen(function* () {
        expect(data.layouts).toEqual(yield* printedJson(['layouts', 'hello', '--json']));
        expect(asJson(data.components)).toEqual(yield* printedJson(['components', '--json']));
        expect(asJson(data.charts)).toEqual(yield* printedJson(['charts', '--json']));
        expect(asJson(data.diagrams)).toEqual(yield* printedJson(['diagrams', '--json']));
        expect(data.icons).toEqual(
          yield* printedJson(['icons', '--brand', 'nocturne,default', '--json']),
        );
      }).pipe(Effect.provide(NodeServices.layer)),
    DECK_TEST_TIMEOUT_MS,
  );

  it.effect(
    'gives each allowlisted brand, in allowlist order, with deckster brand --json tokens',
    () =>
      Effect.gen(function* () {
        const { brands } = data.brands;
        expect(brands.map((brand) => brand.name)).toEqual(['nocturne', 'default']);
        for (const brand of brands) {
          expect(asJson(brand.tokens), brand.name).toEqual(
            yield* printedJson(['brand', brand.name, '--json']),
          );
          expect(brand.label, brand.name).toBe(brand.tokens.label);
          expect(brand.description, brand.name).toMatch(/^\S.*\.$/);
        }
      }).pipe(Effect.provide(NodeServices.layer)),
    DECK_TEST_TIMEOUT_MS,
  );

  it.effect(
    'gives every command of deckster --help with its summary, usage lines and full help',
    () =>
      Effect.gen(function* () {
        const { cli } = data;
        expect(cli.commands.length).toBeGreaterThan(1);
        for (const command of cli.commands) {
          for (const form of command.usage) {
            expect(form, command.name).toMatch(new RegExp(`^\\S+ ${command.name}\\b`));
          }
        }

        const lint = cli.commands.find((command) => command.name === 'lint');
        expect(`${lint?.help}\n`).toBe(yield* deckOutput(DECK, REPO_ROOT, ['lint', '--help']));
        const usage = (name: string) =>
          cli.commands.find((command) => command.name === name)?.usage ?? [];
        expect(usage('brand').some((form) => form.includes('brand check'))).toBe(true);
        // The first form of `deckster present` wraps over four lines of its help.
        expect(usage('present')).toHaveLength(2);
        expect(usage('present')[0]).toContain('[--agent-web]');
      }).pipe(Effect.provide(NodeServices.layer)),
    DECK_TEST_TIMEOUT_MS,
  );

  it('gives the brand and deck config JSON Schemas', () => {
    expect(data['brand-schema']).toEqual(brandJsonSchema());
    expect(data['deck-config']).toEqual(deckConfigJsonSchema());
  });

  it('gives the slides of the allowlisted decks only, and the allowlist in meta', () => {
    expect(data.slides.decks.map((deck) => deck.name)).toEqual(['hello']);
    expect(data.slides.decks[0]?.slides.map((slide) => slide.id)).toEqual([
      'title',
      'steps',
      'live-counter',
      'closing',
    ]);
    expect(data.meta.decks).toEqual(['hello']);
    expect(data.meta.brands).toEqual(['nocturne', 'default']);
    expect(data.meta.version).toBe(data.cli.version);
    expect(data.meta.commit).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('writeDocsData', () => {
  it.effect(
    'writes one JSON file per part, identical on a second run',
    () =>
      Effect.gen(function* () {
        yield* writeDocsData(out, data);
        const first = new Map(
          FILES.map((name) => [name, fs.readFileSync(path.join(out, name), 'utf8')]),
        );
        yield* writeDocsData(out, yield* collectDocsData(OPTIONS));
        expect(fs.readdirSync(out).toSorted()).toEqual(FILES.toSorted());
        for (const name of FILES) {
          const text = fs.readFileSync(path.join(out, name), 'utf8');
          expect(text, name).toBe(first.get(name));
          expect(text.endsWith('}\n'), name).toBe(true);
          expect(text, name).not.toContain(REPO_ROOT);
        }
      }).pipe(Effect.provide(NodeServices.layer)),
    DECK_TEST_TIMEOUT_MS,
  );
});
