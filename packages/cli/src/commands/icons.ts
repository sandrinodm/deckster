import { lazyRun, type Command } from '#command.ts';

/**
 * The most names the plain listing prints.
 */
export const PLAIN_LIMIT = 120;

/**
 * The text `deck icons --help` prints.
 */
const HELP = `Usage: deck icons [--brand <a,b>] [--search <text>] [--json]

Lists the icon names a deck can use in every brand it renders in. Each brand draws icons from one
Iconify set (its \`icons.set\`); a name works in all of those brands only when every set has it.
Use these names in <Icon name="...">, in a layout's \`icon\` field and for a diagram node's \`icon\`.

Options:
  --brand <a,b>    The brands to share names between, comma-separated brand folder names.
                   Default: every brand in brands/.
  --search <text>  Only names that contain the text, such as \`--search arrow\`.
  --json           Print { brands: [{ name, set }], count, icons: [...] }: every shared name
                   (narrowed by --search), where count is how many there are.
  -h, --help       Show this help.

Plain output prints the count and the first ${PLAIN_LIMIT} names; narrow it with --search or
print them all with --json.`;

/**
 * `deck icons`: the icon names every brand's set has.
 */
export const iconsCommand: Command = {
  /**
   * The word after `deck` that selects this command.
   */
  name: 'icons',

  /**
   * The line `deck --help` shows for this command.
   */
  summary: 'List the icon names every brand has',

  /**
   * The text `deck icons --help` prints.
   */
  help: HELP,

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('icons-run.ts', () => import('#commands/icons-run.ts')),
};
