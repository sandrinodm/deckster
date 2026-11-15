import { Schema } from 'effect';

/**
 * A failure of the agent tooling: the deck MCP server, and later the agent host. The message says
 * what went wrong and what to do next, so the CLI and the MCP server hand it on as it is.
 */
export class AgentError extends Schema.TaggedError<AgentError>()('AgentError', {
  /**
   * What went wrong and what to run or edit next.
   */
  message: Schema.String,
}) {}

/**
 * Builds an {@link AgentError} from what went wrong and how to fix it.
 *
 * @param problem - What went wrong.
 * @param fix - What to do next; leave it out when the problem already says.
 */
export function agentError(problem: string, fix?: string): AgentError {
  return new AgentError({ message: fix === undefined ? problem : `${problem}\n${fix}` });
}
