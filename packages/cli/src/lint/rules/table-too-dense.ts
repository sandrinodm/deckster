import type { SlideRule } from '#lint/types.ts';

/**
 * The attribute the kit's table layout sets on a table: `natural`, `grown`, `stepped`, or
 * `overflow` when the table does not fit its region even at the smallest type the brand allows.
 */
const FIT_ATTRIBUTE = 'kit-table-fit';

/**
 * A table that does not fit its slide at the smallest type the brand allows. The table layout steps
 * a large table down in size but never below the brand's minimum, so the only fix is less table:
 * the rule says so, where the overflow rules would only say it spills.
 */
export const tableTooDenseRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'table-too-dense',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * The table is the same on every step; check it once.
   */
  scope: 'slide',

  /**
   * A table that spills off its slide breaks it.
   */
  severity: 'error',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description:
    'A table does not fit its slide even at the smallest type the brand allows, so it must lose ' +
    'rows or columns.',

  /**
   * Reports each table the layout marked as not fitting.
   */
  check: ({ snapshot, slide }) =>
    snapshot.elements
      .filter((element) => element.data[FIT_ATTRIBUTE] === 'overflow')
      .map((element) => ({
        message:
          'The table needs more room than the slide has, even set at the smallest type the ' +
          'brand allows; it would have to shrink below that to fit.',
        fix:
          `Cut the table in ${slide.file}: keep the rows and columns ` +
          "the title's point rests on, merge or drop the rest, shorten long cells, " +
          'or split it over two slides and put the ' +
          'full table in an appendix or handout. Do not make the type smaller.',
        selector: element.selector,
      })),
};
