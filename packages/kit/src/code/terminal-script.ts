/**
 * The tones a line of output can take: the code theme's foreground (`plain`), comment (`muted`),
 * string (`success`) or number (`warning`) color, or the surface's negative role (`error`).
 */
export const TERMINAL_TONES: readonly string[] = ['plain', 'muted', 'success', 'warning', 'error'];

/**
 * How a line of output is colored; see {@link TERMINAL_TONES}.
 */
export type TerminalTone = 'plain' | 'muted' | 'success' | 'warning' | 'error';

/**
 * One item of a terminal session: a command typed after the prompt, or a line of output.
 */
export type TerminalItem = {
  /**
   * `cmd` for a typed command, `out` for output.
   */
  kind: 'cmd' | 'out';

  /**
   * The text of the line.
   */
  text: string;

  /**
   * The color of an output line.
   */
  tone?: TerminalTone;
};

/**
 * How a line shows at the current step.
 */
export type TerminalLineState = 'hidden' | 'typing' | 'shown';

/**
 * A line ready to draw.
 */
export type TerminalLine = {
  /**
   * The item the line comes from.
   */
  item: TerminalItem;

  /**
   * Whether it is hidden, being typed or complete.
   */
  state: TerminalLineState;

  /**
   * The text to draw: the typed part of a command being typed, otherwise the whole text.
   */
  text: string;
};

/**
 * The time to type a command at the natural speed, per character, in milliseconds.
 */
export const CHARACTER_MS = 32;

/**
 * The longest a command takes to type, in milliseconds: long commands type faster rather than
 * making the room wait.
 */
export const MAX_TYPING_MS = 1100;

/**
 * Works out what each line of a session shows.
 *
 * Commands are numbered in order. Command `n` is typed when the slide reaches its step. Output
 * lines belong to the command before them and appear when that command has been typed in full;
 * output before the first command is always shown.
 *
 * @param items - The session, in order.
 * @param active - The index of the latest command whose step has been reached, -1 for none.
 * @param typed - How many characters of the active command are typed; `undefined` when it is
 *   complete.
 * @returns One line per item, in order.
 */
export function planTerminal(
  items: readonly TerminalItem[],
  active: number,
  typed: number | undefined,
): TerminalLine[] {
  let command = -1;
  return items.map((item): TerminalLine => {
    if (item.kind === 'cmd') {
      command += 1;
      return planCommand(item, command, active, typed);
    }

    const owner = command;
    const finished = owner < active || (owner === active && typed === undefined);
    const shown = owner === -1 || finished;
    return { item, state: shown ? 'shown' : 'hidden', text: item.text };
  });
}

/**
 * The index of the latest command whose step has been reached.
 *
 * @param ats - The step of each command, in order.
 * @param current - The slide's current step value, 0 before any step.
 * @returns The command index; -1 before the first.
 */
export function activeCommand(ats: readonly number[], current: number): number {
  return ats.filter((at) => at <= current).length - 1;
}

/**
 * How long to take to type a command, in milliseconds.
 *
 * @param length - The command's length in characters.
 */
export function typingMs(length: number): number {
  return Math.min(length * CHARACTER_MS, MAX_TYPING_MS);
}

/**
 * The line of one command.
 *
 * @param item - The command.
 * @param command - Its index among commands.
 * @param active - The latest reached command.
 * @param typed - Characters typed of the active command, or `undefined` when complete.
 */
function planCommand(
  item: TerminalItem,
  command: number,
  active: number,
  typed: number | undefined,
): TerminalLine {
  if (command > active) {
    return { item, state: 'hidden', text: item.text };
  }

  if (command === active && typed !== undefined && typed < item.text.length) {
    return { item, state: 'typing', text: item.text.slice(0, Math.max(0, typed)) };
  }

  return { item, state: 'shown', text: item.text };
}
