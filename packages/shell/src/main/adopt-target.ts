import type { WindowTarget } from '#main/windows.ts';
import type { ShellTarget } from '#protocol/shell-messages.ts';

import { freshPartition } from '#main/deck-session.ts';
import { appTitle } from '#main/window-title.ts';

/**
 * What adopting a deck needs from the shell, so the order of the steps can be tested.
 *
 * @template Session - The session type the shell uses.
 */
export type AdoptDeps<Session> = {
  /**
   * The session of a partition.
   *
   * @param partition - The partition name.
   */
  sessionFor: (partition: string) => Session;

  /**
   * Installs the permission, download, agent-code and frame hooks that keep the deck in the app.
   *
   * @param session - The deck's session.
   * @param origin - The deck server's origin.
   */
  installHooks: (session: Session, origin: string) => void;

  /**
   * Sets the application name.
   *
   * @param name - The name.
   */
  setName: (name: string) => void;

  /**
   * Settles when the default session is clear.
   */
  defaultCleared: () => Promise<void>;

  /**
   * Puts the shell's icon in the dock (macOS, outside the test modes).
   */
  activateDock: () => Promise<void>;

  /**
   * Gives the window manager its target and fixes the trusted origin; the last step.
   *
   * @param target - The window manager's target.
   */
  setTarget: (target: WindowTarget) => void;
};

/**
 * Fixes the deck the shell shows, in this order: the application name; a fresh in-memory session
 * partition (nothing a deck stores outlives the run, so it needs no clearing) with its hooks; the
 * default session's clearing; the dock; and last the window manager's target. Anything that throws
 * leaves no target set, so no window can open on a half-adopted deck.
 *
 * @param target - The deck, from the configuration or an `open` command.
 * @param deps - What adopting needs.
 */
export async function adoptTarget<Session>(
  target: ShellTarget,
  deps: AdoptDeps<Session>,
  stateKey?: string,
): Promise<void> {
  const origin = new URL(target.url).origin;
  deps.setName(appTitle(target.title));
  const partition = freshPartition();
  deps.installHooks(deps.sessionFor(partition), origin);

  await deps.defaultCleared();
  await deps.activateDock();
  deps.setTarget({
    url: target.url,
    title: target.title,
    backgroundColor: target.backgroundColor,
    partition,
    ...(stateKey === undefined ? {} : { stateKey }),
    ...(target.agentCode === undefined ? {} : { agentCode: target.agentCode }),
  });
}
