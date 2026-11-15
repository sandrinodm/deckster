import { describe, expect, it } from 'vite-plus/test';

import { remarkKitPunctuation } from '#mdx/remark-punctuation.ts';

type Node = {
  type: string;
  name?: string;
  value?: string;
  attributes?: unknown[];
  children?: Node[];
};

/**
 * A text node.
 */
function text(value: string): Node {
  return { type: 'text', value };
}

/**
 * Runs the plugin on a root with the given children and returns them.
 */
function run(...children: Node[]): Node[] {
  const tree: Node = { type: 'root', children };
  remarkKitPunctuation()(tree);
  return tree.children ?? [];
}

describe('remarkKitPunctuation', () => {
  it('curls quotes in prose, pairing them across inline markup', () => {
    const [paragraph] = run({
      type: 'paragraph',
      children: [text('the "'), { type: 'strong', children: [text('worst')] }, text('" nights')],
    });
    const values = paragraph?.children?.map((child) => child.value ?? child.children?.[0]?.value);
    expect(values).toEqual(['the “', 'worst', '” nights']);
  });

  it('leaves inline code, fenced code and expressions alone', () => {
    const [paragraph, fence] = run(
      { type: 'paragraph', children: [{ type: 'inlineCode', value: "it's --env" }] },
      { type: 'code', value: 'echo "hi" --flag' },
    );
    expect(paragraph?.children?.[0]?.value).toBe("it's --env");
    expect(fence?.value).toBe('echo "hi" --flag');
  });

  it('leaves the children of literal components and of `literal` elements alone', () => {
    const [cmd, out, button, marked] = run(
      { type: 'mdxJsxFlowElement', name: 'Cmd', children: [text('pnpm deploy --env "prod"')] },
      { type: 'mdxJsxFlowElement', name: 'Out', children: [text("it's done...")] },
      { type: 'mdxJsxTextElement', name: 'Button', children: [text('"Open"')] },
      {
        type: 'mdxJsxFlowElement',
        name: 'Callout',
        attributes: [{ type: 'mdxJsxAttribute', name: 'literal', value: null }],
        children: [{ type: 'paragraph', children: [text('"as typed"')] }],
      },
    );
    expect(cmd?.children?.[0]?.value).toBe('pnpm deploy --env "prod"');
    expect(out?.children?.[0]?.value).toBe("it's done...");
    expect(button?.children?.[0]?.value).toBe('"Open"');
    expect(marked?.children?.[0]?.children?.[0]?.value).toBe('"as typed"');
  });

  it('never touches attribute values', () => {
    const attribute = { type: 'mdxJsxAttribute', name: 'alt', value: "Riverside's oaks" };
    const [image] = run({ type: 'mdxJsxFlowElement', name: 'img', attributes: [attribute] });
    expect(image?.attributes?.[0]).toEqual(attribute);
  });

  it('curls prose inside other components, such as a footnote', () => {
    const [footnote] = run({
      type: 'mdxJsxFlowElement',
      name: 'Footnote',
      children: [text("Riverside's")],
    });
    expect(footnote?.children?.[0]?.value).toBe('Riverside’s');
  });

  it('leaves double hyphens in prose as written', () => {
    const [paragraph] = run({ type: 'paragraph', children: [text('use --env -- not a dash')] });
    expect(paragraph?.children?.[0]?.value).toBe('use --env -- not a dash');
  });
});
