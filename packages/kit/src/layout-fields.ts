/**
 * The frontmatter fields and hints a layout's contract is made from, for the kit's own layouts and
 * for code layouts in a brand or a deck: `import { EyebrowField, chromeField } from
 * '@deckster/kit/layout-fields'`. Inside the kit the same module is `#layout-fields.ts`.
 *
 * Contracts are loaded in plain Node, so this module and everything it imports stays free of React,
 * stylesheets and `.tsx` files. A test holds it to that. The parts a layout draws with are in
 * `@deckster/kit/layout-parts`. Removing or renaming a name is a breaking change.
 */
export {
  CHROME_HINT,
  chromeField,
  CONTEXT_MAX_WORDS,
  ContactItem,
  contactsHint,
  currentProblems,
  DATA_HINT,
  DataField,
  EYEBROW_HINT,
  EyebrowField,
  FOCAL_HINT,
  FocalField,
  IconNameField,
  REVEAL_HINT,
  RevealField,
  textField,
  TREATMENT_HINT,
  TreatmentField,
  treatmentProps,
  type ContactEntry,
} from '#layouts/layout-fields.ts';
export { AlignField, alignHint } from '#layouts/display-fields.ts';
