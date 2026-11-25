import { Effect, type Scope } from 'effect';
import fs from 'node:fs';
import path from 'node:path';

import { FIXTURE_WORKSPACE } from '#lint/lint.fixtures.ts';
import { scratchWorkspace } from '#lint/scratch-workspace.fixture.ts';

/**
 * The fixture deck with code layouts: `funnel` and `broken` of its own, on the `code-brand` brand
 * with its `kpi-wall`.
 */
export const CODE_LAYOUTS_DECK = 'code-layouts';

/**
 * The fixture brand with the code layout `kpi-wall`.
 */
export const CODE_BRAND = 'code-brand';

/**
 * Makes a scratch workspace with a copy of {@link CODE_LAYOUTS_DECK} and the {@link CODE_BRAND}
 * brand, removed when the scope closes. Its `brands/` is a folder of its own, so a test may add
 * layouts to it.
 *
 * @returns The workspace root.
 */
export const codeLayoutsWorkspace = Effect.fn('codeLayoutsWorkspace')(
  function* (): Effect.fn.Return<string, never, Scope.Scope> {
    const root = scratchWorkspace('deck-code-layouts-', [CODE_BRAND]);
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
    );
    fs.cpSync(
      path.join(FIXTURE_WORKSPACE, 'decks', CODE_LAYOUTS_DECK),
      path.join(root, 'decks', CODE_LAYOUTS_DECK),
      { recursive: true },
    );
    return root;
  },
);

/**
 * Writes a code layout folder whose `contract.ts` throws while it loads, and whose `layout.tsx` is
 * a valid component, so the only problem is the contract. Before it throws, the contract sets
 * `globalThis[marker]` to `true`, which tells a test whether it ran in the test's own process;
 * contracts may import nothing that writes files. A contract is evaluated first in a separate check
 * process, and one that throws there never runs in the test's process, so the marker stays unset
 * even when the contract was loaded: the problem it reports (`the <name> contract does not load`)
 * is what shows it ran.
 *
 * @param layoutsDir - The brand's or the deck's `layouts/` folder.
 * @param name - The layout name.
 * @param marker - The global the contract sets when it runs.
 */
export function writeThrowingLayout(layoutsDir: string, name: string, marker: string): void {
  writeLayoutFixture(layoutsDir, name, [
    `Reflect.set(globalThis, ${JSON.stringify(marker)}, true);`,
    `throw new Error(${JSON.stringify(`the ${name} contract does not load`)});`,
  ]);
}

/**
 * Writes a valid code layout that marks the process evaluating its contract. The marker can detect
 * an in-process load after the contract passes its check in a separate process.
 *
 * @param layoutsDir - The brand's or deck's `layouts/` folder.
 * @param name - The layout name.
 * @param marker - The global the contract sets when it runs.
 */
export function writeMarkedLayout(layoutsDir: string, name: string, marker: string): void {
  writeLayoutFixture(layoutsDir, name, [
    "import { defineLayoutContract } from '@deckster/engine/layout';",
    "import { Schema } from 'effect';",
    '',
    `Reflect.set(globalThis, ${JSON.stringify(marker)}, true);`,
    'export default defineLayoutContract({',
    `  name: ${JSON.stringify(name)},`,
    "  description: 'A layout with a contract evaluation marker.',",
    '  schema: Schema.Struct({}),',
    "  slots: { body: { description: 'The text.', accepts: ['text'] } },",
    '  budget: { body: { maxWords: 20 } },',
    "  example: { frontmatter: {}, body: 'A short example.\\n' },",
    '});',
  ]);
}

/**
 * Writes a fixture's contract and an inert layout component.
 */
function writeLayoutFixture(layoutsDir: string, name: string, contract: readonly string[]): void {
  const dir = path.join(layoutsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'contract.ts'), [...contract, ''].join('\n'));
  fs.writeFileSync(
    path.join(dir, 'layout.tsx'),
    [
      "import { defineLayout } from '@deckster/engine';",
      '',
      `export default defineLayout({ name: ${JSON.stringify(name)}, component: () => null });`,
      '',
    ].join('\n'),
  );
}

/**
 * Writes the brand's `layouts.ts` with one data layout for each name, all falling back to the same
 * layout.
 *
 * @param brandDir - The brand folder.
 * @param names - The names of the data layouts.
 * @param fallback - The layout each one falls back to.
 */
export function writeDataLayouts(
  brandDir: string,
  names: readonly string[],
  fallback: string,
): void {
  const layouts = names.map((name) => ({
    name,
    label: name,
    description: 'Text next to a picture.',
    fallback,
    title: { box: [120, 80, 1680, 160] },
    regions: [{ bind: { slot: 'body' }, kind: 'text', box: [120, 300, 1680, 600] }],
  }));
  fs.writeFileSync(
    path.join(brandDir, 'layouts.ts'),
    [
      "import { defineBrandLayouts } from '@deckster/brand';",
      `export default defineBrandLayouts(${JSON.stringify(layouts)});`,
      '',
    ].join('\n'),
  );
}

/**
 * Reads and clears the marker written by a fixture contract in this process.
 *
 * @param marker - The global the contract sets.
 */
export function contractRan(marker: string): boolean {
  const ran = Reflect.get(globalThis, marker) === true;
  Reflect.deleteProperty(globalThis, marker);
  return ran;
}

/**
 * What {@link writeTitleReplacement} writes.
 */
export type TitleReplacementOptions = {
  /**
   * Accept only `treatment: plain`, as the kit's `title` accepts any treatment name: no example or
   * limit case of the kit sets one, so only a slide with another treatment shows that the
   * replacement is narrower.
   */
  readonly narrowTreatment?: boolean;
};

/**
 * Writes a code layout folder named `title` that replaces the kit's cover. It accepts every field
 * and slot of the kit's, with a tighter body budget and no PowerPoint mapping when the kit's has
 * one, so loading it gives a note and a warning.
 *
 * @param layoutsDir - The brand's or the deck's `layouts/` folder.
 * @param options - Whether to narrow a field.
 */
export function writeTitleReplacement(
  layoutsDir: string,
  options: TitleReplacementOptions = {},
): void {
  const dir = path.join(layoutsDir, 'title');
  fs.mkdirSync(dir, { recursive: true });
  const treatment =
    options.narrowTreatment === true
      ? "Schema.optionalKey(Schema.Literals(['plain']))"
      : 'TreatmentField';
  fs.writeFileSync(
    path.join(dir, 'contract.ts'),
    [
      "import { defineLayoutContract } from '@deckster/engine/layout';",
      "import { AlignField, chromeField, EyebrowField, TreatmentField } from '@deckster/kit/layout-fields';",
      "import { Effect, Schema } from 'effect';",
      '',
      'export default defineLayoutContract({',
      "  name: 'title',",
      '  replaces: true,',
      "  description: 'A brand cover that replaces the kit cover.',",
      '  schema: Schema.Struct({',
      '    eyebrow: EyebrowField,',
      '    byline: Schema.optionalKey(Schema.NonEmptyString.check(Schema.isMaxLength(40))),',
      '    date: Schema.optionalKey(Schema.NonEmptyString.check(Schema.isMaxLength(24))),',
      `    treatment: ${treatment},`,
      "    picture: Schema.Literals(['side', 'full']).pipe(",
      "      Schema.withDecodingDefaultKey(Effect.succeed<'side' | 'full'>('side')),",
      '    ),',
      '    align: AlignField,',
      '    chrome: chromeField(false),',
      '  }),',
      '  title: { required: true, maxChars: 36 },',
      '  slots: {',
      "    body: { description: 'The subtitle.', accepts: ['text'] },",
      "    media: { description: 'A cover photo.', accepts: ['image'] },",
      '  },',
      '  budget: { body: { maxWords: 12 } },',
      '  example: {',
      "    frontmatter: { title: 'Shade is infrastructure', eyebrow: 'Budget briefing' },",
      "    body: 'A ten-year canopy plan.\\n',",
      '  },',
      '});',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(dir, 'layout.tsx'),
    [
      "import { defineLayout } from '@deckster/engine';",
      '',
      "export default defineLayout({ name: 'title', component: () => null });",
      '',
    ].join('\n'),
  );
}
