import { describe, expect, it } from 'vite-plus/test';

import { parseValidatorOutput, validatorRunArgs } from '#verify/validate-ooxml.ts';

describe('parseValidatorOutput', () => {
  it('reads the first file and its errors', () => {
    const output = JSON.stringify([
      {
        file: '/work/a.pptx',
        ok: false,
        errors: [
          {
            id: 'Sch_UnexpectedElementContentExpectingComplex',
            description: 'The element has unexpected child element.',
            part: '/ppt/slides/slide1.xml',
            path: '/p:sld[1]',
            type: 'Schema',
          },
        ],
      },
    ]);
    expect(parseValidatorOutput(output)).toEqual({
      validator: 'Open XML SDK 3.3 validator (Microsoft 365 format)',
      ok: false,
      errors: [
        {
          description: 'The element has unexpected child element.',
          part: '/ppt/slides/slide1.xml',
          path: '/p:sld[1]',
        },
      ],
    });
  });

  it('returns null for output that is not the validator JSON', () => {
    expect(parseValidatorOutput('Unhandled exception')).toBeNull();
  });

  it('says why a validator that printed an empty list cannot call the file valid', () => {
    const parsed = parseValidatorOutput('[]');
    expect(parsed?.ok).toBe(false);
    expect(parsed?.errors).toHaveLength(1);
    expect(parsed?.errors[0]?.description).toContain('no result');
  });

  it('keeps a failing verdict that came without any error entries explained', () => {
    const parsed = parseValidatorOutput(
      JSON.stringify([{ file: 'a.pptx', ok: false, errors: [] }]),
    );
    expect(parsed?.ok).toBe(false);
    expect(parsed?.errors[0]?.description).toContain('without saying');
  });
});

describe('validatorRunArgs', () => {
  it('mounts the folder of a path with a colon or a comma in a form docker reads', () => {
    expect(validatorRunArgs('/Users/a:b/out/deck.pptx', 'img:1')).toEqual([
      'run',
      '--rm',
      '--network=none',
      '--mount',
      'type=bind,source=/Users/a:b/out,target=/work,readonly',
      'img:1',
      '/work/deck.pptx',
    ]);
    expect(validatorRunArgs('/o/a,b/deck.pptx', 'img:1')[4]).toBe(
      'type=bind,"source=/o/a,b",target=/work,readonly',
    );
  });
});
