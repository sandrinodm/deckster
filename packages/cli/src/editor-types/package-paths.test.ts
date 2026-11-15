import { describe, expect, it } from 'vite-plus/test';

import { packagePaths } from '#editor-types/package-paths.ts';

describe('packagePaths', () => {
  it('maps each public specifier to its file', () => {
    const manifest = {
      exports: {
        './package.json': './package.json',
        '.': './dist/index.js',
        './Schema': { import: './dist/Schema.js' },
        './*': './dist/*.js',
        './internal/*': null,
      },
    };

    expect(packagePaths('effect', '/m/effect', manifest)).toEqual({
      effect: ['/m/effect/dist/index'],
      'effect/Schema': ['/m/effect/dist/Schema'],
      'effect/*': ['/m/effect/dist/*'],
    });
  });

  it('prefers declarations and skips conditions of other tools', () => {
    const manifest = {
      exports: {
        '.': {
          'types@<=5.0': { default: './ts5.0/index.d.ts' },
          types: { default: './index.d.ts' },
        },
        './jsx-runtime': { 'react-server': './x.js', default: './jsx-runtime.js' },
      },
    };

    expect(packagePaths('react', '/m/@types/react', manifest)).toEqual({
      react: ['/m/@types/react/index.d.ts'],
      'react/jsx-runtime': ['/m/@types/react/jsx-runtime'],
    });
  });

  it('maps nothing for a package without exports', () => {
    expect(packagePaths('x', '/m/x', { main: './index.js' })).toEqual({});
    expect(packagePaths('x', '/m/x', null)).toEqual({});
  });
});
