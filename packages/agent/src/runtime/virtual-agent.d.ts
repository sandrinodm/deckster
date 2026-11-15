/**
 * The dev-only module `deckAgentPlugin` serves: where the agent WebSocket is, the provider and the
 * panel position. It holds no secret; the socket is authenticated by the dev session cookie.
 */
declare module 'virtual:deck/agent' {
  const config: import('#protocol/agent-events.ts').AgentClientConfig;
  export default config;
}
