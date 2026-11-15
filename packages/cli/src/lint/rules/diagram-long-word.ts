import type { SlideRule } from '#lint/types.ts';

import { diagramName, diagramsOn } from '#lint/rules/diagram-elements.ts';

/**
 * Text a diagram had to break inside a word or cut short (the kit lists it in
 * `data-diagram-long-text`): a node title or subtitle with a word wider than the widest node, an
 * edge label broken inside an identifier or truncated.
 */
export const diagramLongWordRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'diagram-long-word',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is shown changes with the step.
   */
  scope: 'step',

  /**
   * The text is drawn, broken or shortened; a warning.
   */
  severity: 'warning',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description:
    'A diagram breaks a word inside a node title or edge label, or cuts a label short, ' +
    'because it is too long to fit.',

  /**
   * Reports each diagram with text it had to break or cut, naming the text.
   */
  check: ({ snapshot, slide }) =>
    diagramsOn(snapshot).flatMap((diagram) => {
      const long = diagram.root.data['diagram-long-text'];
      if (long === undefined || long === '') {
        return [];
      }

      return [
        {
          message:
            `${diagramName(diagram)} has to break or cut ${long}: ` +
            'a word is wider than the room it has.',
          fix:
            `Use a shorter name (an abbreviation, or a space between its parts, such as ` +
            `"Order cancelled" for "OrderCancelled"), move the detail ` +
            'into a subtitle or the notes, ' +
            `or use fewer columns so nodes and gutters are wider, in ${slide.file}.`,
          selector: diagram.root.selector,
          key: diagram.root.selector,
        },
      ];
    }),
};
