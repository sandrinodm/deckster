import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { fieldLimitBreaches, slideFieldLimits } from '@deckster/engine/layout';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  EXERCISE_DURATION_MAX_CHARS,
  EXERCISE_GROUPS_MAX_CHARS,
  EXERCISE_INSTRUCTION_MAX_CHARS,
  EXERCISE_INSTRUCTION_MAX_CHARS_DENSE,
  EXERCISE_OUTPUT_MAX_CHARS,
  exerciseLayoutContract,
} from '#layouts/exercise-layout.contract.ts';

/**
 * A complete brief with no optional fields.
 */
const BRIEF = {
  duration: '10 min',
  instructions: ['Choose a block.', 'Mark the planting site.'],
  output: 'One annotated map',
};

/**
 * Decodes the common and layout fields together, rejecting unknown fields as the build does.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...exerciseLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'exercise', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the exercise layout contract', () => {
  it('takes two to five instructions and defaults to visible chrome', () => {
    expect(decode(BRIEF)).toMatchObject({ chrome: true });
    expect(() =>
      decode({ ...BRIEF, instructions: Array(5).fill('Choose a block.') }),
    ).not.toThrow();
    expect(() => decode({ ...BRIEF, instructions: ['Choose.'] })).toThrow('at least 2');
    expect(() => decode({ ...BRIEF, instructions: Array(6).fill('Choose.') })).toThrow('at most 5');
  });

  it('requires a duration, an output and nonempty instructions', () => {
    for (const field of ['duration', 'output']) {
      expect(() => decode({ ...BRIEF, [field]: undefined })).toThrow('Expected string');
      expect(() => decode({ ...BRIEF, [field]: '' })).toThrow('length of at least 1');
    }

    expect(() => decode({ ...BRIEF, instructions: ['', 'Choose.'] })).toThrow(
      'length of at least 1',
    );
  });

  it('enforces character limits and accepts optional grouping and shared fields', () => {
    const limits = {
      duration: EXERCISE_DURATION_MAX_CHARS,
      output: EXERCISE_OUTPUT_MAX_CHARS,
      groups: EXERCISE_GROUPS_MAX_CHARS,
    };
    for (const [field, max] of Object.entries(limits)) {
      expect(() => decode({ ...BRIEF, [field]: 'x'.repeat(max) })).not.toThrow();
      expect(() => decode({ ...BRIEF, [field]: 'x'.repeat(max + 1) })).toThrow(`at most ${max}`);
    }

    expect(() =>
      decode({
        ...BRIEF,
        instructions: ['x'.repeat(EXERCISE_INSTRUCTION_MAX_CHARS + 1), 'Choose.'],
      }),
    ).toThrow(`at most ${EXERCISE_INSTRUCTION_MAX_CHARS} characters`);
    expect(
      decode({ ...BRIEF, groups: 'In pairs', eyebrow: 'Practice', chrome: false }),
    ).toMatchObject({ chrome: false, groups: 'In pairs' });
    expect(() => decode({ ...BRIEF, colour: 'red' })).toThrow('Expected no excess property');
  });

  it('holds four and five instructions to the same shorter limit', () => {
    for (const count of [3, 4, 5]) {
      const instructions = Array(count).fill('x'.repeat(EXERCISE_INSTRUCTION_MAX_CHARS_DENSE + 1));
      const frontmatter = { ...BRIEF, instructions };
      const limits = slideFieldLimits(exerciseLayoutContract, { frontmatter, filled: [] });
      expect(fieldLimitBreaches(frontmatter, limits)).toHaveLength(count === 3 ? 0 : count);
    }
  });

  it('exports a title-only PowerPoint slide with title and context placeholders', () => {
    expect(exerciseLayoutContract.pptx).toMatchObject({
      type: 'title-only',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
  });
});
