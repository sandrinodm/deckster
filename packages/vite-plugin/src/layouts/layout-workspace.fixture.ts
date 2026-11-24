import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The global a fixture contract counts its evaluations in, so a test can prove a file did not run.
 */
export const RUNS_KEY = '__decksterContractRuns';

/**
 * How often fixture contracts have been evaluated in this process.
 */
export function contractRuns(): number {
  const runs: unknown = Reflect.get(globalThis, RUNS_KEY);
  return typeof runs === 'number' ? runs : 0;
}

/**
 * Forgets the evaluations counted so far.
 */
export function resetContractRuns(): void {
  Reflect.deleteProperty(globalThis, RUNS_KEY);
}

/**
 * What a fixture contract is written with.
 */
export type ContractSourceOptions = {
  /**
   * The contract's description; `Columns.` when left out.
   */
  readonly description?: string;

  /**
   * Import lines placed above the contract.
   */
  readonly imports?: readonly string[];

  /**
   * An expression used as the description instead of the literal, such as an imported constant.
   */
  readonly descriptionExpression?: string;

  /**
   * Whether the contract says `replaces: true`.
   */
  readonly replaces?: boolean;
};

/**
 * The source of a valid `contract.ts` with one required `body` slot, which counts each evaluation
 * under {@link RUNS_KEY}.
 *
 * @param name - The layout name.
 * @param options - The description, extra imports and whether it replaces a kit layout.
 */
export function contractSource(name: string, options: ContractSourceOptions = {}): string {
  const description =
    options.descriptionExpression ?? JSON.stringify(options.description ?? 'Columns.');
  return [
    "import { defineLayoutContract } from '@deckster/engine/layout';",
    "import { Schema } from 'effect';",
    ...(options.imports ?? []),
    '',
    `Reflect.set(globalThis, '${RUNS_KEY}', (Reflect.get(globalThis, '${RUNS_KEY}') ?? 0) + 1);`,
    '',
    'export default defineLayoutContract({',
    `  name: ${JSON.stringify(name)},`,
    ...(options.replaces === true ? ['  replaces: true,'] : []),
    `  description: ${description},`,
    "  schema: Schema.Struct({ gap: Schema.optionalKey(Schema.Literals(['tight', 'loose'])) }),",
    "  slots: { body: { description: 'The content.', required: true, accepts: ['text'] } },",
    '  budget: {},',
    "  example: { frontmatter: {}, body: 'Hello\\n' },",
    '});',
    '',
  ].join('\n');
}

/**
 * The source of a `contract.ts` named `default` that replaces the kit's `default` layout and fits
 * it: the same required `body` slot, without a PowerPoint mapping.
 *
 * @param budget - The body budget, as a source literal; the kit's own when left out.
 */
export function defaultReplacementSource(budget = '{ maxWords: 80, maxBullets: 6 }'): string {
  return [
    "import { defineLayoutContract } from '@deckster/engine/layout';",
    "import { Schema } from 'effect';",
    '',
    'export default defineLayoutContract({',
    "  name: 'default',",
    '  replaces: true,',
    "  description: 'The brand default.',",
    '  schema: Schema.Struct({}),',
    '  slots: {',
    '    body: {',
    "      description: 'The content.',",
    '      required: true,',
    "      accepts: ['heading', 'text', 'bullets', 'image', 'component'],",
    '    },',
    '  },',
    `  budget: { body: ${budget} },`,
    "  example: { frontmatter: {}, body: 'Hello\\n' },",
    '});',
    '',
  ].join('\n');
}

/**
 * The source of a `layout.tsx` that registers a component under a name.
 *
 * @param name - The layout name.
 * @param text - Text the component renders before the body, to tell versions apart.
 */
export function componentSource(name: string, text = ''): string {
  return [
    "import { defineLayout, type LayoutProps } from '@deckster/engine';",
    '',
    "import type contract from './contract.ts';",
    '',
    'function Component({ slots }: LayoutProps<typeof contract>) {',
    `  return <div data-layout=${JSON.stringify(name)}>${text}{slots.body}</div>;`,
    '}',
    '',
    `export default defineLayout<typeof contract>({ name: ${JSON.stringify(name)}, component: Component });`,
    '',
  ].join('\n');
}

/**
 * Creates an empty temporary workspace. Its path is the one `mkdtemp` gives, not resolved through
 * symlinks, as a user's workspace root is.
 *
 * @returns The absolute workspace root.
 */
export function scratchRoot(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'deck-layouts-'));
}

/**
 * Writes files under a folder, creating the folders they need.
 *
 * @param root - The absolute folder.
 * @param files - Paths relative to it, with forward slashes, and their contents.
 */
export function writeFiles(root: string, files: Readonly<Record<string, string>>): void {
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, ...file.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}
