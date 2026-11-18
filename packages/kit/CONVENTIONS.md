# Layout conventions

These conventions keep layouts consistent across brands and fit levels.

## S1: judgement marks and colours

Use `KitMark` and `KitMeter` from `#foundation/marks.tsx`. Marks use the shared cap-height size
and brand stroke. Good and bad states use positive-text and negative-text; attention uses a
triangle, blockage a square, and completed states muted ink. Accent selects an item.

## S2: badges and pills

Use `Badge` and `Pill` from `#foundation/badges.tsx`, at the label type step or larger.

## S3: selected structures

Selected panels and full row bands use nested `data-surface`: accent normally, inverse when
the slide is accent or gradient. Their background is
`var(--brand-background, var(--brand-color-bg))`. Unselected market rows remain transparent
so the slide artwork stays visible. Current schedule lanes use accent bars.

## S4: indexes

Ordinary list indexes use muted two-digit tabular figures in the title face. Keep native ordered
list semantics. Hero recap sequences may use display numerals; quiz choices keep A–D.

## S5: rules

Separators use the brand hairline and border role. Group headings may use the regular stroke.
Accent rules belong to selected items.

## S6: fit and reveal

Try larger type before stretching sparse content. Fit full content, including hidden steps and
child overflow, before revealing. Stretch tables with auto-height headings and equal content
rows. Small secondary text pairs with lead headings; caption pairs with body headings.
Footnotes stay visible from step 0, independently of item reveals.

## S7: header rhythm and common measure

Use `SlideHeader`, with `maxLines={1}` for dense data headers. Name tables and transcripts via
`titleId={useId()}` and `aria-labelledby`. Context uses `kit-prose kit-body`; context and content
start after `--kit-title-gap`. Tighten dense content inside its region. Use `--kit-measure-wide`
for ten-column copy widths. Validate frontmatter icon names through the shared `IconNameField`.
