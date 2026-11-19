import { Schema } from 'effect';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vite-plus/test';

import { scheduleLayoutContract } from '#layouts/schedule-layout.contract.ts';
import { scheduleLayout } from '#layouts/schedule-layout.tsx';

vi.mock('@deckster/engine', async (original) => ({
  ...(await original<typeof import('@deckster/engine')>()),
  useStatic: () => true,
  useSlide: () => ({ state: 'current' }),
  useReadyHold: () => undefined,
}));
vi.mock('@deckster/brand/runtime', () => ({
  useBrand: () => ({ surface: { name: 'default' } }),
}));
vi.mock('#foundation/backdrop.tsx', () => ({ Backdrop: () => null }));

/**
 * Renders the catalog example, with its now marker on Feb, and optional label overrides.
 *
 * @param labels - The `labels` field as an author writes it, or none for the defaults.
 */
function render(labels?: Record<string, string>): string {
  const Component = scheduleLayout.component;
  const { labels: _defaults, ...example } = scheduleLayoutContract.example.frontmatter;
  return renderToStaticMarkup(
    <Component
      slideId="schedule"
      frontmatter={{
        layout: 'schedule',
        ...Schema.decodeUnknownSync(scheduleLayoutContract.schema)({
          ...example,
          ...(labels === undefined ? {} : { labels }),
        }),
      }}
      slots={{}}
    />,
  );
}

describe('the schedule labels', () => {
  it('draws Now and reads the now period and bar spans in English by default', () => {
    const html = render();
    expect(html).toMatch(/<span class="kit-schedule-now kit-type-label"[^>]*>Now<\/span>/u);
    expect(html).toContain(
      'Feb<span class="kit-schedule-sr-only" data-decorative=""> (now)</span>',
    );
    expect(html).toContain('aria-label="Site visits: Jan through Feb"');
  });

  it('draws and reads the author’s words in place of the English ones', () => {
    const html = render({ now: 'Heute', nowPeriod: 'heute', through: 'bis' });
    expect(html).toMatch(/<span class="kit-schedule-now kit-type-label"[^>]*>Heute<\/span>/u);
    expect(html).toContain(
      'Feb<span class="kit-schedule-sr-only" data-decorative=""> (heute)</span>',
    );
    expect(html).toContain('aria-label="Site visits: Jan bis Feb"');
    expect(html).not.toMatch(/>Now<|\(now\)| through /u);
  });
});
