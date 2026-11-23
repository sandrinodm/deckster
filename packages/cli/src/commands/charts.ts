import { lazyRun, type Command } from '#command.ts';

/**
 * The text `deckster charts --help` prints.
 */
const HELP = `Usage: deckster charts [--json]

Lists the chart and number components a slide can use, each with the messages it is the right
form for. Start from the message (what you are saying), then pick the form.

Options:
  --json        Print { shared, types, charts, messages, insight, spec }. shared describes
                the props several charts take once ({ type, required, default, description }
                by name). Each chart has name, kind, useWhen, messages (from: single number,
                comparison, ranking, trend, change between two points, part-to-whole,
                distribution, correlation, flow, exact values), avoid, data (the shape of its
                rows), nulls (how it draws a missing value), shared (the names of the shared
                props it takes), props (its own props, by name), limits (the numbers deckster lint
                holds it to), example (MDX), accessibility and native (the PowerPoint chart
                PPTX export builds, or null). A prop name in neither shared nor props throws.
                types lists the fields of RowStat, ProgressItem, TableColumn, SeriesInput,
                FormatOptions, Highlight and each Annotation. messages lists the components
                for each message, in catalog order (not ranked: read each one's useWhen
                and avoid to choose); insight explains the props, highlight,
                annotations, labels, axis honesty, steps, data, nulls, format, relative and
                limits; spec names the attribute and module of each figure's serialisable
                description.
  -h, --help    Show this help.`;

/**
 * `deckster charts`: the chart catalog, for picking a form from a message.
 */
export const chartsCommand: Command = {
  /**
   * The word after `deckster` that selects this command.
   */
  name: 'charts',

  /**
   * The line `deckster --help` shows for this command.
   */
  summary: 'List the chart and number components and when to use each',

  /**
   * The text `deckster charts --help` prints.
   */
  help: HELP,

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('charts-run.ts', () => import('#commands/charts-run.ts')),
};
