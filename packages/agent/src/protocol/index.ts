/**
 * The Node-side protocol of `@deckster/agent`: where the endpoints are, the event and message
 * schemas, and their plain types. Browser code imports `@deckster/agent/protocol/events` instead,
 * which has the types and constants without Effect or Node modules.
 */
export * from '#protocol/mcp-endpoint.ts';
export * from '#protocol/agent-events.ts';
export {
  AgentErrorKind,
  AgentEvent as AgentEventSchema,
  AgentPanelPosition as AgentPanelPositionSchema,
  AgentProblem as AgentProblemSchema,
  ClientMessage as ClientMessageSchema,
  decodeAgentEvent,
  decodeClientMessage,
  MAX_PROMPT_CHARS,
  ProviderId as ProviderIdSchema,
} from '#protocol/events.ts';
