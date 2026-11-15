export {
  CONNECTING_STATE,
  reduceDeckMessage,
  STANDALONE_STATE,
  type DeckAppState,
} from '#client/app-state.ts';
export { connectDeck, type ConnectOptions, type DeckConnection } from '#client/connect-deck.ts';
export type { BridgeBrand, BridgeTypeStep, ColorScheme } from '#protocol/bridge-brand.ts';
