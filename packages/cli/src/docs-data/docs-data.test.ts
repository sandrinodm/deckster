import { FRAMEWORK_ROOT } from '@deckster/brand/node';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { afterAll, describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runCaptured } from '#cli.fixture.ts';
import { COMMANDS } from '#cli.ts';
import { commandHelp, type Command } from '#command.ts';
import { collectDocsData, writeDocsData } from '#docs-data/docs-data.ts';
import { brandJsonSchema, deckConfigJsonSchema } from '#docs-data/docs-schemas.ts';

/**
 * A small allowlist: one deck and two brands, out of their alphabetical order.
 */
const OPTIONS = { root: FRAMEWORK_ROOT, decks: ['hello'], brands: ['nocturne', 'default'] };

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
 * Words only the repository checkout's help uses (`pnpm` commands, the workspace package of a new
 * deck), which the published CLI never prints.
 */
const WORKSPACE_ONLY_WORDS = ['pnpm', 'package.json', '--filter'];

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
 * What a `deck` command line prints, parsed as JSON.
 *
 * @param argv - The arguments after `deck`.
 */
const printedJson = Effect.fn('printedJson')(function* (argv: readonly string[]) {
  const { output } = yield* runCaptured(argv);
  return JSON.parse(output) as unknown;
});

describe('collectDocsData', () => {
  it.effect('gives each catalog exactly as its command prints it with --json', () =>
    Effect.gen(function* () {
      const data = yield* collectDocsData(OPTIONS);
      expect(asJson(data.layouts)).toEqual(yield* printedJson(['layouts', 'hello', '--json']));
      expect(asJson(data.components)).toEqual(yield* printedJson(['components', '--json']));
      expect(asJson(data.charts)).toEqual(yield* printedJson(['charts', '--json']));
      expect(asJson(data.diagrams)).toEqual(yield* printedJson(['diagrams', '--json']));
      expect(asJson(data.icons)).toEqual(
        yield* printedJson(['icons', '--brand', 'nocturne,default', '--json']),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('gives each allowlisted brand, in allowlist order, with deck brand --json tokens', () =>
    Effect.gen(function* () {
      const { brands } = (yield* collectDocsData(OPTIONS)).brands;
      expect(brands.map((brand) => brand.name)).toEqual(['nocturne', 'default']);
      for (const brand of brands) {
        expect(asJson(brand.tokens), brand.name).toEqual(
          yield* printedJson(['brand', brand.name, '--json']),
        );
        expect(brand.label, brand.name).toBe(brand.tokens.label);
        expect(brand.description, brand.name).toMatch(/^\S.*\.$/);
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('gives every command with its summary, usage lines and full help', () =>
    Effect.gen(function* () {
      const { cli } = yield* collectDocsData(OPTIONS);
      expect(cli.commands.map((command) => command.name)).toEqual(
        COMMANDS.map((command) => command.name),
      );
      for (const [index, command] of cli.commands.entries()) {
        const source = COMMANDS[index];
        expect(source?.name).toBe(command.name);
        expect(command.help, command.name).toBe(yield* commandHelp(source as Command, true));
        for (const form of command.usage) {
          expect(form, command.name).toMatch(new RegExp(`^\\S+ ${command.name}\\b`));
        }
      }

      const usage = (name: string) =>
        cli.commands.find((command) => command.name === name)?.usage ?? [];
      expect(usage('brand').some((form) => form.includes('brand check'))).toBe(true);
      // The first form of `deck present` wraps over four lines of its help.
      expect(usage('present')).toHaveLength(2);
      expect(usage('present')[0]).toContain('[--agent-web]');
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('gives the help the published CLI prints, without the repository-only lines', () =>
    Effect.gen(function* () {
      const { cli } = yield* collectDocsData(OPTIONS);
      const reworded: string[] = [];
      for (const command of cli.commands) {
        // The program name comes from DECKSTER_COMMAND, which scripts/docs-data.ts sets to `deck`;
        // under the tests it is the repository's `pnpm deck`.
        const published = command.help.replaceAll(cli.command, 'deck');
        for (const word of WORKSPACE_ONLY_WORDS) {
          expect(published, `${command.name}: ${word}`).not.toContain(word);
        }

        // The tests run in the repository, so the CLI prints the repository's wording.
        const { output } = yield* runCaptured([command.name, '--help']);
        if (output !== command.help) {
          reworded.push(command.name);
        }
      }

      expect(reworded).toEqual(['present', 'new']);
      const help = (name: string) =>
        cli.commands.find((command) => command.name === name)?.help ?? '';
      expect(help('present')).toContain('`deck present` prints the command when it is missing');
      expect(help('new')).toContain('optional duration), and a first slide');
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('gives the brand and deck config JSON Schemas', () =>
    Effect.gen(function* () {
      const data = yield* collectDocsData(OPTIONS);
      expect(data['brand-schema']).toEqual(brandJsonSchema());
      expect(data['deck-config']).toEqual(deckConfigJsonSchema());
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('gives the slides of the allowlisted decks only, and the allowlist in meta', () =>
    Effect.gen(function* () {
      const data = yield* collectDocsData(OPTIONS);
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
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe('writeDocsData', () => {
  it.effect('writes one JSON file per part, identical on a second run', () =>
    Effect.gen(function* () {
      yield* writeDocsData(out, yield* collectDocsData(OPTIONS));
      const first = new Map(
        FILES.map((name) => [name, fs.readFileSync(path.join(out, name), 'utf8')]),
      );
      yield* writeDocsData(out, yield* collectDocsData(OPTIONS));
      expect(fs.readdirSync(out).toSorted()).toEqual(FILES.toSorted());
      for (const name of FILES) {
        const text = fs.readFileSync(path.join(out, name), 'utf8');
        expect(text, name).toBe(first.get(name));
        expect(text.endsWith('}\n'), name).toBe(true);
        expect(text, name).not.toContain(FRAMEWORK_ROOT);
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
