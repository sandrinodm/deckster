import { describe, expect, it } from '@effect/vitest';

import { parseImports, printImports } from '#layouts/eject/import-block.ts';

describe('parseImports', () => {
  it('reads every kind of import at the top of a module', () => {
    const source = [
      "import type { ReactNode } from 'react';",
      '',
      "import Default, { a, type B as C } from './one.ts';",
      "import * as all from './two.ts';",
      'import {',
      '  first,',
      '  second,',
      "} from '#three.ts';",
      "import './styles.css';",
      '',
      'export const value = 1;',
      '',
    ].join('\n');
    const block = parseImports(source);
    expect(block?.statements.map((statement) => statement.specifier)).toEqual([
      'react',
      './one.ts',
      './two.ts',
      '#three.ts',
      './styles.css',
    ]);
    expect(block?.statements[1]).toMatchObject({
      defaultName: 'Default',
      named: [
        { name: 'a', alias: undefined, typeOnly: false },
        { name: 'B', alias: 'C', typeOnly: true },
      ],
    });
    expect(block?.statements[2]?.namespace).toBe('all');
    expect(block?.statements[4]?.sideEffect).toBe(true);
    expect(source.slice(block?.end)).toBe('\n\nexport const value = 1;\n');
  });

  it('stops at the first code between imports and finds none in a module without any', () => {
    const source = "import { a } from './a.ts';\nconst x = 1;\nimport { b } from './b.ts';\n";
    expect(parseImports(source)?.statements).toHaveLength(1);
    expect(parseImports('export const value = 1;\n')).toBeUndefined();
  });
});

describe('printImports', () => {
  it('merges, groups and sorts as the formatter does', () => {
    const statements = parseImports(
      [
        "import './layout.css';",
        "import { Portrait } from '../_shared/portrait.tsx';",
        "import type contract from './contract.ts';",
        "import { useEnter } from '@deckster/kit/layout-parts';",
        "import { defineLayout, type LayoutProps } from '@deckster/engine';",
        "import { Frame } from '@deckster/kit/layout-parts';",
        "import type { ReactNode } from 'react';",
      ].join('\n'),
    )?.statements;
    expect(printImports(statements ?? [])).toBe(
      [
        "import type { ReactNode } from 'react';",
        '',
        "import { defineLayout, type LayoutProps } from '@deckster/engine';",
        "import { Frame, useEnter } from '@deckster/kit/layout-parts';",
        '',
        "import type contract from './contract.ts';",
        '',
        "import { Portrait } from '../_shared/portrait.tsx';",
        "import './layout.css';",
      ].join('\n'),
    );
  });

  it('puts one name per line when the statement is wider than the line', () => {
    const names = ['AlignField', 'alignHint', 'CHROME_HINT', 'chromeField', 'EYEBROW_HINT'];
    const more = ['EyebrowField', 'TREATMENT_HINT', 'TreatmentField'];
    const source = `import { ${[...more, ...names].join(', ')} } from '@deckster/kit/layout-fields';`;
    expect(printImports(parseImports(source)?.statements ?? [])).toBe(
      [
        'import {',
        ...[...names, ...more].map((name) => `  ${name},`),
        "} from '@deckster/kit/layout-fields';",
      ].join('\n'),
    );
  });
});
