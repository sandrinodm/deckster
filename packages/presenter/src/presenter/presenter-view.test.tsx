// @vitest-environment happy-dom
import type { DeckManifest, SlideMeta } from '@deckster/engine';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import {
  click,
  find,
  press,
  renderPresenterDeck,
  slide,
  type MountedPresenterDeck,
} from '#testing/presenter-deck.fixture.tsx';
import { uiState, updateUi } from '#ui/ui-state.ts';

/**
 * The frontmatter of a hidden test slide.
 */
const hiddenMeta: Partial<SlideMeta> = { frontmatter: { layout: 'default', hidden: true } };

/**
 * The deck under test, unmounted after each test.
 */
let mounted: MountedPresenterDeck | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  window.localStorage.clear();
});

/**
 * The slide counter in the presenter window's header.
 */
function counter(): string {
  return find('[data-testid="slide-count"]').textContent ?? '';
}

describe('PresenterView', () => {
  it('reaches every step of a stepped slide forwards and backwards', () => {
    mounted = renderPresenterDeck('/?presenter#/2/0');
    const seen = [counter()];
    for (let count = 0; count < 4; count += 1) {
      press('ArrowRight');
      seen.push(counter());
    }

    expect(seen).toEqual([
      'Slide 2 of 3 · step 0 of 3',
      'Slide 2 of 3 · step 1 of 3',
      'Slide 2 of 3 · step 2 of 3',
      'Slide 2 of 3 · step 3 of 3',
      'Slide 3 of 3',
    ]);
    press('ArrowLeft');
    expect(counter()).toBe('Slide 2 of 3 · step 3 of 3');
    expect(window.__deck?.slides[1]?.stepCount).toBe(4);
  });

  it('labels the next pane with the next step, then the next slide', () => {
    mounted = renderPresenterDeck('/?presenter#/2/2');
    expect(find('.dp-p-col:nth-child(2) .dp-p-label').textContent).toContain('Next step');
    press('ArrowRight');
    expect(find('.dp-p-col:nth-child(2) .dp-p-label').textContent).toContain('Next slide');
  });

  it('keeps Space, arrows and PageDown navigating after a button was clicked', () => {
    mounted = renderPresenterDeck('/?presenter#/2/0');
    const toggle = find('[data-testid="timer-toggle"]');
    toggle.focus();
    const space = press(' ', toggle);
    expect(space.defaultPrevented).toBe(true);
    expect(toggle.textContent).toBe('Start');
    expect(window.__deck?.position).toEqual({ slide: 1, step: 1 });
    press('PageDown', toggle);
    press('ArrowLeft', toggle);
    expect(window.__deck?.position).toEqual({ slide: 1, step: 1 });

    const larger = find('button[aria-label="Larger notes"]');
    click(larger);
    press(' ', larger);
    expect(window.__deck?.position).toEqual({ slide: 1, step: 2 });
  });

  it('leaves keys typed into a text field and keys under a modal panel alone', () => {
    mounted = renderPresenterDeck('/?presenter#/2/0');
    const field = document.createElement('input');
    find('.dp-presenter').append(field);
    field.focus();
    press(' ', field);
    expect(window.__deck?.position).toEqual({ slide: 1, step: 0 });

    updateUi({ helpOpen: true });
    press('ArrowRight', find('[data-testid="timer-toggle"]'));
    expect(window.__deck?.position).toEqual({ slide: 1, step: 0 });
  });

  it('uncovers a blacked-out audience screen instead of moving on', () => {
    mounted = renderPresenterDeck('/?presenter#/2/0');
    updateUi({ blackout: 'black' });
    press(' ', find('[data-testid="timer-toggle"]'));
    expect(uiState.get().blackout).toBeUndefined();
    expect(window.__deck?.position).toEqual({ slide: 1, step: 0 });
  });

  it('stays neutral before the timer starts and counts down the budget scaled to the talk', () => {
    mounted = renderPresenterDeck('/?presenter#/2/0');
    expect(find('[data-testid="pacing"]').textContent).toBe('Not started');
    expect(find('[data-testid="pacing"]').dataset['status']).toBe('idle');
    const stats = find('[data-testid="pacing-stats"]').textContent ?? '';
    expect(stats).toContain('This slide1:20');
    expect(stats).toContain('Talk left4:00');
  });

  it('renders the notes Markdown as text formatting, never as HTML', () => {
    mounted = renderPresenterDeck('/?presenter#/2/0');
    const notes = find('[data-testid="notes"]');
    expect(notes.querySelector('strong')?.textContent).toBe('this');
    expect([...notes.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      'one',
      'two',
    ]);
    expect(notes.querySelector('li code')?.textContent).toBe('two');
    expect(notes.querySelector('b')).toBeNull();
    expect(notes.textContent).toContain('<b>raw</b>');
    expect(notes.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
  });
});

/**
 * Five slides where the second and third are hidden.
 */
const HIDDEN_DECK: DeckManifest = {
  id: 'presenter-hidden',
  title: 'Presenter hidden',
  brand: 'default',
  slides: [
    slide('one', () => <h1>One</h1>),
    slide('two', () => <h1>Two</h1>, hiddenMeta),
    slide('three', () => <h1>Three</h1>, hiddenMeta),
    slide('four', () => <h1>Four</h1>),
    slide('five', () => <h1>Five</h1>),
  ],
};

/**
 * The label of the next pane: its kind and the title of the slide it shows.
 */
function nextLabelText(): string {
  return find('.dp-p-col:nth-child(2) .dp-p-label').textContent ?? '';
}

describe('PresenterView with hidden slides', () => {
  it('previews the next shown slide, skipping two hidden ones in a row', () => {
    mounted = renderPresenterDeck('/?presenter#/1/0', HIDDEN_DECK);
    expect(nextLabelText()).toBe('Next slidefour');
    press('ArrowRight');
    expect(counter()).toBe('Slide 4 of 5');
  });

  it('shows no next slide when the rest are hidden', () => {
    mounted = renderPresenterDeck('/?presenter#/5/0', {
      ...HIDDEN_DECK,
      slides: [...HIDDEN_DECK.slides.slice(0, 4), slide('five', () => <h1>Five</h1>, hiddenMeta)],
    });
    expect(find('[data-testid="next-slide"]').textContent).toBe('End of the deck');
  });

  it('keeps full-list numbers in the header and says so on a hidden slide', () => {
    mounted = renderPresenterDeck('/?presenter#/3/0', HIDDEN_DECK);
    expect(counter()).toBe('Slide 3 of 5 · hidden');
    expect(nextLabelText()).toBe('Next slidefour');
  });

  it('plans the talk without the hidden budgets', () => {
    mounted = renderPresenterDeck('/?presenter#/1/0', {
      ...HIDDEN_DECK,
      slides: [
        slide('one', () => <h1>One</h1>, {}, '1m'),
        slide('two', () => <h1>Two</h1>, hiddenMeta, '5m'),
        slide('three', () => <h1>Three</h1>, {}, '1m'),
      ],
    });
    expect(find('[data-testid="pacing-stats"]').textContent).toContain('Budgets left2:00');
  });
});
