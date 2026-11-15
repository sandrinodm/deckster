import { describe, expect, it } from 'vite-plus/test';

import type { HighlightedCode } from '#code/highlighted-code.ts';
import type { CompactKeyedState } from '#code/keyed-states.ts';
import type { MdastNode } from '#mdx/mdast.ts';

import { kindAt } from '#code/token-kind.ts';
import { attributeValue, jsxElement } from '#mdx/mdast.ts';
import { remarkKitCode, type CodeFile } from '#mdx/remark-code.ts';

/**
 * A vfile that records warnings and fails by throwing.
 *
 * @param warnings - Where warnings are collected.
 */
function fakeFile(warnings: string[]): CodeFile {
  return {
    message: (reason) => {
      warnings.push(reason);
      return {};
    },
    fail: (reason) => {
      throw new Error(reason);
    },
  };
}

/**
 * A tree with one fenced block.
 *
 * @param value - The code.
 * @param lang - The language.
 * @param meta - The fence's meta string.
 */
function fenceTree(value: string, lang: string | null, meta: string | null): MdastNode {
  return { type: 'root', children: [{ type: 'code', value, lang, meta }] };
}

describe('remarkKitCode', () => {
  it('turns a fence into a highlighted Code element with its options', async () => {
    const tree = fenceTree('const a = 1;\nconst b = 2;', 'ts', 'title="a.ts" {2} lineNumbers');
    await remarkKitCode()(tree, fakeFile([]));
    const node = tree.children?.[0];
    expect(node?.type).toBe('mdxJsxFlowElement');
    expect(node?.name).toBe('Code');
    if (node === undefined) {
      throw new Error('the fence is gone');
    }

    expect(attributeValue(node, 'file')).toBe('a.ts');
    expect(attributeValue(node, 'highlight')).toBe('2');
    expect(attributeValue(node, 'lineNumbers')).toBe(true);
    const data = JSON.parse(String(attributeValue(node, 'data'))) as HighlightedCode;
    expect(data.lines).toHaveLength(2);
    expect(kindAt(data.lines[0]?.tokens[0]?.[1] ?? 0)).toBe('keyword');
  });

  it('carries diff notation and marked words into the data', async () => {
    const tree = fenceTree('-old()\n+fresh()', 'ts', 'diff /fresh/');
    await remarkKitCode()(tree, fakeFile([]));
    const node = tree.children?.[0];
    const data = JSON.parse(
      String(node === undefined ? '' : attributeValue(node, 'data')),
    ) as HighlightedCode;
    expect(data.lines.map((line) => line.change)).toEqual(['remove', 'add']);
    expect(data.lines[1]?.tokens.some((token) => token[2] === 1)).toBe(true);
  });

  it('falls back to plain text with a warning for an unknown language', async () => {
    const warnings: string[] = [];
    await remarkKitCode()(fenceTree('x', 'klingon', null), fakeFile(warnings));
    expect(warnings[0]).toContain('Unknown code language "klingon"');
  });

  it('fails the build with the fix for a bad highlight', async () => {
    await expect(remarkKitCode()(fenceTree('x', 'ts', '{4-2}'), fakeFile([]))).rejects.toThrow(
      /not a line or a range/,
    );
  });

  it('highlights a Code element with a literal code attribute and leaves a dynamic one alone', async () => {
    const literal = jsxElement('Code', [
      { type: 'mdxJsxAttribute', name: 'lang', value: 'bash' },
      { type: 'mdxJsxAttribute', name: 'code', value: 'echo hi' },
    ]);
    const dynamic = jsxElement('Code', [
      { type: 'mdxJsxAttribute', name: 'lang', value: 'bash' },
      {
        type: 'mdxJsxAttribute',
        name: 'code',
        value: { type: 'mdxJsxAttributeValueExpression', value: 'source' },
      },
    ]);
    await remarkKitCode()({ type: 'root', children: [literal, dynamic] }, fakeFile([]));
    expect(attributeValue(literal, 'data')).toBeTypeOf('string');
    expect(attributeValue(literal, 'code')).toBeUndefined();
    expect(attributeValue(dynamic, 'data')).toBeUndefined();
  });

  it('keys every state of a CodeMove from its fences', async () => {
    const move = jsxElement(
      'CodeMove',
      [],
      [
        { type: 'code', value: 'const a = 1;', lang: 'ts', meta: null },
        { type: 'code', value: 'const a: number = 1;', lang: 'ts', meta: null },
      ],
    );
    await remarkKitCode()({ type: 'root', children: [move] }, fakeFile([]));
    const states = JSON.parse(String(attributeValue(move, 'data'))) as CompactKeyedState[];
    expect(states).toHaveLength(2);
    expect(states[1]?.code).toBe('const a: number = 1;');
    expect(move.children).toEqual([]);
  });

  it('fails a CodeMove with fewer than two states', async () => {
    const move = jsxElement('CodeMove', [], [{ type: 'code', value: 'x', lang: 'ts', meta: null }]);
    await expect(remarkKitCode()({ type: 'root', children: [move] }, fakeFile([]))).rejects.toThrow(
      /at least two code states/,
    );
  });

  it('keeps the text of terminal commands and output exactly as written, in an attribute', async () => {
    const command = jsxElement('Cmd', [], [{ type: 'text', value: 'pnpm deploy --env "prod"' }]);
    const output = jsxElement('Out', [], [{ type: 'text', value: "it's done..." }]);
    await remarkKitCode()({ type: 'root', children: [command, output] }, fakeFile([]));
    expect(attributeValue(command, 'text')).toBe('pnpm deploy --env "prod"');
    expect(attributeValue(output, 'text')).toBe("it's done...");
    expect(command.children).toEqual([]);
  });
});
