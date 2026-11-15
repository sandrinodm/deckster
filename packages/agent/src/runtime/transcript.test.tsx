// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { click, render, type Rendered } from '#runtime/render.fixture.tsx';
import { Transcript } from '#runtime/transcript.tsx';

/**
 * The rendered transcript, removed after each test.
 */
let mounted: Rendered | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

describe('transcript suggestions', () => {
  it('keeps suggestions as native focusable buttons inside a named list', () => {
    const suggestion = {
      source: 'example',
      label: 'Shorten the title',
      prompt: 'Shorten it.',
    } as const;
    const selected = vi.fn();
    mounted = render(
      <Transcript
        turns={[]}
        deck="hello"
        provider="Claude"
        announcement=""
        footer={() => null}
        suggestions={[suggestion]}
        onSuggestion={selected}
        onRetry={() => undefined}
      />,
    );
    const list = mounted.container.querySelector('ul[aria-label="Suggestions"]');
    const button = list?.querySelector('li > button');
    expect(list?.children).toHaveLength(1);
    expect(button).toBeInstanceOf(HTMLButtonElement);
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('The suggestion has no native button.');
    }

    expect(button.getAttribute('role')).toBeNull();
    expect(button.type).toBe('button');
    expect(button.tabIndex).toBe(0);
    button.focus();
    expect(document.activeElement).toBe(button);
    click(button);
    expect(selected).toHaveBeenCalledExactlyOnceWith(suggestion);
  });
});
