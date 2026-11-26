import { defineLayoutContract } from '@deckster/engine/layout';
import { AlignField, chromeField, EyebrowField, TreatmentField } from '@deckster/kit/layout-fields';
import { Effect, Schema } from 'effect';

/**
 * A brand cover that replaces the kit's `title` layout for the e2e fixtures. It accepts every field
 * and slot of the kit's cover, so slides written for the kit still build; it has a tighter subtitle
 * budget and no PowerPoint mapping, which the build reports as a note and a warning.
 */
export default defineLayoutContract({
  name: 'title',
  replaces: true,
  description: 'The fixture brand’s cover: the deck title over a plain band.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    byline: Schema.optionalKey(Schema.NonEmptyString.check(Schema.isMaxLength(40))),
    date: Schema.optionalKey(Schema.NonEmptyString.check(Schema.isMaxLength(24))),
    treatment: TreatmentField,
    picture: Schema.Literals(['side', 'full']).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed<'side' | 'full'>('side')),
    ),
    align: AlignField,
    chrome: chromeField(false),
  }),
  title: { required: true, maxChars: 36 },
  slots: {
    body: { description: 'The subtitle.', accepts: ['text'] },
    media: { description: 'A cover photo.', accepts: ['image'] },
  },
  budget: { body: { maxWords: 12 } },
  example: {
    frontmatter: { title: 'Shade is infrastructure', eyebrow: 'Budget briefing' },
    body: 'A ten-year canopy plan.\n',
  },
});
