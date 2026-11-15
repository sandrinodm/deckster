import { componentCatalog, type ComponentInfo } from '@deckster/kit/component-catalog';
import { Console, Effect } from 'effect';

import { EXIT_OK, type Command } from '#command.ts';
import { parseCommandArgs } from '#parse-command-args.ts';

/**
 * Parses the arguments and prints the catalog; succeeds with the process exit code.
 */
export const run: Command['run'] = Effect.fn('deck.components')(function* (argv) {
  const { values } = yield* parseCommandArgs('components', argv, {
    json: { type: 'boolean', default: false },
  });
  const catalog = componentCatalog();
  yield* Console.log(
    values.json
      ? JSON.stringify(catalog, null, 2)
      : catalog.components.map(formatComponent).join('\n\n'),
  );
  return EXIT_OK;
});

/**
 * The plain listing of one component: its tag, kind, when to use it, its props and an example.
 *
 * @param component - The component.
 */
function formatComponent(component: ComponentInfo): string {
  const props = Object.entries(component.props).map(
    ([name, spec]) => `${name}${spec.required ? '' : '?'}: ${spec.type}`,
  );
  return [
    `<${component.name}>  ${component.kind}`,
    `  Use when: ${component.useWhen}`,
    `  Avoid: ${component.avoid}`,
    `  Props: ${props.join(', ')}`,
    // Later lines of the example line up under its first line, past the `  Example: ` label.
    `  Example: ${component.example.replaceAll('\n', '\n           ')}`,
  ].join('\n');
}
