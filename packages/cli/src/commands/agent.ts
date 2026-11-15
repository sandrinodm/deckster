import { lazyRun, type Command } from '#command.ts';

/**
 * `deck agent doctor`: the state of the agent CLIs.
 */
export const agentCommand: Command = {
  /**
   * The word after `deck` that selects this command.
   */
  name: 'agent',

  /**
   * The line `deck --help` shows for this command.
   */
  summary: 'Check the agent CLIs (Claude Code, Codex): installed, version, signed in',

  /**
   * The text `deck agent --help` prints.
   */
  help: () => import('#commands/agent-help.ts').then((module) => module.HELP),

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('agent-run.ts', () => import('#commands/agent-run.ts')),
};
