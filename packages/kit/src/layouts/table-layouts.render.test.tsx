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

/**
 * Renders the `risks` layout with the example register and the given labels, or with the field left
 * out so the English defaults apply.
 *
 * @param labels - The `labels` field to write, or nothing to omit it.
 */
function renderRisks(labels?: Record<string, string>): string {
  const Risks = risksLayout.component;
  const { labels: _example, ...register } = risksLayoutContract.example.frontmatter;
  return renderToStaticMarkup(
    <Risks
      slideId="risks"
      frontmatter={{
        layout: 'risks',
        ...Schema.decodeUnknownSync(risksLayoutContract.schema)({
          ...register,
          ...(labels === undefined ? {} : { labels }),
        }),
        title: 'Risks to address',
      }}
      slots={{}}
    />,
  );
}

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

  it('prints the risk labels it is given in the heads, level words and highlighted row', () => {
    const html = renderRisks({
      name: 'Hazard',
      likelihood: 'Chance',
      impact: 'Effect',
      mitigation: 'Response',
      low: 'Minor',
      medium: 'Moderate',
      high: 'Severe',
      highlight: 'Top hazard',
    });
    for (const head of ['Hazard', 'Chance', 'Effect', 'Response']) {
      expect(html).toContain(`<span role="columnheader">${head}</span>`);
    }

    for (const word of ['Minor', 'Moderate', 'Severe']) {
      expect(html).toContain(`<span>${word}</span>`);
    }

    expect(html).toMatch(/aria-label="Top hazard: Summer drought"/u);
    expect(html).not.toMatch(/Priority risk|>Likelihood<|>Low<|>Medium<|>High</u);
  });

  it('prints the English risk labels when none are given', () => {
    const html = renderRisks();
    for (const head of ['Risk', 'Likelihood', 'Impact', 'Mitigation']) {
      expect(html).toContain(`<span role="columnheader">${head}</span>`);
    }

    for (const word of ['Low', 'Medium', 'High']) {
      expect(html).toContain(`<span>${word}</span>`);
    }

    expect(html).toMatch(/aria-label="Priority risk: Summer drought"/u);
  });
});
