import type { ShellDisplay, ShellPlan } from '@deckster/shell/protocol';

import { Effect } from 'effect';

import { usageError, type CliError } from '#cli-error.ts';

/**
 * The flags of `deck present` that decide where windows go.
 */
export type PlanFlags = {
  /**
   * `--fullscreen`: the audience window goes fullscreen.
   */
  fullscreen: boolean;

  /**
   * `--kiosk`: fullscreen, no menu, and Cmd/Ctrl+Q twice to quit.
   */
  kiosk: boolean;

  /**
   * `--display <n>`: the index of the display for the audience window; `undefined` picks one.
   */
  display: number | undefined;

  /**
   * `--presenter`: open the presenter window too.
   */
  presenter: boolean;

  /**
   * `--presenter <n>`: the index of the display for the presenter window; `undefined` picks one.
   */
  presenterDisplay: number | undefined;
};

/**
 * Where the windows go, with what the CLI tells the author about the choice.
 */
export type WindowPlan = {
  /**
   * What the shell is told to open.
   */
  plan: ShellPlan;

  /**
   * The index of the audience display in the list `--list-displays` prints.
   */
  audienceIndex: number;

  /**
   * The index of the presenter display; `undefined` when there is no presenter window.
   */
  presenterIndex: number | undefined;

  /**
   * Sentences about choices the plan made that the author did not ask for, such as fullscreen being
   * dropped when both windows share a display.
   */
  notes: readonly string[];
};

/**
 * Turns the flags and the connected displays into a plan.
 *
 * - The audience window goes to `--display`, else the primary display; with a presenter window and
 *   more than one display it goes to the first display that is not the presenter's.
 * - The presenter window goes to `--presenter <n>`, else the primary display when the audience is
 *   elsewhere, else the first other display. With one display both windows share it and the
 *   audience window is not fullscreen, because it would cover the presenter window.
 * - `--kiosk` implies fullscreen.
 *
 * @param flags - The command's placement flags.
 * @param displays - The connected displays, in the order `--list-displays` prints them.
 * @throws CliError in the error channel when no display is connected or a display index does not
 *   exist; the message lists the displays.
 */
export const planWindows = Effect.fn('planWindows')(function* (
  flags: PlanFlags,
  displays: readonly ShellDisplay[],
): Effect.fn.Return<WindowPlan, CliError> {
  if (displays.length === 0) {
    return yield* usageError(
      'No display is connected, so there is nowhere to open a window.',
      'present',
    );
  }

  for (const [flag, index] of [
    ['--display', flags.display],
    ['--presenter', flags.presenterDisplay],
  ] as const) {
    if (index !== undefined && displays[index] === undefined) {
      return yield* usageError(
        `${flag} ${index} does not exist. Connected displays: ${describeDisplays(displays)}.`,
        'present',
      );
    }
  }

  const primary = Math.max(
    0,
    displays.findIndex((display) => display.primary),
  );
  const notes: string[] = [];
  const wantsPresenter = flags.presenter || flags.presenterDisplay !== undefined;
  /**
   * The index of the first display other than the given one, or -1 when there is none.
   */
  const firstOtherThan = (index: number): number => displays.findIndex((_, i) => i !== index);
  let audienceIndex = flags.display ?? primary;
  let presenterIndex: number | undefined;
  if (wantsPresenter) {
    if (flags.presenterDisplay !== undefined) {
      presenterIndex = flags.presenterDisplay;
      if (flags.display === undefined && presenterIndex === primary && displays.length > 1) {
        audienceIndex = firstOtherThan(primary);
      }
    } else if (flags.display === undefined && displays.length > 1) {
      presenterIndex = primary;
      audienceIndex = firstOtherThan(primary);
    } else {
      presenterIndex = displays.length > 1 ? firstOtherThan(audienceIndex) : audienceIndex;
    }
  }

  const sharesDisplay = presenterIndex === audienceIndex;
  if (wantsPresenter && displays.length === 1) {
    notes.push(
      'Only one display is connected: the presenter window opens beside the audience window.',
    );
  } else if (sharesDisplay) {
    notes.push('Both windows are on the same display.');
  }

  let fullscreen = flags.fullscreen || flags.kiosk;
  if (fullscreen && sharesDisplay) {
    fullscreen = false;
    notes.push('The audience window stays windowed: fullscreen would cover the presenter window.');
  }

  const audience = displays[audienceIndex];
  const presenter = presenterIndex === undefined ? undefined : displays[presenterIndex];
  if (audience === undefined) {
    return yield* usageError('The audience display could not be chosen.', 'present');
  }

  return {
    plan: {
      audience: { displayId: audience.id, fullscreen },
      ...(presenter === undefined ? {} : { presenter: { displayId: presenter.id } }),
      kiosk: flags.kiosk,
    },
    audienceIndex,
    presenterIndex,
    notes,
  };
});

/**
 * One line per display, as `deck present --list-displays` prints it.
 *
 * @param displays - The connected displays.
 */
export function describeDisplays(displays: readonly ShellDisplay[]): string {
  return displays
    .map((display, index) => {
      const name = display.label === '' ? 'display' : display.label;
      const size = `${display.bounds.width}x${display.bounds.height}`;
      const marker = display.primary ? ' (primary)' : '';
      return `${index}: ${name} ${size} @${display.scaleFactor}x${marker}`;
    })
    .join('; ');
}
