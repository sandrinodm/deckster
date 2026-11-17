import { defineDeck } from '@deckster/engine/config';

/**
 * The component deck for the kit's code and media components: a `code` layout with highlight steps,
 * diff notation and word focus, a Magic Move sequence, a typed terminal, an image with a brand
 * treatment, a video with step cues, a Lottie animation and icons, and step reveals with every
 * `<Step>` effect, a focus build and a figure that counts up, a section that sets its own
 * transition and a photo that morphs across two slides. It mixes every brand surface. The API team,
 * Larkfield and its endpoints are fictional; the street photo is CC0 from Wikimedia Commons and the
 * video and the animation were made for this deck (see `assets/CREDITS.txt`).
 */
export default defineDeck({
  title: 'Shipping the canopy API',
  brand: 'default',
  slides: [
    'middleware-order',
    'video-cues',
    'user-or-401',
    'handler-evolves',
    'deploy',
    'register',
    'in-tsx',
    'after-launch',
    'rollout-checks',
    'edge-latency',
    'street-survey',
    'street-record',
  ],
});
