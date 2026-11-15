import type { ReactNode } from 'react';

import { Notes, type SlideFrontmatterInput } from '@deckster/engine';
import { Code } from '@deckster/kit';

/**
 * Read by the build without running the slide, so it must stay a literal.
 */
export const frontmatter = {
  layout: 'code',
  title: 'The same block works from TSX',
  budget: '45s',
} satisfies SlideFrontmatterInput;

/**
 * The block's source, kept in a constant so the browser highlights it: TSX slides have no build
 * step for code, so the highlighter loads in its own chunk and the slide waits for it.
 */
const SOURCE = `const steps = ['plan', 'build', 'ship'];

for (const step of steps) {
  console.log(\`running \${step}\`);
}`;

/**
 * The code layout's body: a block highlighted in the browser, with the focus moving by step.
 */
export default function InTsx(): ReactNode {
  return (
    <>
      <Code
        code={SOURCE}
        lang="ts"
        file="steps.ts"
        highlight={{ 1: '3-5' }}
        words={['step']}
        lineNumbers
      />
      <Notes>
        This block is highlighted in the browser. MDX slides do it at build time, which is why this
        slide is the only one that loads a highlighter. One press moves the focus into the loop.
      </Notes>
    </>
  );
}

/**
 * The notes beside the code.
 */
export function Aside(): ReactNode {
  return (
    <ul>
      <li>MDX highlights at build time</li>
      <li>TSX highlights in the browser, once</li>
    </ul>
  );
}
