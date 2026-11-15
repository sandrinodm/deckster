import {
  DIAGRAM_CATALOG,
  type DiagramCatalogEntry,
  type DiagramComponentInfo,
} from '@deckster/kit/diagram-catalog';
import { Console, Effect } from 'effect';

import { EXIT_OK, type Command } from '#command.ts';
import { parseCommandArgs } from '#parse-command-args.ts';

/**
 * A catalog name that is a component's tag (`Flow`, `Packet`) rather than an option (`label`),
 * which the plain listing writes in angle brackets.
 */
const TAG_NAME = /^[A-Z][A-Za-z]*$/;

/**
 * Parses the arguments and prints the catalog; succeeds with the process exit code.
 */
export const run: Command['run'] = Effect.fn('deck.diagrams')(function* (argv) {
  const { values } = yield* parseCommandArgs('diagrams', argv, {
    json: { type: 'boolean', default: false },
  });
  yield* Console.log(values.json ? JSON.stringify(DIAGRAM_CATALOG, null, 2) : formatCatalog());
  return EXIT_OK;
});

/**
 * The plain listing: components with their props, node kinds, edge options, animation, limits, TSX
 * and notes.
 */
function formatCatalog(): string {
  const kinds = DIAGRAM_CATALOG.nodeKinds.map((entry) => {
    const aliases = entry.aliases.length === 0 ? '' : ` (also ${entry.aliases.join(', ')})`;
    return `  ${entry.kind}${aliases}: ${entry.useWhen}`;
  });
  const limits = Object.entries(DIAGRAM_CATALOG.limits)
    .map(([name, value]) => `${name} ${value}`)
    .join(', ');
  return [
    'Components',
    ...DIAGRAM_CATALOG.components.map(formatComponent),
    '',
    `Shared props: ${Object.entries(DIAGRAM_CATALOG.shared)
      .map(([name, info]) => `${name} (${info.type})`)
      .join(', ')}`,
    '',
    'Node kinds (kind="...")',
    ...kinds,
    '',
    'Edge options',
    ...DIAGRAM_CATALOG.edgeOptions.map(formatEntry),
    '',
    'Animation',
    ...DIAGRAM_CATALOG.animation.map(formatEntry),
    '',
    `States: ${DIAGRAM_CATALOG.states.join(', ')}`,
    `Packet roles: ${DIAGRAM_CATALOG.packetRoles.join(', ')}`,
    `Svg roles: ${DIAGRAM_CATALOG.svgRoles.join(', ')}`,
    `Limits: ${limits}`,
    `Long text: ${DIAGRAM_CATALOG.longText}`,
    '',
    `TSX: ${DIAGRAM_CATALOG.tsx.import} ${DIAGRAM_CATALOG.tsx.icons}`,
    '',
    ...DIAGRAM_CATALOG.notes.map((note) => `- ${note}`),
  ].join('\n');
}

/**
 * One component of the plain listing: its entry, then its props with their types.
 *
 * @param entry - A component or part.
 */
function formatComponent(entry: DiagramComponentInfo): string {
  const own = Object.entries(entry.props).map(([name, info]) => {
    const required = info.required ? ', required' : '';
    return `${name} (${info.type}${required})`;
  });
  const props = [...own, ...entry.shared].join(', ');
  return `${formatEntry(entry)}\n    Props: ${props === '' ? 'none' : props}`;
}

/**
 * One entry of the plain listing.
 *
 * @param entry - A component, option or primitive.
 */
function formatEntry(entry: DiagramCatalogEntry): string {
  const name = TAG_NAME.test(entry.name) ? `<${entry.name}>` : entry.name;
  const example = entry.example
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n');
  return `  ${name}\n    Use when: ${entry.useWhen}\n    Example:\n${example}`;
}
