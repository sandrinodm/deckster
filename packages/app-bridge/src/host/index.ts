export {
  createHostMessenger,
  type HostMessenger,
  type HostMessengerOptions,
} from '#host/host-messenger.ts';
export { acceptAppMessage, type IncomingMessage, type Sender } from '#protocol/message-guard.ts';
export {
  isAppMessage,
  MAX_REQUESTED_STEPS,
  type AppMessage,
  type DeckMessage,
  type DeckPayload,
} from '#protocol/messages.ts';
