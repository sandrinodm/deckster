import { Schema } from 'effect';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vite-plus/test';

import { actionsLayoutContract } from '#layouts/actions-layout.contract.ts';
import { actionsLayout } from '#layouts/actions-layout.tsx';
import { risksLayoutContract } from '#layouts/risks-layout.contract.ts';
import { risksLayout } from '#layouts/risks-layout.tsx';
import { statusLayoutContract } from '#layouts/status-layout.contract.ts';
import { statusLayout } from '#layouts/status-layout.tsx';

vi.mock('@deckster/engine', async (original) => ({
  ...(await original<typeof import('@deckster/engine')>()),
  useStatic: () => true,
  useStepAt: () => 'hidden',
  useSlide: () => ({ state: 'current' }),
  useReadyHold: () => undefined,
}));
vi.mock('@deckster/brand/runtime', () => ({ useBrand: () => ({ surface: { name: 'default' } }) }));
vi.mock('#foundation/backdrop.tsx', () => ({ Backdrop: () => null }));

describe('accessible layout tables', () => {
  it('names each table with its rendered title and keeps risk headings inside row headers', () => {
    const Actions = actionsLayout.component;
    const Risks = risksLayout.component;
    const Status = statusLayout.component;
    const actions = renderToStaticMarkup(
      <Actions
        slideId="actions"
        frontmatter={{
          layout: 'actions',
          ...Schema.decodeUnknownSync(actionsLayoutContract.schema)(
            actionsLayoutContract.example.frontmatter,
          ),
          title: 'Actions to take',
        }}
        slots={{}}
      />,
    );
    const risks = renderToStaticMarkup(
      <Risks
        slideId="risks"
        frontmatter={{
          layout: 'risks',
          ...Schema.decodeUnknownSync(risksLayoutContract.schema)(
            risksLayoutContract.example.frontmatter,
          ),
          title: 'Risks to address',
        }}
        slots={{}}
      />,
    );
    const status = renderToStaticMarkup(
      <Status
        slideId="status"
        frontmatter={{
          layout: 'status',
          ...Schema.decodeUnknownSync(statusLayoutContract.schema)(
            statusLayoutContract.example.frontmatter,
          ),
          title: 'Launch readiness',
          reveal: true,
        }}
        slots={{ footnote: 'Review source' }}
      />,
    );
    for (const html of [actions, risks, status]) {
      const labelledBy = html.match(/role="table" aria-labelledby="([^"]+)"/u)?.[1];
      expect(labelledBy).toBeDefined();
      expect(html).toContain(`id="${labelledBy}"`);
      expect(html).not.toMatch(/<h3[^>]+role="rowheader"/u);
    }

    expect(risks).toMatch(/role="rowheader" aria-label="Priority risk:[^"]+"><h3/u);
    expect(actions).toMatch(/kit-action-owner[^>]*><span>[^<]+<\/span><span class="kit-badge/u);
    expect(status.match(/data-step-state="hidden"/gu)).toHaveLength(3);
    expect(status).toMatch(/<div class="kit-footnote[^>]*>Review source<\/div>/u);
  });
});
