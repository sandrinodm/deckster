import { describe, expect, it } from 'vite-plus/test';

import { EDITOR_ENV_FILE, envDeclarations, mergeTsconfig } from '#editor-types/editor-tsconfig.ts';

/**
 * Parses merged output.
 *
 * @param text - The merged file text.
 */
function parse(text: string | undefined): {
  compilerOptions: { paths: Record<string, string[]>; strict: boolean; jsx: string };
  include: string[];
} {
  return JSON.parse(text ?? '{}');
}

describe('mergeTsconfig', () => {
  it('writes a complete file when there is none', () => {
    const merged = parse(mergeTsconfig(undefined, { '@deckster/engine': ['/f/engine.ts'] }));

    expect(merged.compilerOptions.paths).toEqual({ '@deckster/engine': ['/f/engine.ts'] });
    expect(merged.compilerOptions.strict).toBe(true);
    expect(merged.compilerOptions.jsx).toBe('react-jsx');
    expect(merged.include).toEqual(['decks/**/*', 'brands/**/*', EDITOR_ENV_FILE]);
  });

  it('keeps what the workspace wrote and replaces the paths it owns', () => {
    const existing = JSON.stringify({
      extends: './base.json',
      compilerOptions: {
        strict: false,
        paths: { '@deckster/old': ['/old.ts'], '*': ['/old/*'], '@mine/*': ['./mine/*'] },
      },
      include: ['decks'],
    });

    const merged = parse(mergeTsconfig(existing, { '@deckster/engine': ['/f/engine.ts'] }));

    expect(JSON.parse(mergeTsconfig(existing, {}) ?? '{}').extends).toBe('./base.json');
    expect(merged.compilerOptions.strict).toBe(false);
    expect(merged.compilerOptions.paths).toEqual({
      '@mine/*': ['./mine/*'],
      '@deckster/engine': ['/f/engine.ts'],
    });
    expect(merged.include).toEqual(['decks', EDITOR_ENV_FILE]);
  });

  it('writes no compiler defaults when the file extends another config', () => {
    const merged = parse(mergeTsconfig('{"extends":"./base.json"}', { '*': ['/m/*'] }));

    expect(Object.keys(merged.compilerOptions)).toEqual(['paths']);
  });

  it('replaces the entries of the packages it maps and keeps the workspace ones', () => {
    const existing = JSON.stringify({
      compilerOptions: {
        paths: { effect: ['/old'], 'effect/Old': ['/old'], '@mine/x': ['/mine'] },
      },
    });

    const merged = parse(mergeTsconfig(existing, { effect: ['/new'] }));

    expect(merged.compilerOptions.paths).toEqual({ '@mine/x': ['/mine'], effect: ['/new'] });
  });

  it('is stable when run twice', () => {
    const once = mergeTsconfig(undefined, { '*': ['/m/*'] });

    expect(mergeTsconfig(once, { '*': ['/m/*'] })).toBe(once);
  });

  it('refuses a file that is not plain JSON', () => {
    expect(mergeTsconfig('{ // comment\n}', {})).toBeUndefined();
    expect(mergeTsconfig('[]', {})).toBeUndefined();
  });
});

describe('envDeclarations', () => {
  it('references each declaration file', () => {
    expect(envDeclarations(['/a/index.d.ts'])).toContain('/// <reference path="/a/index.d.ts" />');
  });
});
