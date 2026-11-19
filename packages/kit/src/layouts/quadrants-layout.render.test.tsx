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

/**
 * Renders the catalog example, with its highlighted Start box, and optional label overrides.
 *
 * @param labels - The `labels` field as an author writes it, or none for the defaults.
 */
function render(labels?: Record<string, string>): string {
  const Component = quadrantsLayout.component;
  const { labels: _defaults, ...example } = quadrantsLayoutContract.example.frontmatter;
  return renderToStaticMarkup(
    <Component
      slideId="quadrants"
      frontmatter={{
        layout: 'quadrants',
        ...Schema.decodeUnknownSync(quadrantsLayoutContract.schema)({
          ...example,
          ...(labels === undefined ? {} : { labels }),
        }),
        title: 'Next season',
      }}
      slots={{}}
    />,
  );
}

describe('the highlighted quadrant', () => {
  it('names the highlighted heading for assistive readers without changing its visible title', () => {
    const html = render();
    expect(html).toMatch(/<h3[^>]*aria-label="Highlighted: Start">Start<\/h3>/u);
    expect(html.match(/aria-label="Highlighted:/gu)).toHaveLength(1);
  });

  it('reads the author’s highlight prefix in place of the English one', () => {
    const html = render({ highlight: 'Priorität' });
    expect(html).toMatch(/<h3[^>]*aria-label="Priorität: Start">Start<\/h3>/u);
    expect(html).not.toContain('Highlighted');
  });
});
