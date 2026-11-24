import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  IMAGE_REVEAL_BAR_SURFACES,
  IMAGE_REVEAL_DOCKS,
  IMAGE_REVEAL_FITS,
  IMAGE_REVEAL_PAINT_MAX_CHARS,
  imageRevealLayoutContract,
} from '#layouts/image-reveal-layout.contract.ts';
import { LIMIT_CASES } from '#layouts/limit-cases.ts';

/**
 * Decodes the common slide fields and the layout's own fields, rejecting excess properties.
 *
 * @param fields - Frontmatter fields without the layout name.
 */
function decode(fields: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...imageRevealLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'image-reveal', ...fields },
    { onExcessProperty: 'error' },
  );
}

describe('the image-reveal layout contract', () => {
  it('defaults to a gradient cover that docks to a default footer bar with cover fit and no chrome', () => {
    expect(imageRevealLayoutContract.surface).toBe('gradient');
    expect(imageRevealLayoutContract.title?.required).toBe(true);
    expect(imageRevealLayoutContract.slots['media']?.required).toBe(true);
    expect(decode({})).toMatchObject({
      dock: 'bottom',
      align: 'left',
      barSurface: 'default',
      fit: 'cover',
      chrome: false,
    });
  });

  it('accepts every dock edge, alignment, bar surface, fit and custom bar paint override', () => {
    for (const dock of IMAGE_REVEAL_DOCKS) {
      for (const barSurface of IMAGE_REVEAL_BAR_SURFACES) {
        for (const fit of IMAGE_REVEAL_FITS) {
          expect(() =>
            decode({
              dock,
              align: 'center',
              barSurface,
              fit,
              barBackground: '#102030',
              barBorder: 'rgba(255, 255, 255, 0.25)',
              focal: 'center 30%',
              treatment: 'plain',
              chrome: true,
            }),
          ).not.toThrow();
        }
      }
    }

    expect(() =>
      decode({ barBackground: 'linear-gradient(90deg, #0f172a, #1e293b)' }),
    ).not.toThrow();
    expect(() => decode({ dock: 'left' })).toThrow('Expected "bottom" | "top"');
    expect(() => decode({ barSurface: 'dark' })).toThrow('Expected "default"');
    expect(() => decode({ fit: 'stretch' })).toThrow('Expected "cover" | "contain"');
  });

  it('rejects unsafe or overly long custom bar background and border values', () => {
    for (const field of ['barBackground', 'barBorder'] as const) {
      expect(() => decode({ [field]: '' })).toThrow('Expected a value with a length of at least 1');
      expect(() => decode({ [field]: 'url(https://evil.example/a.png)' })).toThrow('url()');
      expect(() => decode({ [field]: '#000; color: red' })).toThrow('semicolons');
      expect(() => decode({ [field]: '#000}' })).toThrow('braces');
      expect(() => decode({ [field]: 'a'.repeat(IMAGE_REVEAL_PAINT_MAX_CHARS + 1) })).toThrow(
        `at most ${IMAGE_REVEAL_PAINT_MAX_CHARS} characters`,
      );
    }
  });

  it('provides stress limit cases for both dock edges and fits and maps title/subtitle to PowerPoint', () => {
    const cases = LIMIT_CASES['image-reveal'] ?? [];
    expect(cases.length).toBeGreaterThanOrEqual(4);
    for (const item of cases) {
      expect(() => decode(item.frontmatter)).not.toThrow();
    }

    expect(imageRevealLayoutContract.pptx).toEqual({
      type: 'title',
      placeholders: [
        { kind: 'title', from: { selector: '.kit-image-reveal-title' } },
        { kind: 'subtitle', from: { slot: 'body' } },
      ],
    });
  });
});
