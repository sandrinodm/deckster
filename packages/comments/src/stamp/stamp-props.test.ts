import { createContext, forwardRef, Fragment, memo, Suspense } from 'react';
import { describe, expect, it } from 'vite-plus/test';

import { isStampable, stampProps } from '#stamp/stamp-props.ts';

const SOURCE = { fileName: 'slides/intro.mdx', lineNumber: 14, columnNumber: 3 };

function Component(): null {
  return null;
}

describe('stampProps', () => {
  it('adds the stamp to host elements and components', () => {
    expect(stampProps('h2', { children: 'Hi' }, SOURCE)).toEqual({
      children: 'Hi',
      'data-deck-source': 'slides/intro.mdx:14:3',
    });
    expect(stampProps(Component, {}, SOURCE)).toEqual({
      'data-deck-source': 'slides/intro.mdx:14:3',
    });
  });

  it('keeps a stamp the props already carry, so a component root keeps its call site', () => {
    const props = { 'data-deck-source': 'slides/intro.mdx:3:1' };
    expect(stampProps('div', props, SOURCE)).toBe(props);
  });

  it('leaves elements without a line, and React built-ins that take no props, alone', () => {
    const props = { children: 'x' };
    expect(stampProps('p', props, undefined)).toBe(props);
    expect(stampProps('p', props, { fileName: 'slides/a.mdx' })).toBe(props);
    expect(stampProps(Fragment, props, SOURCE)).toBe(props);
    expect(stampProps(Suspense, props, SOURCE)).toBe(props);
    expect(stampProps(createContext(0), props, SOURCE)).toBe(props);
  });

  it('defaults a missing column to 1', () => {
    expect(stampProps('p', {}, { fileName: 'slides/a.tsx', lineNumber: 2 })).toEqual({
      'data-deck-source': 'slides/a.tsx:2:1',
    });
  });
});

describe('isStampable', () => {
  it('accepts host elements, components and their wrappers', () => {
    expect(isStampable('div')).toBe(true);
    expect(isStampable(Component)).toBe(true);
    expect(isStampable(memo(Component))).toBe(true);
    expect(isStampable(forwardRef(Component))).toBe(true);
  });

  it('rejects fragments, contexts and non-types', () => {
    expect(isStampable(Fragment)).toBe(false);
    expect(isStampable(createContext(0))).toBe(false);
    expect(isStampable(null)).toBe(false);
  });
});
