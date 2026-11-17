/**
 * Writes the JSON the docs site reads, one file per part, into a folder:
 *
 *     node scripts/docs-data.ts --out <dir>
 *
 * The files are layouts.json, components.json, charts.json, diagrams.json and icons.json (what the
 * matching `deck ... --json` commands print), cli.json (every command's summary and help, as the
 * published npm CLI prints it), brands.json (each published brand's tokens), slides.json (each
 * published deck's slides with their source), brand-schema.json and deck-config.json (the JSON
 * Schemas of `defineBrand` and `defineDeck`) and meta.json (the CLI version, the allowlist and the
 * commit). Only the decks and brands in docs-allowlist.ts are read. The output has no timestamps,
 * so a committed copy diffs cleanly.
 */
import path from 'node:path';
import { parseArgs } from 'node:util';

import { DOCS_BRANDS, DOCS_DECKS } from './docs-allowlist.ts';

/**
 * The command the help texts name. The docs describe the published CLI, whose `deck` binary sets
 * this variable to its own name, so the export does not depend on how the script was started.
 */
process.env.DECKSTER_COMMAND = 'deck';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (values.out === undefined || values.out === '') {
  console.error('Usage: node scripts/docs-data.ts --out <dir>');
  process.exit(1);
}

// Imported after the variable is set: some help texts read it when their module loads.
const { runDocsData } = await import('@deckster/cli/docs-data');
runDocsData({
  root: path.resolve(import.meta.dirname, '..'),
  out: path.resolve(values.out),
  decks: DOCS_DECKS,
  brands: DOCS_BRANDS,
});
