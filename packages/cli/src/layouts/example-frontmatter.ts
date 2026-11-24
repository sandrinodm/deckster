import type { AnyLayoutContract } from '@deckster/engine/layout';

/**
 * The frontmatter of the slide that shows a layout's contract `example`: `layout` first, then the
 * example's fields. The layout is always the contract's own, even when the example copied a
 * `layout:` line from another slide, so the slide cannot render with a different layout.
 *
 * @param contract - The layout's contract.
 * @returns The fields, with `layout` set to the contract's name.
 */
export function exampleFrontmatter(contract: AnyLayoutContract): Record<string, unknown> {
  const fields = Object.entries(contract.example.frontmatter).filter(([key]) => key !== 'layout');
  return { layout: contract.name, ...Object.fromEntries(fields) };
}
