import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { parseBrandSource, type BrandSource } from '#brand-add/brand-source.ts';

/**
 * Sources that parse, with what they parse to.
 */
const VALID: readonly (readonly [string, Omit<BrandSource, 'display'>])[] = [
  [
    'gh:acme/brand-kit/brands/acme#v2',
    { remote: 'https://github.com/acme/brand-kit.git', folder: 'brands/acme', ref: 'v2' },
  ],
  [
    ' github:acme/brand-kit ',
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
    'ssh://git@github.com:22/acme/brand-kit.git',
    { remote: 'ssh://git@github.com:22/acme/brand-kit.git', folder: '', ref: undefined },
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
  ['https://@github.com/acme/brand-kit', 'user name, token or password'],
  ['gh:acme', 'the owner and the repository'],
  ['gh:acme/brand-kit/../../etc', 'folder segments may hold only'],
  ['gh:acme/brand-kit/brands/*', 'folder segments may hold only'],
  ['gh:acme/brand-kit/-x', 'folder segments may hold only'],
  ['gh:acme/brand-kit#--upload-pack=evil', 'the ref has invalid syntax'],
  ['gh:acme/brand-kit#a..b', 'the ref has invalid syntax'],
  ['https://github.com/acme/brand-kit/blob/main/brand.ts', 'github.com/owner/repo/tree/'],
  ['https://github.com/acme/brand-kit/tree/main/brands/acme#v2', 'leave out the #ref'],
  ['-oProxyCommand=evil@host:repo', 'needs a valid user and host'],
  ['brands/acme', 'neither gh:owner/repo'],
];

/**
 * A synthetic credential used in rejected source components.
 */
const MARKER = 'synthetic-brand-credential';

/**
 * Invalid authority, path, folder and ref spellings that must not echo the credential.
 */
const SECRET_SOURCES = [
  `https://user:${MARKER}@github.com/acme/brand-kit`,
  `https://${MARKER}@github.com/acme/brand-kit`,
  `ssh://git:${MARKER}@example.test/acme/brand-kit`,
  `ssh://git%3A${MARKER}@example.test/acme/brand-kit`,
  `https://${MARKER}?query@example.test/acme/brand-kit`,
  `https://example.test?token=${MARKER}/acme/brand-kit`,
  `https://example.test/acme/brand-kit?token=${MARKER}`,
  `https://example.test/acme/brand-kit//brand?token=${MARKER}`,
  `https://github.com/acme/brand-kit/tree/main?token=${MARKER}`,
  `gh:acme/brand-kit#main?token=${MARKER}`,
  `git:${MARKER}@example.test:acme/brand-kit`,
  `git@${MARKER}?query:acme/brand-kit`,
];

describe('parseBrandSource', () => {
  it.effect('reads the shorthand, GitHub links and git addresses', () =>
    Effect.gen(function* () {
      for (const [input, expected] of VALID) {
        expect(yield* parseBrandSource(input), input).toEqual({
          ...expected,
          display: input.trim(),
        });
      }
    }),
  );

  it.effect('refuses other protocols, credentials and unsafe segments or refs', () =>
    Effect.gen(function* () {
      for (const [input, reason] of INVALID) {
        const error = yield* Effect.flip(parseBrandSource(input));
        expect(error.message, input).toContain(reason);
        expect(error.message, input).toContain('deckster brand --help');
      }
    }),
  );

  it.effect('omits credentials in rejected source components', () =>
    Effect.gen(function* () {
      for (const source of SECRET_SOURCES) {
        const error = yield* Effect.flip(parseBrandSource(source));
        expect(error.message).toContain('Invalid brand source');
        expect(error.message).not.toContain(MARKER);
      }
    }),
  );
});
