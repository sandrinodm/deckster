import type { SlideRule } from '#lint/types.ts';

/**
 * The attribute `<Video>` sets to the number of parts its cues cut it into.
 */
const PARTS_ATTRIBUTE = 'video-parts';

/**
 * The attribute `<Video>` sets to the number of posters it was given in `posters`.
 */
const POSTERS_ATTRIBUTE = 'video-posters';

/**
 * A video cut into parts by `cues` without a poster per part. Static mode, `deckster shot --steps`
 * and exports never play video, so every step of the slide would show the same still and the steps
 * would look like they do nothing.
 */
export const videoCuePostersRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'video-cue-posters',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * The video and its cues are the same at every step.
   */
  scope: 'slide',

  /**
   * The slide still works live; only its stills repeat.
   */
  severity: 'warning',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: 'A cued <Video> has no poster per part, so its steps export as the same still.',

  /**
   * Reports each cued video whose `posters` do not cover every part.
   */
  check: ({ snapshot }) =>
    snapshot.elements.flatMap((element) => {
      const parts = Number(element.data[PARTS_ATTRIBUTE] ?? 1);
      const posters = Number(element.data[POSTERS_ATTRIBUTE] ?? 0);
      if (parts < 2 || posters === parts) {
        return [];
      }

      return [
        {
          message:
            posters === 0
              ? `A <Video> is cut into ${parts} parts by its cues but has one poster, so static ` +
                'mode, `deckster shot --steps` and exports show the same still at every step.'
              : `A <Video> has ${parts} parts but ${posters} posters.`,
          fix:
            `Add \`posters={['../assets/part-1.jpg', ...]}\` with ${parts} stills, ` +
            'each the frame at the end of its part ' +
            '(ffmpeg -ss <cue> -i video.webm -frames:v 1 part.jpg).',
          selector: element.selector,
        },
      ];
    }),
};
