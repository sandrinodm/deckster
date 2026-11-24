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
 * `globalThis[marker]` to `true`, which tells a test whether it ran; contracts may import nothing
 * that writes files.
 *
 * @param layoutsDir - The brand's or the deck's `layouts/` folder.
 * @param name - The layout name.
 * @param marker - The global the contract sets when it runs.
 */
export function writeThrowingLayout(layoutsDir: string, name: string, marker: string): void {
  const dir = path.join(layoutsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'contract.ts'),
    [
      `Reflect.set(globalThis, ${JSON.stringify(marker)}, true);`,
      `throw new Error('the ${name} contract does not load');`,
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(dir, 'layout.tsx'),
    [
      "import { defineLayout } from '@deckster/engine';",
      '',
      `export default defineLayout({ name: '${name}', component: () => null });`,
      '',
    ].join('\n'),
  );
}

/**
 * Whether a contract written by {@link writeThrowingLayout} ran, and forgets that it did.
 *
 * @param marker - The global the contract sets.
 */
export function contractRan(marker: string): boolean {
  const ran = Reflect.get(globalThis, marker) === true;
  Reflect.deleteProperty(globalThis, marker);
  return ran;
}
