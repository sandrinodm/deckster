/**
 * The most lines the layouts that step sparse running text up (`useDensity`) let it take at a
 * larger step: a body that would take more stays at the body size. They shape the layout's look in
 * each brand and are not budgets: `deckster lint` budgets slots in words and bullets, which do not
 * depend on the brand's type (see `ContentBudget` in `@deckster/engine/layout`).
 */
export const LAYOUT_LIMITS = {
  /**
   * Lines of a content slide's body.
   */
  contentBodyLines: 9,

  /**
   * Lines of a split slide's body with framed media, by ratio (text:media).
   */
  splitBodyLines: { '1:1': 9, '5:7': 8, '7:5': 9 },

  /**
   * Lines of a split slide's body when the media bleeds and its caption joins the text column.
   */
  splitBleedBodyLines: { '1:1': 8, '5:7': 8, '7:5': 8 },
} as const;
