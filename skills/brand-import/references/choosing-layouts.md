# Choosing layouts for a brand import

## Map source pages to existing layouts

1. Group slide pages by purpose and structure. Look at the contact sheet and a few full-size examples. A PowerPoint layout name is a clue. A slide marked "Title Only" may contain a detailed chart or two hand-placed text columns. For guidelines, use any slide samples they include. Use the document's colours and proportions as evidence for tokens.
2. Discover layouts in the intended deck and brand. Run `deckster layouts <deck> --summary` to shortlist, then `deckster layouts <deck> --json` for the full contracts. Add `--brand <target>` when the deck config names another brand. In an empty workspace, scaffold a scratch deck with `deckster new` to inspect the catalog. Check `warnings` if a brand's layouts are missing.
3. Prefer a layout already supplied by the target brand when it fits. The catalog gives its `source` as `brand:<name>`. Otherwise use a kit or engine layout. Inspect the title requirement, slots and accepted content, required frontmatter and examples, default surface and content limits. For a borderline match, put representative content in the example and lint it.
4. Record each family's source pages, layout name, surface and essential features in `layouts[]` as an archetype note. Use `maps_to: null` when no candidate fits. Set `override_needed` when the source uses a recurring change in structure that the available layout cannot express. Apply colour and type differences through brand tokens. Check the layout's own options before adding a custom layout for margins, alignment or media placement.

Start with these candidates, then verify the installed contracts. For authoring details, consult the create-presentation skill's layout guidance.

| Source family | Candidates to inspect |
|---|---|
| Opening cover, part divider, full-slide claim | `title`, `section`, `statement` based on the slide's role in the deck |
| Prose or bullets, sometimes with a small callout | `content` and its `aside` slot |
| Freeform text beside a photo, figure or diagram | `split` for a visual with accompanying text. Inspect its side, ratio and bleed controls. |
| Full-bleed photo with sparse overlaid text, or a title beat that docks into a header/footer bar above or below an image | `image` (and its title-placement field) or `image-reveal` (`dock`, `barSurface`, `fit`) |
| Parallel list lanes or options sharing comparison criteria | `columns` for short structured lists, `comparison` for options and criteria. For two freeform text columns, inspect `content` with a body and aside. |
| A few headline metrics, a main chart, a table or several distinct measures | `stats`, `chart`, `table` or `dashboard`. Match the content and required fields to the actual visual. |
| Process drawing, short sequence of steps or ordered meeting sections | `diagram` for a diagram component, `steps` for a short sequence of steps, `agenda` for an outline |
| Pull quote, group of logos or closing prompt | `quote`, `logos` or `closing` |

## Choose a template fallback

A custom layout binds regions to the contract of an existing kit or engine layout. The fallback determines what the same slide will display when another brand lacks the custom layout.

- Save the **full** catalog using `deckster layouts <deck> --brand default --json`. Use entries whose `source` does not begin with `brand:` as fallback candidates. Pass the file to `propose-layouts` and `check-draft`. Summary JSON leaves out field schemas and examples.
- Start with the proposal from `propose-layouts`. Inspect the source layout reference render alongside the proposed regions. Check that each required slot, frontmatter field and title in the fallback is taken by the custom layout. Match each bound slot to content it can hold. A text region can bind a string or numeric frontmatter field. Listing a structured field such as `stats` under `fields` preserves its data for the fallback. The custom layout draws only its bound regions. If the numbers must appear in the primary brand, use the kit's `stats` layout directly or place a number component in a visible region whose slot accepts components. If the proposal adds a body region to satisfy a fallback, check that the source has room and a reason for it. Try another fallback when the proposal needs a slot or structured data the source does not use.
- For example, a "Picture with Caption" layout with a title, photo and one line of text can use `image`, with the photo bound to its required `media` slot. If the source instead gives a photo and several bullets separate space, inspect `split`. For a layout with title and two prose regions, inspect `content` with `body` and `aside`. Its fallback treats the aside as a callout, so check that the result still makes sense outside the source brand.
- Look at the actual regions when checking whether a brand layout has `body`. Some CLI versions list a generic optional `body` entry even when the layout binds none. Team slides or title/photo slides can use just fields or named slots. For MDX, put named slots at the top level and put loose Markdown or JSX in a bound `body`. Since v0.8.0, loose content without a body region fails the build. A slide with no body can still have `<Notes>`, Markdown definitions and MDX comments. Generated examples may have an empty body when the layout has no required slots.
- If no contract can carry the required source content, document the unbound placeholder or the reason for dropping the layout. Keep reusable template geometry only where the source evidence supports it.

For remaining layout fields and draft validation, see [Layout specs](brand-draft-format.md#layout-specs-layouts-entries-from-a-template).

## Validate the layout on slides

Run `deckster brand check <name> --json` for the brand and the layout catalog. Scaffold or use a specimen slide with the intended `layout:` value, fill it with source-shaped content, then run `deckster lint <deck> --brand <name>` and `deckster shot <deck> --brand <name>`. Render with a second installed brand that lacks the custom layout and inspect the fallback's content, reading order and surface. Confirm both brands use the intended slots and fields.

For a PowerPoint handoff, run `deckster export <deck> --brand <name> --pptx --dry-run` to inspect the native and rasterised elements, then export and open the actual file. In native and hybrid exports, Deckster generates themes and slide masters per used brand surface with the deck's used layouts. Look for the custom layout by its label and verify the background art and mapped placeholders. Since v0.8.0 a two-content layout maps its first two eligible body slots to separate placeholders. Test both positions and confirm that each remains editable in PowerPoint. Title, subtitle and first picture mappings depend on the layout contract. The output masters and placeholder types come from Deckster's layout contracts. Review any source master features that lack a matching region or mapping.
