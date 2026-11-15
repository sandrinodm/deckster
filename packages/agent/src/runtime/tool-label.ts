import type { ToolStatus } from '#protocol/agent-events.ts';

/**
 * The icon a tool line shows.
 */
export type ToolIcon = 'read' | 'edit' | 'search' | 'lint' | 'screenshot' | 'shell' | 'tool';

/**
 * What the transcript shows for a tool call.
 */
export type ToolLine = {
  /**
   * The icon.
   */
  readonly icon: ToolIcon;

  /**
   * The verb phrase, such as `Edited`.
   */
  readonly verb: string;

  /**
   * What it worked on, such as `slides/intro.mdx`, or an empty string.
   */
  readonly object: string;

  /**
   * The whole command a shell line ran, when `object` had to cut it short; absent otherwise.
   */
  readonly full?: string;
};

/**
 * The tool call to describe: its name, the core's title, status and path.
 */
type ToolCall = {
  /**
   * The tool, such as `Read`, `Edit`, `shell`, `apply_patch` or `deck_lint`.
   */
  readonly name: string;

  /**
   * The core's title, such as `Edit decks/hello/slides/title.mdx` or a shell command.
   */
  readonly title: string;

  /**
   * Where the call is.
   */
  readonly status: ToolStatus;

  /**
   * The file it works on, relative to the workspace root, or null.
   */
  readonly path: string | null;
};

/**
 * Shell commands that only read files (`sed` only as `sed -n '<lines>p' <files>`, see
 * {@link SED_PRINT_SCRIPT}).
 */
const READ_COMMANDS = new Set(['cat', 'sed', 'head', 'tail', 'nl', 'wc']);

/**
 * Shell commands that search.
 */
const SEARCH_COMMANDS = new Set(['rg', 'grep', 'ls', 'find', 'fd', 'tree', 'pwd']);

/**
 * Anything that makes a command line more than one simple command, or sends output to a file: `;`,
 * `&` (`&&` and background), `|` (`||` and pipes), redirects, backticks, `$(` and line breaks.
 */
const COMPOUND_SYNTAX = /[;&|<>`\n\r]|\$\(/;

/**
 * Options that make a read or search program write files or run other programs, per program: `find
 * -delete`, `-exec`, `-execdir`, `-ok`, `-okdir`, `-fprint…`, `-fls`; `fd -x`, `-X`, `--exec…`; `rg
 * --pre…`; `tree -o`.
 */
const WRITING_OPTIONS: Readonly<Record<string, RegExp>> = {
  /**
   * `find` actions that delete, write or run.
   */
  find: /^-(?:delete|exec(?:dir)?|ok(?:dir)?|fprint\w*|fls)$/,

  /**
   * `fd` options that run a command per result.
   */
  fd: /^(?:-x|-X|--exec(?:-batch)?(?:=.*)?)$/,

  /**
   * `rg` options that run a preprocessor.
   */
  rg: /^--pre(?:-glob)?(?:=.*)?$/,

  /**
   * `tree` writing its listing to a file.
   */
  tree: /^-o/,
};

/**
 * The only `sed` script counted as reading: print a line or a range, as in `sed -n '1,200p'`.
 */
const SED_PRINT_SCRIPT = /^['"]?\d+(?:,\d+)?p['"]?$/;

/**
 * The longest object shown, in characters.
 */
const MAX_OBJECT_CHARS = 72;

/**
 * The prefix the deck's own MCP tools carry, which a line leaves out.
 */
const DECK_TOOL_PREFIX = /^mcp__deck__/;

/**
 * The name a Glob or Grep title starts with, before the pattern.
 */
const SEARCH_TOOL_NAME = /^(Glob|Grep)\s+/;

/**
 * The name, then a space, then the rest of a core title.
 */
const TITLE_REST = /^\S+\s+(.*)$/;

/**
 * A run of whitespace between the words of a command.
 */
const WORD_SEPARATOR = /\s+/;

/**
 * A character that makes a shell word look like a path: a dot or a slash.
 */
const PATH_CHARACTER = /[./]/;

/**
 * A quote at either end of a shell word.
 */
const QUOTE_AT_EDGE = /^['"]|['"]$/g;

/**
 * Describes a tool call as a short line in the past tense once done ("Read slides/intro.mdx",
 * "Edited slides/intro.mdx", "Checked lint", "Took a screenshot"), in the present while it runs,
 * and plainly when it failed or was refused. Paths inside the deck are shown relative to it.
 *
 * @param call - The tool call.
 * @param deck - The deck folder name, to shorten paths.
 */
export function describeTool(call: ToolCall, deck: string): ToolLine {
  const name = call.name.replace(DECK_TOOL_PREFIX, '');
  const target = shortPath(call.path ?? pathInTitle(call.title), deck);
  const running = call.status === 'running';
  switch (name) {
    case 'Read':
    case 'view_image':
      return line('read', running ? 'Reading' : 'Read', target, call.status, 'read');
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'apply_patch':
      return line('edit', running ? 'Editing' : 'Edited', target, call.status, 'edit');
    case 'Glob':
    case 'Grep':
      return line(
        'search',
        running ? 'Searching' : 'Searched',
        clipObject(call.title.replace(SEARCH_TOOL_NAME, '')),
        call.status,
        'search',
      );
    case 'deck_lint':
      return line('lint', running ? 'Checking lint' : 'Checked lint', '', call.status, 'run lint');
    case 'deck_screenshot':
      return line(
        'screenshot',
        running ? 'Taking a screenshot' : 'Took a screenshot',
        '',
        call.status,
        'take a screenshot',
      );
    case 'deck_outline':
    case 'current_slide':
    case 'catalog':
      return line(
        'read',
        running ? 'Looking at the deck' : 'Looked at the deck',
        '',
        call.status,
        'read the deck',
      );
    case 'comments':
      return line(
        'read',
        running ? 'Reading comments' : 'Read comments',
        '',
        call.status,
        'read comments',
      );
    case 'shell':
    case 'Bash':
      return shellLine(call.title, call.status, deck);
    default:
      return line('tool', running ? 'Using' : 'Used', clipObject(name), call.status, `use ${name}`);
  }
}

/**
 * A line, reworded for a call that failed or was refused.
 *
 * @param icon - The icon.
 * @param verb - The verb for a running or finished call.
 * @param object - What it worked on.
 * @param status - Where the call is.
 * @param action - The bare action, such as `edit`, for the failure wording.
 */
function line(
  icon: ToolIcon,
  verb: string,
  object: string,
  status: ToolStatus,
  action: string,
): ToolLine {
  if (status === 'denied') {
    return { icon, verb: `Not allowed to ${action}`, object };
  }

  if (status === 'failed') {
    return { icon, verb: `Could not ${action}`, object };
  }

  return { icon, verb, object };
}

/**
 * A shell command as a line: reading files, searching, or running a command.
 *
 * @param command - The command line.
 * @param status - Where the call is.
 * @param deck - The deck folder name.
 */
function shellLine(command: string, status: ToolStatus, deck: string): ToolLine {
  const words = command.trim().split(WORD_SEPARATOR);
  const program = words[0] ?? '';
  const running = status === 'running';
  const simple = isSimpleCommand(words, command);
  if (simple && READ_COMMANDS.has(program)) {
    const operands = program === 'sed' ? words.slice(3) : words.slice(1);
    const files = operands.filter((word) => !word.startsWith('-') && PATH_CHARACTER.test(word));
    const object = files
      .map((file) => shortPath(file.replaceAll(QUOTE_AT_EDGE, ''), deck))
      .join(', ');
    return line('read', running ? 'Reading' : 'Read', clipObject(object), status, 'read');
  }

  if (simple && SEARCH_COMMANDS.has(program)) {
    return line('search', running ? 'Searching' : 'Searched', 'files', status, 'search');
  }

  const object = clipObject(command);
  const ran = line('shell', running ? 'Running' : 'Ran', object, status, 'run');
  return object === command ? ran : { ...ran, full: command };
}

/**
 * Whether a command line is one simple command that cannot write or run anything else, so it may be
 * labelled by its program: no {@link COMPOUND_SYNTAX}, none of the program's
 * {@link WRITING_OPTIONS}, and `sed` only as a line printer. Anything else is labelled "Ran" with
 * its text, whatever its first word.
 *
 * @param words - The command split on whitespace.
 * @param command - The whole command line.
 */
function isSimpleCommand(words: readonly string[], command: string): boolean {
  const program = words[0] ?? '';
  const writing = Object.hasOwn(WRITING_OPTIONS, program) ? WRITING_OPTIONS[program] : undefined;
  if (
    COMPOUND_SYNTAX.test(command) ||
    (writing !== undefined && words.some((word) => writing.test(word)))
  ) {
    return false;
  }

  if (program === 'sed') {
    return words[1] === '-n' && SED_PRINT_SCRIPT.test(words[2] ?? '') && words.length > 3;
  }

  return true;
}

/**
 * The path in a core title such as `Edit decks/hello/slides/title.mdx`, or an empty string.
 *
 * @param title - The title.
 */
function pathInTitle(title: string): string {
  const [, rest = ''] = TITLE_REST.exec(title) ?? [];
  return rest.includes('/') || rest.includes('.') ? rest : '';
}

/**
 * A workspace path relative to the deck folder when it is inside it.
 *
 * @param file - The path.
 * @param deck - The deck folder name.
 */
export function shortPath(file: string, deck: string): string {
  const prefix = `decks/${deck}/`;
  const index = file.indexOf(prefix);
  return clipObject(index === -1 ? file : file.slice(index + prefix.length));
}

/**
 * Text cut to {@link MAX_OBJECT_CHARS}.
 *
 * @param text - The text.
 */
function clipObject(text: string): string {
  return text.length > MAX_OBJECT_CHARS ? `${text.slice(0, MAX_OBJECT_CHARS - 1)}…` : text;
}

/**
 * Tool calls summed up in one line for a finished turn, such as `Edited slides/title.mdx · read 3
 * files · 1 search · checked lint`: edits come first and are named, the rest counted.
 *
 * @param calls - The turn's tool calls, in order.
 * @param deck - The deck folder name, to shorten paths.
 */
export function summarizeTools(calls: readonly ToolCall[], deck: string): string {
  const lines = calls.map((call) => describeTool(call, deck));
  /**
   * How many calls have an icon.
   *
   * @param icon - The icon.
   */
  const count = (icon: ToolIcon) => lines.filter((line) => line.icon === icon).length;
  const edited = [
    ...new Set(lines.filter((line) => line.icon === 'edit').map((line) => line.object)),
  ].filter((object) => object !== '');
  const parts = [
    edited.length > 0 ? `edited ${edited.join(', ')}` : '',
    count('read') > 0 ? plural(count('read'), 'read', 'file', 'files') : '',
    count('search') > 0 ? plural(count('search'), '', 'search', 'searches') : '',
    count('lint') > 0 ? 'checked lint' : '',
    count('screenshot') > 0 ? 'took a screenshot' : '',
    count('shell') > 0 ? plural(count('shell'), 'ran', 'command', 'commands') : '',
    count('tool') > 0 ? plural(count('tool'), 'used', 'tool', 'tools') : '',
  ].filter((part) => part !== '');
  const text = parts.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A verb with a counted noun, such as `read 3 files`.
 *
 * @param count - How many.
 * @param verb - The verb.
 * @param one - The noun for one.
 * @param many - The noun for more.
 */
function plural(count: number, verb: string, one: string, many: string): string {
  return `${verb} ${count} ${count === 1 ? one : many}`.trim();
}
