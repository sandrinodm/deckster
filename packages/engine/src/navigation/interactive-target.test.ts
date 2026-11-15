// @vitest-environment happy-dom
import { describe, expect, it } from 'vite-plus/test';

import { isInteractiveTarget } from '#navigation/interactive-target.ts';
import { isSpaceForTarget } from '#navigation/keyboard.ts';
import { pointerToAction, type PointerInput } from '#navigation/pointer.ts';

/**
 * Parses HTML into a fresh container and returns the element matching `selector`.
 */
function element(html: string, selector: string): Element {
  const container = document.createElement('div');
  container.innerHTML = html;
  const found = container.querySelector(selector);
  if (found === null) {
    throw new Error(`no ${selector} in ${html}`);
  }

  return found;
}

/**
 * A plain left click on a paragraph, with overrides.
 */
function click(overrides: Partial<PointerInput> = {}): PointerInput {
  return {
    button: 0,
    hasModifier: false,
    target: element('<p>Text</p>', 'p'),
    distance: 0,
    selection: '',
    ...overrides,
  };
}

describe('isInteractiveTarget', () => {
  it('matches interactive elements and anything inside them', () => {
    const cases = [
      ['<a href="/x"><span>go</span></a>', 'span'],
      ['<button><b>ok</b></button>', 'b'],
      ['<input>', 'input'],
      ['<select></select>', 'select'],
      ['<textarea></textarea>', 'textarea'],
      ['<details><summary>more</summary></details>', 'summary'],
      ['<video controls></video>', 'video'],
      ['<audio controls></audio>', 'audio'],
      ['<iframe></iframe>', 'iframe'],
      ['<div contenteditable="true"><p>x</p></div>', 'p'],
      ['<div role="button">x</div>', 'div'],
      ['<section data-deck-interactive><canvas></canvas></section>', 'canvas'],
    ] as const;
    for (const [html, selector] of cases) {
      expect(isInteractiveTarget(element(html, selector)), html).toBe(true);
    }
  });

  it('leaves slide content, links without href, opted-out areas and non-elements alone', () => {
    const cases = [
      ['<h1>Title</h1>', 'h1'],
      ['<a name="x">anchor</a>', 'a'],
      ['<div data-deck-interactive="false"><p>x</p></div>', 'p'],
      ['<div contenteditable="false"><p>x</p></div>', 'p'],
    ] as const;
    for (const [html, selector] of cases) {
      expect(isInteractiveTarget(element(html, selector)), html).toBe(false);
    }

    expect(isInteractiveTarget(window)).toBe(false);
    expect(isInteractiveTarget(null)).toBe(false);
  });
});

describe('isSpaceForTarget', () => {
  it('claims Space on interactive content only', () => {
    const button = element('<button>x</button>', 'button');
    expect(isSpaceForTarget({ key: ' ', target: button })).toBe(true);
    expect(isSpaceForTarget({ key: 'ArrowRight', target: button })).toBe(false);
    expect(isSpaceForTarget({ key: ' ', target: element('<p>x</p>', 'p') })).toBe(false);
  });
});

describe('pointerToAction', () => {
  it('moves forward on a left click and back on a right click', () => {
    expect(pointerToAction(click())).toEqual({ type: 'next' });
    expect(pointerToAction(click({ button: 2 }))).toEqual({ type: 'prev' });
    expect(pointerToAction(click({ button: 1 }))).toBeUndefined();
  });

  it('leaves clicks on interactive content, with modifiers, after drags and selections alone', () => {
    const button = element('<button>x</button>', 'button');
    for (const input of [
      click({ target: button }),
      click({ button: 2, target: button }),
      click({ hasModifier: true }),
      click({ button: 2, hasModifier: true }),
      click({ distance: 12 }),
      click({ selection: 'selected words' }),
    ]) {
      expect(pointerToAction(input)).toBeUndefined();
    }

    expect(pointerToAction(click({ distance: 3, selection: '  ' }))).toEqual({ type: 'next' });
  });
});
