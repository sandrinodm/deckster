import { describe, expect, it } from '@effect/vitest';

import {
  kitClassTokens,
  renameClasses,
  scopeStylesheet,
  selectorClasses,
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
    expect(renameClasses(text, classes)).toBe(
      [
        '/* The mark (`.own-mark`). */',
        '.own-mark { --kit-mark-aspect: 1; }',
        '.kit-mark-mono, .kit-marker, .kit-portrait-photo { color: red; }',
        'const id = `kit-mark-mono-${n}`;',
        '<span className={`own-mark ${extra}`} /><i className="own-portrait kit-type-label" />',
      ].join('\n'),
    );
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
    expect(scopeStylesheet(css, 'title')).toBe(
      [
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
    );
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
    expect(scopeStylesheet(css, 'title')).toBe(
      [
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
    );
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
    expect(scopeStylesheet(css, 'title')).toBe(
      [
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
    );
  });
});
