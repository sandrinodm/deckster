import { describe, expect, it } from 'vite-plus/test';

import { chromeShapes, commonChrome, sameChrome } from '#pptx/chrome.ts';
import { logoNode, pageNode, slideInput, titleNode } from '#pptx/deck.fixture.ts';

describe('page chrome', () => {
  it('finds the logo and tells the page number from footer text by the slide number', () => {
    const slide = slideInput(1, [titleNode(1, 'Title'), logoNode(2), pageNode(3, '2 / 16')]);
    const shapes = chromeShapes(slide, slide.plan.items);
    expect(shapes.map((shape) => shape.kind)).toEqual(['logo', 'page']);
  });

  it('compares chrome across slides whatever their page numbers say', () => {
    const second = slideInput(1, [logoNode(2), pageNode(3, '2 / 16')]);
    const third = slideInput(2, [logoNode(2), pageNode(3, '3 / 16')]);
    const bare = slideInput(3, [titleNode(1, 'Bare')]);
    const sets = [second, third, bare].map((slide) => chromeShapes(slide, slide.plan.items));
    expect(sameChrome(sets[0] ?? [], sets[1] ?? [])).toBe(true);
    expect(sameChrome(sets[0] ?? [], sets[2] ?? [])).toBe(false);
    expect(commonChrome(sets).map((shape) => shape.slide.slideIndex)).toEqual([1, 1]);
  });
});
