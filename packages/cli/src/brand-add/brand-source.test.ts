import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { parseBrandSource, type BrandSource } from '#brand-add/brand-source.ts';

/**
 * Sources that parse, with what they parse to.
 */
const VALID: readonly (readonly [string, BrandSource])[] = [
  [
    'gh:acme/brand-kit/brands/acme#v2',
    { remote: 'https://github.com/acme/brand-kit.git', folder: 'brands/acme', ref: 'v2' },
  ],
  [
    'github:acme/brand-kit',
    { remote: 'https://github.com/acme/brand-kit.git', folder: '', ref: undefined },
  ],
  [
    'https://github.com/acme/brand-kit/tree/main/brands/acme/',
    { remote: 'https://github.com/acme/brand-kit.git', folder: 'brands/acme', ref: 'main' },
  ],
  [
    'https://github.com/acme/brand-kit',
    { remote: 'https://github.com/acme/brand-kit.git', folder: '', ref: undefined },
  ],
  [
    'https://github.com/acme/brand-kit.git//brands/acme#release/2026',
    { remote: 'https://github.com/acme/brand-kit.git', folder: 'brands/acme', ref: 'release/2026' },
  ],
  [
    'https://git.example.com:8443/design/brand-kit.git//acme',
    { remote: 'https://git.example.com:8443/design/brand-kit.git', folder: 'acme', ref: undefined },
  ],
  [
    'ssh://git@git.example.com/design/brand-kit.git//acme#v1.2.0',
    { remote: 'ssh://git@git.example.com/design/brand-kit.git', folder: 'acme', ref: 'v1.2.0' },
  ],
  [
    'git@github.com:acme/brand-kit.git//brands/acme#v2',
    { remote: 'git@github.com:acme/brand-kit.git', folder: 'brands/acme', ref: 'v2' },
  ],
  [
    'git@github.com:acme/brand-kit.git',
    { remote: 'git@github.com:acme/brand-kit.git', folder: '', ref: undefined },
  ],
];

/**
 * Sources that are refused, with part of the reason.
 */
const INVALID: readonly (readonly [string, string])[] = [
  ['file:///tmp/brand-kit//acme', 'only https:// and ssh://'],
  ['ext::sh -c touch% /tmp/pwned', 'neither gh:owner/repo'],
  ['http://github.com/acme/brand-kit', 'only https:// and ssh://'],
  ['https://user:token@github.com/acme/brand-kit', 'user name, token or password'],
  ['https://token@github.com/acme/brand-kit', 'user name, token or password'],
  ['gh:acme', 'the owner and the repository'],
  ['gh:acme/brand-kit/../../etc', 'the folder segment ".."'],
  ['gh:acme/brand-kit/brands/*', 'the folder segment "*"'],
  ['gh:acme/brand-kit/-x', 'the folder segment "-x"'],
  ['gh:acme/brand-kit#--upload-pack=evil', 'the ref "--upload-pack=evil"'],
  ['gh:acme/brand-kit#a..b', 'the ref "a..b"'],
  ['https://github.com/acme/brand-kit/blob/main/brand.ts', 'github.com/owner/repo/tree/'],
  ['https://github.com/acme/brand-kit/tree/main/brands/acme#v2', 'leave out the #ref'],
  ['-oProxyCommand=evil@host:repo', 'is not a user and host'],
  ['brands/acme', 'neither gh:owner/repo'],
];

describe('parseBrandSource', () => {
  it.effect('reads the shorthand, GitHub links and git addresses', () =>
    Effect.gen(function* () {
      for (const [input, expected] of VALID) {
        expect(yield* parseBrandSource(input), input).toEqual(expected);
      }
    }),
  );

  it.effect('refuses other protocols, credentials and unsafe segments or refs', () =>
    Effect.gen(function* () {
      for (const [input, reason] of INVALID) {
        const error = yield* Effect.flip(parseBrandSource(input));
        expect(error.message, input).toContain(reason);
        expect(error.message, input).toContain('deck brand --help');
      }
    }),
  );
});
