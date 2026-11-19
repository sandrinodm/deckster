import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { trackSlideFileChanges } from '#decks/slide-file-changes.ts';

describe('slide file changes', () => {
  let slidesDir: string;
  let slide: string;

  beforeEach(() => {
    slidesDir = mkdtempSync(path.join(tmpdir(), 'deckster-slides-'));
    slide = path.join(slidesDir, 'title.mdx');
    writeFileSync(slide, '# Original title');
  });

  afterEach(() => {
    rmSync(slidesDir, { recursive: true, force: true });
  });

  it('leaves an atomic replacement to Vite for every watcher event shape', () => {
    const changed = trackSlideFileChanges(slidesDir);
    const staged = path.join(slidesDir, '.title.mdx.a1b2.deck-sync');
    writeFileSync(staged, '# New title');
    expect(changed('add', staged)).toBe(false);
    renameSync(staged, slide);
    expect(changed('unlink', staged)).toBe(false);
    expect(changed('unlink', slide)).toBe(false);
    expect(changed('add', slide)).toBe(false);
    expect(changed('change', slide)).toBe(false);
  });

  it('reports a real removal and a subsequent addition of the same slide', () => {
    const changed = trackSlideFileChanges(slidesDir);
    rmSync(slide);
    expect(changed('unlink', slide)).toBe(true);
    expect(changed('unlink', slide)).toBe(false);
    writeFileSync(slide, '# Restored title');
    expect(changed('add', slide)).toBe(true);
    expect(changed('add', slide)).toBe(false);
  });

  it('reports a filename change even when the number of slides stays the same', () => {
    const changed = trackSlideFileChanges(slidesDir);
    const renamed = path.join(slidesDir, 'opening.mdx');
    renameSync(slide, renamed);
    expect(changed('add', renamed)).toBe(true);
    expect(changed('unlink', slide)).toBe(false);
  });
});
