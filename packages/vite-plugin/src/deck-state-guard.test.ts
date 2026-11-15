import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

import { deckStateGuardPlugin, deckStateMessage } from '#deck-state-guard.ts';

/**
 * Calls the plugin's `load` hook the way Vite does, with an `error` that throws.
 *
 * @param id - The module id.
 * @param workspaceRoot - The workspace the plugin guards.
 */
function load(id: string, workspaceRoot = '/work'): unknown {
  const plugin = deckStateGuardPlugin(workspaceRoot);
  const hook = plugin.load;
  const handler = typeof hook === 'function' ? hook : hook?.handler;
  const context = {
    error: (message: string) => {
      throw new Error(message);
    },
  };
  return Reflect.apply(handler as (...args: unknown[]) => unknown, context, [id]);
}

describe('the .deck/ import guard', () => {
  it('refuses a module in a working copy, with or without a query', () => {
    const staged = '/work/.deck/agent/hello/work/1-0123456789ab/slides/x.tsx';
    expect(() => load(staged)).toThrow(deckStateMessage(staged));
    expect(() => load(`${staged}?raw`)).toThrow('may not import');
  });

  it('refuses a module in .deck/ named in other letter case or reached through a link', () => {
    const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'deck-state-guard-')));
    const slides = path.join(root, '.deck/agent/hello/work/1-0123456789ab/slides');
    mkdirSync(slides, { recursive: true });
    writeFileSync(path.join(slides, 'x.css'), '.x { color: red; }\n');
    mkdirSync(path.join(root, 'decks/hello/slides'), { recursive: true });
    symlinkSync(slides, path.join(root, 'decks/hello/slides/linked'));
    const variant = path.join(root, '.DECK/agent/hello/work/1-0123456789ab/slides/x.css');
    expect(() => load(variant, root)).toThrow('may not import');
    expect(() => load(path.join(root, 'decks/hello/slides/linked/x.css'), root)).toThrow(
      'may not import',
    );
    expect(load(path.join(root, 'decks/hello/slides/title.mdx'), root)).toBeNull();
  });

  it('loads nothing itself for any other module', () => {
    expect(load('/work/decks/hello/slides/title.mdx')).toBeNull();
    expect(load('/work/.decks/x.ts')).toBeNull();
  });
});
