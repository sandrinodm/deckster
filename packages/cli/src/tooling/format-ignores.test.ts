import { FRAMEWORK_ROOT } from '@deckster/brand/node';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

/**
 * The parts of the root Vite+ config this test reads.
 */
type RootConfig = {
  fmt: { ignorePatterns: string[] };
  lint: { ignorePatterns: string[] };
};

/**
 * Whether any of the patterns matches a workspace path.
 *
 * @param patterns - Ignore globs.
 * @param file - A path relative to the workspace root.
 */
function ignored(patterns: readonly string[], file: string): boolean {
  return patterns.some((pattern) => path.matchesGlob(file, pattern));
}

describe('the formatter and linter ignore list', () => {
  it('leaves the content agents write alone and keeps brand files formatted', async () => {
    const { default: config } = (await import(path.join(FRAMEWORK_ROOT, 'vite.config.ts'))) as {
      default: RootConfig;
    };
    for (const patterns of [config.fmt.ignorePatterns, config.lint.ignorePatterns]) {
      for (const file of [
        '.agents/skills/brand-import/SKILL.md',
        '.claude/skills/brand-import/SKILL.md',
        'decks/zz-eval-exec/BRIEF.md',
        'decks/hello/notes/outline.md',
        'decks/hello/slides/cover.mdx',
      ]) {
        expect(ignored(patterns, file), file).toBe(true);
      }

      for (const file of ['brands/acme/brand.ts', 'decks/hello/deck.config.ts', 'AGENTS.md']) {
        expect(ignored(patterns, file), file).toBe(false);
      }
    }
  });
});
