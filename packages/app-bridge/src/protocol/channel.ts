/**
 * The `channel` field every bridge message carries. A message without it, or with another value, is
 * not ours and is ignored.
 */
export const BRIDGE_CHANNEL = 'deck-app-bridge';

/**
 * The protocol version every message carries. A message of another version is ignored, so a deck
 * and an app built against different protocols fail quiet instead of misreading each other.
 */
export const BRIDGE_VERSION = 1;
