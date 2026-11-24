import type { LimitCase } from '@deckster/kit/limit-cases';

/**
 * The slides `deckster layouts check` fills to the layout's limits. Each case is rendered with the
 * title and the eyebrow at their longest and body at its word budget, as a paragraph and as a list.
 * Add a case for each variant: its `frontmatter`, and in `filled` the named slots it fills besides
 * body. The file runs in Node like `contract.ts`, so import types only, or the modules a contract
 * may import.
 */
export default [{ name: 'full-body', frontmatter: {}, filled: [] }] satisfies readonly LimitCase[];
