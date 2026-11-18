import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { conversationLayout } from '#layouts/conversation-layout.tsx';

/**
 * Engine state for inspecting the real Step wrappers without mounting a presenter.
 */
const view = vi.hoisted(() => ({ step: 0, surface: 'default' }));

vi.mock('@deckster/engine', async (original) => ({
  ...(await original<typeof import('@deckster/engine')>()),
  useStatic: () => true,
  useStepAt: (at: number) => (view.step < at ? 'hidden' : 'current'),
  useSlide: () => ({ state: 'current' }),
  useReadyHold: () => undefined,
}));

vi.mock('@deckster/brand/runtime', () => ({
  useBrand: () => ({ surface: { name: view.surface } }),
}));

vi.mock('#foundation/backdrop.tsx', () => ({ Backdrop: () => null }));

/**
 * Renders repeated speakers so first-turn roles and one-turn-per-click builds can be checked.
 */
function render(reveal = false): string {
  const Component = conversationLayout.component;
  return renderToStaticMarkup(
    <Component
      slideId="conversation-test"
      frontmatter={{
        layout: 'conversation',
        title: 'The city owns the next step',
        chrome: true,
        reveal,
        messages: [
          { name: 'Maya', role: 'Resident', side: 'left', text: 'Can we plant here?' },
          { name: 'Dana', role: 'Survey team', side: 'right', text: 'Send us a photo.' },
          { name: 'Maya', role: 'Resident', side: 'left', text: 'Who waters the tree?' },
          { name: 'Dana', role: 'Survey team', side: 'right', text: 'The city does.' },
        ],
      }}
      slots={{}}
    />,
  );
}

beforeEach(() => {
  view.step = 0;
  view.surface = 'default';
});

describe('the conversation transcript', () => {
  it('labels its ordered transcript with the title and shows each role only once', () => {
    const html = render();
    const titleId = html.match(/<ol class="kit-conversation" aria-labelledby="([^"]+)"/u)?.[1];
    expect(titleId).toBeDefined();
    expect(html).toContain(`id="${titleId}"`);
    expect(html.match(/kit-conversation-name kit-type-label/gu)).toHaveLength(4);
    expect(html.match(/>Resident<\/p>/gu)).toHaveLength(1);
    expect(html.match(/>Survey team<\/p>/gu)).toHaveLength(1);
    expect(html).not.toContain('data-step=');
  });

  for (const surface of ['default', 'inverse', 'accent', 'gradient']) {
    it(`lights only the right side on the ${surface} surface`, () => {
      view.surface = surface;
      const html = render();
      const lit = surface === 'accent' || surface === 'gradient' ? 'inverse' : 'accent';
      const rightSide = new RegExp(`data-side="right" data-surface="${lit}"`, 'gu');
      expect(html.match(rightSide)).toHaveLength(2);
      expect(html).not.toContain('data-side="left" data-surface=');
    });
  }

  it('reserves all four turns while revealing exactly one more message per click', () => {
    for (const step of [0, 1, 2, 3, 4]) {
      view.step = step;
      const html = render(true);
      expect(html.match(/kit-conversation-message"/gu)).toHaveLength(4);
      expect(html.match(/data-step-state="hidden"/gu) ?? []).toHaveLength(4 - step);
      expect(html).not.toContain('data-inline=');
    }
  });
});
