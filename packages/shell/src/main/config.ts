import path from 'node:path';

import { isAgentCode } from '#main/agent-code.ts';
import { isLoopbackHttpUrl } from '#protocol/loopback-url.ts';
import { decodeCommand, type ShellPlan } from '#protocol/shell-messages.ts';

/**
 * What the CLI hands the shell in `DECK_SHELL_CONFIG`.
 */
export type ShellConfig = {
  /**
   * The deck's URL, such as `http://127.0.0.1:5173/`. Only this origin stays in the app. Without it
   * the shell starts without a deck and takes it from the `target` of the `open` command.
   */
  url?: string;

  /**
   * The window title and dock name.
   */
  title: string;

  /**
   * The brand's default surface colour, so a window never flashes white while it loads.
   */
  backgroundColor: string;

  /**
   * The file that remembers window bounds and displays; `undefined` remembers nothing.
   */
  stateFile?: string;

  /**
   * The key in the state file for this deck.
   */
  stateKey: string;

  /**
   * Whether the shell exits when its parent goes away. Off under Playwright, which owns the process
   * and gives it no stdin.
   */
  watchParent: boolean;

  /**
   * Report the displays and exit without opening a window (`deck present --list-displays`).
   */
  listOnly: boolean;

  /**
   * A plan to open at start-up without waiting for an `open` command, for drivers that give the
   * shell no standard input (Playwright's Electron launcher).
   */
  plan?: ShellPlan;

  /**
   * The absolute folder that holds the shell's Chromium profile, caches, logs and crash dumps
   * (`<workspace>/.deck/shell/profile`, set by the CLI). Without it, and always under the test
   * options, the shell uses a fresh temporary folder: it never writes to the user's Application
   * Support, Logs or Caches.
   */
  profileDir?: string;

  /**
   * A one-time code (16 to 128 URL-safe characters) the audience window's first load sends as the
   * `X-Deck-Agent-Code` header, so the dev server issues the agent session cookie to the shell.
   * Only with a `url`; a shell started without one gets the code in the `open` target.
   */
  agentCode?: string;
};

/**
 * Options only tests use, read from the environment so no flag exposes them.
 */
export type ShellTestOptions = {
  /**
   * `DECK_SHELL_TEST_HIDDEN=1`: every window stays hidden and nothing goes fullscreen.
   */
  hidden: boolean;

  /**
   * `DECK_SHELL_TEST_CORNER=1`: the audience window is small, shown inactive in a corner of the
   * primary display, and never fullscreen.
   */
  corner: boolean;

  /**
   * `DECK_SHELL_TEST_CAPTURE=<file>`: write a PNG of the audience window to this file once the page
   * has loaded.
   */
  capture?: string;
};

/**
 * Reads the shell's configuration.
 *
 * @param env - The process environment.
 * @throws Error when the configuration is missing or malformed; the shell then exits with code 1.
 */
export function readConfig(env: Readonly<Record<string, string | undefined>>): ShellConfig {
  const raw = env['DECK_SHELL_CONFIG'];
  if (raw === undefined || raw === '') {
    throw new Error('DECK_SHELL_CONFIG is not set. Start the shell with `deck present`.');
  }

  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('DECK_SHELL_CONFIG must be a JSON object.');
  }

  const record = value as Record<string, unknown>;
  const url = record['url'];
  if (url !== undefined && (typeof url !== 'string' || !URL.canParse(url))) {
    throw new Error('DECK_SHELL_CONFIG.url must be a URL.');
  }

  if (url !== undefined && !isLoopbackHttpUrl(url)) {
    throw new Error(
      'DECK_SHELL_CONFIG.url must be an http: or https: URL on a loopback host ' +
        '(127.0.0.1, localhost or [::1]): the shell only presents the local deck server.',
    );
  }

  const plan =
    record['plan'] === undefined
      ? undefined
      : decodeCommand(JSON.stringify({ type: 'open', plan: record['plan'] }));
  if (plan !== undefined && (!plan.ok || plan.message.type !== 'open')) {
    throw new Error('DECK_SHELL_CONFIG.plan is not a valid window plan.');
  }

  const profileDir = record['profileDir'];
  if (
    profileDir !== undefined &&
    (typeof profileDir !== 'string' || !path.isAbsolute(profileDir))
  ) {
    throw new Error('DECK_SHELL_CONFIG.profileDir must be an absolute path.');
  }

  const agentCode = record['agentCode'];
  if (agentCode !== undefined && url === undefined) {
    throw new Error(
      'DECK_SHELL_CONFIG.agentCode needs DECK_SHELL_CONFIG.url: without a url, the agent code ' +
        'goes in the target of the open command.',
    );
  }

  if (agentCode !== undefined && !isAgentCode(agentCode)) {
    throw new Error('DECK_SHELL_CONFIG.agentCode must be 16 to 128 URL-safe characters.');
  }

  return {
    ...(url === undefined ? {} : { url }),
    title: typeof record['title'] === 'string' ? record['title'] : 'Deck',
    backgroundColor:
      typeof record['backgroundColor'] === 'string' ? record['backgroundColor'] : '#000000',
    ...(typeof record['stateFile'] === 'string' ? { stateFile: record['stateFile'] } : {}),
    stateKey: typeof record['stateKey'] === 'string' ? record['stateKey'] : 'deck',
    watchParent: record['watchParent'] !== false,
    listOnly: record['listOnly'] === true,
    ...startupOptions({
      plan: plan?.ok === true && plan.message.type === 'open' ? plan.message.plan : undefined,
      profileDir,
      agentCode,
    }),
  };
}

/**
 * Includes optional startup properties in protocol order only when they were provided.
 */
function startupOptions(options: {
  plan: ShellPlan | undefined;
  profileDir: string | undefined;
  agentCode: string | undefined;
}): Pick<ShellConfig, 'plan' | 'profileDir' | 'agentCode'> {
  const output: Pick<ShellConfig, 'plan' | 'profileDir' | 'agentCode'> = {};
  if (options.plan !== undefined) {
    output.plan = options.plan;
  }

  if (options.profileDir !== undefined) {
    output.profileDir = options.profileDir;
  }

  if (options.agentCode !== undefined) {
    output.agentCode = options.agentCode;
  }

  return output;
}

/**
 * Reads the test options.
 *
 * @param env - The process environment.
 */
export function readTestOptions(
  env: Readonly<Record<string, string | undefined>>,
): ShellTestOptions {
  const capture = env['DECK_SHELL_TEST_CAPTURE'];
  return {
    hidden: env['DECK_SHELL_TEST_HIDDEN'] === '1',
    corner: env['DECK_SHELL_TEST_CORNER'] === '1',
    ...(capture === undefined || capture === '' ? {} : { capture }),
  };
}
