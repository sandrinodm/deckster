/**
 * The slot every layout has: the slide's content outside any named slot tag. In a TSX slide it is
 * what the default export renders.
 */
export const BODY_SLOT = 'body';

/**
 * The reserved slot name the MDX build routes top-level placed elements (`<Shape>`, `<Text>`,
 * `<Place>`) into. Its leading underscores cannot match {@link SLOT_NAME_PATTERN}, so it can never
 * collide with a layout's named slots.
 */
export const PLACED_SLOT = '__placed' as const;

/**
 * Matches a slot name: a lowercase letter, then letters and digits, such as `left` or
 * `quoteSource`. The tag authors write is the same name with a capital first letter.
 */
export const SLOT_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

/**
 * The element the build wraps every MDX slide's top-level content in. The engine renders the
 * slide's layout in its place, with the top-level content sorted into slots.
 */
export const SLOTS_ELEMENT = 'DeckSlots';

/**
 * The element the build renames a top-level slot tag such as `<Left>` to, with the slot name in its
 * {@link SLOT_NAME_ATTRIBUTE} attribute.
 */
export const SLOT_ELEMENT = 'DeckSlot';

/**
 * The attribute of {@link SLOT_ELEMENT} that holds the slot name.
 */
export const SLOT_NAME_ATTRIBUTE = 'name';

/**
 * The tag an author writes for a slot in MDX, and the export name that fills it in TSX: the slot
 * name with its first letter capitalized (`left` becomes `Left`, `quoteSource` becomes
 * `QuoteSource`).
 *
 * @param slot - A slot name matching {@link SLOT_NAME_PATTERN}; other strings are capitalized the
 *   same way without being checked.
 */
export function slotTag(slot: string): string {
  return `${slot.charAt(0).toUpperCase()}${slot.slice(1)}`;
}
