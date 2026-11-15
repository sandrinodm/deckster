import { defineDeck } from '@deckster/engine/config';

/**
 * One slide per rendered lint rule, each with a case that must be reported and one that must not.
 * Surfaces alternate so only the last three slides repeat a layout on the same surface.
 */
export default defineDeck({
  title: 'Lint rules fixture',
  slides: [
    'decoration',
    'overflowing',
    'small-type',
    'overlap',
    'low-contrast',
    'off-brand',
    'images',
    'build-warnings',
    'list-in-statement',
    'throws',
    'late-error',
    'no-notes',
    'too-many-bullets',
    'repeated',
  ],
});
