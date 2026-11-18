import { Schema } from 'effect';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vite-plus/test';

import { quadrantsLayoutContract } from '#layouts/quadrants-layout.contract.ts';
import { quadrantsLayout } from '#layouts/quadrants-layout.tsx';

vi.mock('@deckster/engine', async (original) => ({
  ...(await original<typeof import('@deckster/engine')>()),
  useStatic: () => true,
  useSlide: () => ({ state: 'current' }),
  useReadyHold: () => undefined,
}));
vi.mock('@deckster/brand/runtime', () => ({
  useBrand: () => ({ surface: { name: 'default' }, brand: { icons: { set: 'lucide' } } }),
}));
vi.mock('#foundation/backdrop.tsx', () => ({ Backdrop: () => null }));

describe('the highlighted quadrant', () => {
  it('names the highlighted heading for assistive readers without changing its visible title', () => {
    const Component = quadrantsLayout.component;
    const html = renderToStaticMarkup(
      <Component
        slideId="quadrants"
        frontmatter={{
          layout: 'quadrants',
          ...Schema.decodeUnknownSync(quadrantsLayoutContract.schema)(
            quadrantsLayoutContract.example.frontmatter,
          ),
          title: 'Next season',
        }}
        slots={{}}
      />,
    );
    expect(html).toMatch(/<h3[^>]*aria-label="Highlighted: Start">Start<\/h3>/u);
    expect(html.match(/aria-label="Highlighted:/gu)).toHaveLength(1);
  });
});
