export { BridgeBrand, BridgeTypeStep, ColorScheme } from '#protocol/bridge-brand.ts';
export { BRIDGE_CHANNEL, BRIDGE_VERSION } from '#protocol/channel.ts';
export {
  acceptAppMessage,
  acceptDeckMessage,
  type IncomingMessage,
  type Sender,
} from '#protocol/message-guard.ts';
export {
  AppMessage,
  type AppPayload,
  DeckMessage,
  type DeckPayload,
  envelope,
  isAppMessage,
  isDeckMessage,
  MAX_REQUESTED_STEPS,
  type Payload,
} from '#protocol/messages.ts';
