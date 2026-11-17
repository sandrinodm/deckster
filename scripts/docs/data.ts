/**
 * Writes the JSON the docs site reads, one file per part, into a folder:
 *
 *     node scripts/docs/data.ts --out <dir>
 *
 * The files are layouts.json, components.json, charts.json, diagrams.json and icons.json (what the
 * matching `deck ... --json` commands print), cli.json (every command's summary and help, as the
 * published npm CLI prints it: the script packs the CLI into packages/cli/dist and asks that copy),
 * brands.json (each published brand's tokens), slides.json (each published deck's slides with their
 * source), brand-schema.json and deck-config.json (the JSON Schemas of `defineBrand` and
 * `defineDeck`) and meta.json (the CLI version, the allowlist and the commit). Only the decks and
 * brands in allowlist.ts are read. The output has no timestamps, so a committed copy diffs
 * cleanly.
 */
import { DOCS_BRANDS, DOCS_DECKS } from '#allowlist.ts';

/**
 * The command the help texts name. The docs describe the published CLI, whose `deck` binary sets
 * this variable to its own name, so the export does not depend on how the script was started. The
 * `deck`s the export starts inherit it.
 */
process.env.DECKSTER_COMMAND = 'deck';

/**
 * The workspace, its `deck` and the `--out` reader, imported after the variable is set: some
 * catalog texts read it when their module loads.
 */
const { DECK_BIN, readOutDir, WORKSPACE_ROOT } = await import('#script-support.ts');

/**
 * The export's main program, imported after the variable is set for the same reason.
 */
const { runDocsData } = await import('#data/collect-data.ts');

/**
 * The output folder, absolute, refused when it is the workspace or inside its sources.
 */
const out = readOutDir('data.ts');
runDocsData({
  root: WORKSPACE_ROOT,
  out,
  decks: DOCS_DECKS,
  brands: DOCS_BRANDS,
  deck: { executable: DECK_BIN, prefix: [] },
});
