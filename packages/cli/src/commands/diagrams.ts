import { lazyRun, type Command } from '#command.ts';

/**
 * The text `deck diagrams --help` prints.
 */
const HELP = `Usage: deck diagrams [--json]

Lists the diagram components a slide can use and the parts inside them, with every prop, the node
kinds, the edge options and the animation primitives (packets, journeys, state changes, focus),
each with when to use it and an example, plus the limits deck lint holds diagrams to and how to
write diagrams in TSX.

Options:
  --json        Print { shared, components, nodeKinds, edgeOptions, edgeFlow, animation, states,
                stateSynonyms, packetRoles, svgRoles, limits, longText, tsx, notes }. shared
                describes the props several components take once ({ type, required, default,
                description, values } by name), and longText says once what happens to long node
                titles, subtitles and edge labels. Each component has name (the tag, as in deck
                charts and deck components: "Flow"), role (diagram or part), inside (where a part
                goes), useWhen, example (MDX), shared (the names of the shared props it takes),
                props (its own props, by name), children, limits and, only where it has its own
                rule, longText. A prop name in neither shared nor props, or a value outside its
                values, fails the build naming the closest one.
                Each node kind has kind, aliases, shape, icons (the icon name by icon set, or
                null) and useWhen; edgeOptions and animation are lists of { name, useWhen,
                example }; edgeFlow describes the fields of <Edge flow={{ ... }}>; limits are the
                node, edge, column, row and text-wrap numbers; tsx has the import line, how icons
                and errors work, and an example slide.
  -h, --help    Show this help.`;

/**
 * `deck diagrams`: the diagram catalog, for picking components, node kinds and animation.
 */
export const diagramsCommand: Command = {
  /**
   * The word after `deck` that selects this command.
   */
  name: 'diagrams',

  /**
   * The line `deck --help` shows for this command.
   */
  summary: 'List the diagram components, node kinds and animation primitives',

  /**
   * The text `deck diagrams --help` prints.
   */
  help: HELP,

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('diagrams-run.ts', () => import('#commands/diagrams-run.ts')),
};
