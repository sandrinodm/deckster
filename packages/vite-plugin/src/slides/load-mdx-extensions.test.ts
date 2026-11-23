import { Effect } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

import { DeckBuildError } from '#errors.ts';
import { TEST_CATALOG } from '#layouts/test-catalog.fixture.ts';
import { DEFAULT_MDX_EXTENSIONS, loadMdxExtensions } from '#slides/load-mdx-extensions.ts';
import { transformMdxSlide } from '#slides/transform-slide.ts';

/**
 * The deck and brand the extensions are created for.
 */
const CONTEXT = {
  workspaceRoot: '/workspace',
  deckDir: '/workspace/decks/demo',
  brand: { name: 'demo', icons: { set: 'lucide', strokeWidth: 1.75 }, treatments: ['plain'] },
};

describe('loadMdxExtensions', () => {
  it('loads the kit extension by default and returns its plugins', async () => {
    const plugins = await Effect.runPromise(loadMdxExtensions(DEFAULT_MDX_EXTENSIONS, CONTEXT));
    expect(plugins.remarkPlugins.length).toBeGreaterThanOrEqual(3);
    expect(plugins.rehypePlugins).toEqual([]);
  });

  it('merges extensions in order', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-extension-'));
    const file = path.join(folder, 'extra.mjs');
    fs.writeFileSync(
      file,
      "export default { name: 'extra', plugins: () => ({ remarkPlugins: ['one'], rehypePlugins: ['two'] }) };\n",
    );
    const plugins = await Effect.runPromise(loadMdxExtensions([file, file], CONTEXT));
    expect(plugins).toEqual({ remarkPlugins: ['one', 'one'], rehypePlugins: ['two', 'two'] });
  });

  it('fails naming the module when the default export is not an extension', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-extension-'));
    const file = path.join(folder, 'bad.mjs');
    fs.writeFileSync(file, 'export default 42;\n');
    const error = await Effect.runPromise(Effect.flip(loadMdxExtensions([file], CONTEXT)));
    expect(error).toBeInstanceOf(DeckBuildError);
    expect(error.message).toContain('not an MDX extension');
    expect(error.message).toContain('defineMdxExtension');
  });
});

describe('a slide compiled with the kit extension', () => {
  /**
   * Compiles a default-layout slide with the kit's plugins and collects the warnings.
   *
   * @param body - The MDX after the frontmatter.
   */
  async function compile(
    body: string,
  ): Promise<{ code: string; warnings: string[]; rules: (string | null)[] }> {
    const mdx = await Effect.runPromise(loadMdxExtensions(DEFAULT_MDX_EXTENSIONS, CONTEXT));
    const warnings: string[] = [];
    const rules: (string | null)[] = [];
    const displayPath = 'decks/demo/slides/code.mdx';
    const code = await Effect.runPromise(
      transformMdxSlide(
        {
          id: 'code',
          displayPath,
          file: `/workspace/${displayPath}`,
          code: `---\ntitle: Code\n---\n${body}`,
          layouts: TEST_CATALOG,
          mdx,
          onWarning: (message, warning) => {
            warnings.push(message);
            rules.push(warning.ruleId);
          },
        },
        false,
      ),
    );
    return { code, warnings, rules };
  }

  it('highlights a fenced block at build time', async () => {
    const { code } = await compile('```ts title="a.ts" {1}\nconst a = 1;\n```\n');
    expect(code).toContain('_jsx(Code');
    expect(code).toContain('lines');
    expect(code).toContain('file: "a.ts"');
  });

  it('turns a missing image into a media-missing warning that names the slide line', async () => {
    const { warnings, rules } = await compile('<Image src="./missing.png" alt="x" />\n');
    expect(warnings[0]).toContain('does not exist');
    expect(warnings[0]).toContain('line 4');
    expect(rules).toEqual(['media-missing']);
  });

  it('keeps a command with a URL and emphasis markers whole in a terminal', async () => {
    const { code } = await compile(
      [
        '<Terminal>',
        '  <Cmd>curl -s https://api.example.com/v1/items?limit=100 | jq *x*</Cmd>',
        '  <Out tone="muted">',
        '    [1, 2]',
        '    [3]',
        '  </Out>',
        '</Terminal>',
        '',
      ].join('\n'),
    );
    expect(code).toContain('text: "curl -s https://api.example.com/v1/items?limit=100 | jq *x*"');
    expect(code).toContain('text: "[1, 2]\\n[3]"');
  });

  it('warns about a terminal tone it does not have, and a highlight step past the last line', async () => {
    const { rules, warnings } = await compile(
      '<Terminal><Out tone="loud">x</Out></Terminal>\n\n```ts {1|99}\nconst a = 1;\n```\n',
    );
    expect(rules).toEqual(['terminal-tone', 'code-step-range']);
    expect(warnings[1]).toContain('names line 99, but the block has 1 line');
  });

  it('fails the build for an AppFrame app the deck does not have, naming how to create it', async () => {
    await expect(compile('<AppFrame app="nope" poster="./p.png" />\n')).rejects.toThrow(
      /no decks\/demo\/apps\/nope\/index\.html.*pnpm deckster new app demo nope/,
    );
  });

  it('fails the build, naming the line, for a highlight that does not parse', async () => {
    await expect(compile('```ts {5-2}\nx\n```\n')).rejects.toThrow(
      /Line \d+.*not a line or a range/,
    );
  });
});
