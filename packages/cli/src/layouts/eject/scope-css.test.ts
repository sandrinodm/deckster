import { describe, expect, it } from '@effect/vitest';

import {
  kitClassTokens,
  ownAttributeName,
  renameAttributes,
  renameClasses,
  scopeStylesheet,
  selectorAttributes,
  selectorClasses,
  unownedSelectors,
} from '#layouts/eject/scope-css.ts';

describe('renameClasses', () => {
  it('renames whole class names only, in selectors, class strings and comments', () => {
    const classes = new Set(['kit-mark', 'kit-portrait']);
    const text = [
      '/* The mark (`.kit-mark`). */',
      '.kit-mark { --kit-mark-aspect: 1; }',
      '.kit-mark-mono, .kit-marker, .kit-portrait-photo { color: red; }',
      'const id = `kit-mark-mono-${n}`;',
      '<span className={`kit-mark ${extra}`} /><i className="kit-portrait kit-type-label" />',
    ].join('\n');
    expect(renameClasses(text, classes, 'brand')).toBe(
      [
        '/* The mark (`.own-mark`). */',
        '.own-mark { --kit-mark-aspect: 1; }',
        '.kit-mark-mono, .kit-marker, .kit-portrait-photo { color: red; }',
        'const id = `kit-mark-mono-${n}`;',
        '<span className={`own-mark ${extra}`} /><i className="own-portrait kit-type-label" />',
      ].join('\n'),
    );
  });

  it("gives a brand's copy and a deck's copy different prefixes", () => {
    const classes = new Set(['kit-portrait']);
    const text = '.kit-portrait { color: red; }';
    expect(renameClasses(text, classes, 'brand')).toBe('.own-portrait { color: red; }');
    expect(renameClasses(text, classes, 'deck')).toBe('.dck-portrait { color: red; }');
  });

  it('lists the classes a stylesheet selects and the class words of any text', () => {
    const css = '/* .kit-note */\n.kit-a .kit-b-c > p { width: var(--kit-w); }\n.kit-a { top: 0; }';
    expect(selectorClasses(css)).toEqual(['kit-a', 'kit-b-c']);
    expect(kitClassTokens('className="kit-a kit-b" style="--kit-c: 1"')).toEqual([
      'kit-a',
      'kit-b',
    ]);
  });
});

describe('scopeStylesheet', () => {
  it('scopes every rule to the layout without adding specificity', () => {
    const css = [
      '@layer theme, base, components, utilities;',
      '',
      '@layer components {',
      "  .kit-frame[data-display-align][data-align='center'] .kit-eyebrow {",
      '    justify-content: center;',
      '  }',
      '',
      '  .kit-image-scrim,',
      '  .kit-image-band {',
      '    position: absolute;',
      '',
      '    & > p {',
      '      margin: 0;',
      '    }',
      '  }',
      '',
      '  @media (prefers-reduced-motion: reduce) {',
      '    .kit-image-scrim {',
      '      transition: none;',
      '    }',
      '  }',
      '',
      '  @keyframes kit-fade {',
      '    from {',
      '      opacity: 0;',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n');
    expect(scopeStylesheet(css, 'title')).toEqual({
      problems: [],
      css: [
        '@layer theme, base, components, utilities;',
        '',
        '@layer components {',
        "  .kit-frame:where([data-layout='title'])[data-display-align][data-align='center'] .kit-eyebrow {",
        '    justify-content: center;',
        '  }',
        '',
        "  :where(.kit-frame[data-layout='title']) .kit-image-scrim,",
        "  :where(.kit-frame[data-layout='title']) .kit-image-band {",
        '    position: absolute;',
        '',
        '    & > p {',
        '      margin: 0;',
        '    }',
        '  }',
        '',
        '  @media (prefers-reduced-motion: reduce) {',
        "    :where(.kit-frame[data-layout='title']) .kit-image-scrim {",
        '      transition: none;',
        '    }',
        '  }',
        '',
        '  @keyframes kit-fade {',
        '    from {',
        '      opacity: 0;',
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
    });
  });

  it('drops rules keyed on another layout with their comment and keeps its own', () => {
    const css = [
      '@layer components {',
      '  /* The photo covers the slide. */',
      "  .kit-frame[data-layout='image'] {",
      '    padding: 0;',
      '  }',
      '',
      "  .kit-frame[data-layout='image'] .kit-image-text,",
      '  .kit-image-caption {',
      '    color: white;',
      '  }',
      '',
      "  .kit-frame[data-layout='title'] .kit-cover {",
      '    top: 0;',
      '  }',
      '}',
      '',
    ].join('\n');
    expect(scopeStylesheet(css, 'title')).toEqual({
      problems: [],
      css: [
        '@layer components {',
        "  :where(.kit-frame[data-layout='title']) .kit-image-caption {",
        '    color: white;',
        '  }',
        '',
        "  .kit-frame[data-layout='title'] .kit-cover {",
        '    top: 0;',
        '  }',
        '}',
        '',
      ].join('\n'),
    });
  });

  it('wraps a selector that grows past the line width as the formatter does', () => {
    const css = [
      '@layer components {',
      '  .kit-image-frame > .deck-slot > :is(img, video, svg, figure, picture, canvas) {',
      '    width: 100%;',
      '  }',
      '}',
      '',
    ].join('\n');
    expect(scopeStylesheet(css, 'title')).toEqual({
      problems: [],
      css: [
        '@layer components {',
        "  :where(.kit-frame[data-layout='title'])",
        '    .kit-image-frame',
        '    > .deck-slot',
        '    > :is(img, video, svg, figure, picture, canvas) {',
        '    width: 100%;',
        '  }',
        '}',
        '',
      ].join('\n'),
    });
  });

  it('keeps a selector that names this layout among others, narrowed to this layout', () => {
    const css = [
      ".kit-frame:is([data-layout='image'], [data-layout='title']) .kit-caption {",
      '  color: white;',
      '}',
      ":is([data-layout='image'], [data-layout='quote']) .kit-caption {",
      '  color: red;',
      '}',
      '',
    ].join('\n');
    expect(scopeStylesheet(css, 'title')).toEqual({
      problems: [],
      css: [
        ".kit-frame:is([data-layout='image'], [data-layout='title']):where([data-layout='title'])",
        '  .kit-caption {',
        '  color: white;',
        '}',
        '',
      ].join('\n'),
    });
  });

  it('reports a root selector and an at-rule it cannot scope, and copies them as they are', () => {
    const css = [
      ':root {',
      '  --x: 1;',
      '}',
      '@scope (.kit-card) {',
      '  p {',
      '    margin: 0;',
      '  }',
      '}',
      '@font-face {',
      '  font-family: X;',
      '}',
      '',
    ].join('\n');
    const scoped = scopeStylesheet(css, 'title');
    expect(scoped.css).toBe(css);
    expect(scoped.problems).toEqual([
      "The selector :root starts at the document's root, so it is copied unscoped and may style " +
        'other layouts than title.',
      'Its @scope block is copied unscoped, so its rules may style other layouts than title.',
    ]);
  });

  it('reports a data-layout inside :not() and does not guess whether to keep it', () => {
    const css = [
      ".kit-frame:not([data-layout='image']) .kit-caption {",
      '  color: red;',
      '}',
      '',
      ".kit-frame:not(:is([data-layout='title'], .x)) .kit-caption {",
      '  color: blue;',
      '}',
      '',
      ".kit-frame[data-layout='title']:not(.kit-wide) .kit-caption {",
      '  color: green;',
      '}',
      '',
    ].join('\n');
    const scoped = scopeStylesheet(css, 'title');
    expect(scoped.css).toBe(css);
    expect(scoped.problems).toEqual([
      expect.stringContaining(
        ".kit-frame:not([data-layout='image']) .kit-caption names a data-layout",
      ),
      expect.stringContaining('names a data-layout inside :not()'),
    ]);
  });
});

describe('renameAttributes', () => {
  it('renames whole kit opt-in attributes only, in selectors, markup and comments', () => {
    const attributes = new Set(['data-kit-stat-cards']);
    const text = [
      '/* Opt in with `data-kit-stat-cards`. */',
      ':where([data-kit-stat-cards]) .kit-stat, [data-kit-stat-cards-wide] .x { color: red; }',
      '<div data-kit-stat-cards="" data-kit-display-align="" /> { \'data-kit-stat-cards\': \'\' }',
      '[data-stat-cards], [data-kit-stat] { --data-kit-stat-cards: 1; }',
    ].join('\n');
    expect(renameAttributes(text, attributes, 'brand')).toBe(
      [
        '/* Opt in with `data-own-stat-cards`. */',
        ':where([data-own-stat-cards]) .kit-stat, [data-kit-stat-cards-wide] .x { color: red; }',
        '<div data-own-stat-cards="" data-kit-display-align="" /> { \'data-own-stat-cards\': \'\' }',
        '[data-stat-cards], [data-kit-stat] { --data-kit-stat-cards: 1; }',
      ].join('\n'),
    );
  });

  it("gives a brand's copy and a deck's copy names as long as the kit's", () => {
    expect(ownAttributeName('data-kit-display-align', 'brand')).toBe('data-own-display-align');
    expect(ownAttributeName('data-kit-display-align', 'deck')).toBe('data-dck-display-align');
    expect(renameAttributes('[data-kit-x]', new Set(), 'deck')).toBe('[data-kit-x]');
  });

  it('lists the kit opt-in attributes a stylesheet selects, comments left out', () => {
    const css = [
      '/* [data-kit-commented] */',
      ".kit-frame[data-kit-display-align][data-align='center'] .kit-eyebrow {}",
      ':where([ data-kit-stat-cards ]) .kit-stat, [data-kit-stat-cards="x"] .y {}',
      '[data-layout] [data-kitchen] {}',
    ].join('\n');
    expect(selectorAttributes(css)).toEqual(['data-kit-display-align', 'data-kit-stat-cards']);
  });
});

describe('unownedSelectors', () => {
  it('lists the selectors keyed on neither a renamed class nor a renamed attribute', () => {
    const css = [
      '@layer components {',
      '  /* A comment, then a rule keyed on the attribute. */',
      '  :where([data-kit-stat-cards]) .kit-stat,',
      '  .kit-stat-label {',
      '    color: red;',
      '  }',
      '',
      '  @media (width < 800px) {',
      '    .kit-scrim > .kit-eyebrow,',
      '    .kit-scrim + .kit-eyebrow {',
      '      color: blue;',
      '    }',
      '  }',
      '',
      '  @keyframes kit-fade {',
      '    from {',
      '      opacity: 0;',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n');
    expect(unownedSelectors(css, new Set(['kit-scrim']), new Set(['data-kit-stat-cards']))).toEqual(
      ['.kit-stat-label'],
    );
    expect(unownedSelectors(css, new Set(), new Set())).toEqual([
      ':where([data-kit-stat-cards]) .kit-stat',
      '.kit-stat-label',
      '.kit-scrim > .kit-eyebrow',
      '.kit-scrim + .kit-eyebrow',
    ]);
  });

  it('requires an owned class or attribute outside negation on every branch', () => {
    const unowned = [
      '.foreign:not(.kit-owned)',
      ':NOT(:is(.kit-owned, [data-kit-owned]))',
      String.raw`:n\6ft(.kit-owned)`,
      ':is(.kit-owned, .foreign)',
      ':where(.kit-owned, :is([data-kit-owned], .foreign))',
      ':has(> .kit-owned, + .foreign)',
      ':nth-child(odd of .kit-owned, .foreign)',
      '[title=".kit-owned"]',
    ];
    const owned = [
      '.kit-owned:is(.foreign, .other):not([data-kit-owned])',
      ':is(.kit-owned, :where([data-kit-owned], .kit-owned))',
      ':has(> .kit-owned, + [data-kit-owned])',
      ':nth-last-child(2n + 1 of .kit-owned, [data-kit-owned])',
      ':where([data-kit-owned /* positive */], .kit-owned)',
    ];
    const css = `${[...unowned, ...owned].join(',\n')} { color: red; }`;
    expect(unownedSelectors(css, new Set(['kit-owned']), new Set(['data-kit-owned']))).toEqual(
      unowned,
    );
  });
});
