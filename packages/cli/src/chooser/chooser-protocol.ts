/**
 * Asks the operator to confirm stopping the agent before changing decks.
 */
export const HTTP_CONFLICT = 409;

/**
 * Reports a selected deck that could not be served.
 */
export const HTTP_START_FAILED = 422;

/**
 * Carries the selection identifier from the busy response to the confirming request.
 */
export const SELECTION_HEADER = 'x-deck-selection';
