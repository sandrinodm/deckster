import { defineDeck } from '@deckster/engine/config';

/**
 * Surface background layers and the slide's own `background:`, rendered in the CLI's `layered`
 * fixture brand: a tinted photo with a corner mark, an untinted busy photo (its text fails contrast
 * on purpose), a dotted pattern, a faint mark under a glow, each form of the override, the image
 * layout on a layered surface, a chart on a photo and a centred cover over a bright mark in the
 * middle of the slide. `backdrop-probes.test.ts` lints and shoots it.
 */
export default defineDeck({
  title: 'Backdrop probes fixture',
  brand: 'layered',
  slides: [
    'photo-title',
    'photo-content',
    'raw-photo-content',
    'dots-cards',
    'marked-content',
    'override-tinted',
    'override-over',
    'override-none',
    'image-on-photo',
    'chart-on-photo',
    'override-path',
    'centred-cover',
  ],
});
