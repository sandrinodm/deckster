import { chartCatalog, type ChartInfo } from '@deckster/kit/chart-catalog';
import { Console, Effect } from 'effect';

import { EXIT_OK, type Command } from '#command.ts';
import { parseCommandArgs } from '#parse-command-args.ts';

/**
 * Parses the arguments and prints the catalog; succeeds with the process exit code.
 */
export const run: Command['run'] = Effect.fn('deck.charts')(function* (argv) {
  const { values } = yield* parseCommandArgs('charts', argv, {
    json: { type: 'boolean', default: false },
  });
  const catalog = chartCatalog();
  yield* Console.log(
    values.json ? JSON.stringify(catalog, null, 2) : catalog.charts.map(formatChart).join('\n\n'),
  );
  return EXIT_OK;
});

/**
 * The plain listing of one component: its tag, when to use it, its messages and an example.
 *
 * @param chart - The component.
 */
function formatChart(chart: ChartInfo): string {
  return [
    `<${chart.name}>  ${chart.messages.join(', ')}`,
    `  Use when: ${chart.useWhen}`,
    `  Avoid: ${chart.avoid}`,
    `  Data: ${chart.data}`,
    `  Missing values: ${chart.nulls}`,
    `  Example: ${chart.example}`,
  ].join('\n');
}
