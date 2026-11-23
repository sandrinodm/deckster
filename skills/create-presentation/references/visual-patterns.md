# Visual patterns for product and strategy

These layouts ship in v0.7.0. Confirm the layout in the installed catalog and start with its
field hints and editable example. Use the [layout chooser](slide-craft.md#3-choosing-the-evidence)
for related layouts. Check that the finished frame still shows the relationship and its labels in
a static preview or export.

```sh
deckster layouts <deck> --json
deckster new slide <deck> <id> --layout vision-storyboard
deckster shot <deck> <id> --steps
```

## Screen story

Use `screen-story` when a prepared screenshot sequence can demonstrate one product moment. Use
`spotlight` to point from the whole interface to a magnified crop of the same image, `wipe` for
registered before-and-after images in one viewport, `handoff` when a task moves from desktop to
phone, or `filmstrip` to show three consecutive actions. Use matching artwork for crops and wipes
so the audience can track the same feature. Check every click and the final comparison or
sequence. [Spotlight example](https://github.com/sandrinodm/deckster/blob/v0.7.0/decks/lookbook/slides/browser-spotlight.mdx)

## Product cutaway

Use two or three equally sized, aligned local illustrations. Put the product face first and order
the other layers front to back. Label what each layer contributes and state what they enable
together. With `reveal: true`, the first advance separates the front two layers and the next
advance exposes an optional third. [Cutaway example](https://github.com/sandrinodm/deckster/blob/v0.7.0/decks/lookbook/slides/product-cutaway.mdx)

## Service blueprint

Follow one customer through a short service journey. For each stage, give the customer's action,
the visible service work, the backstage work and its owner. Name the handoff that matters. With
`reveal: true`, open with the visible service, then show backstage work, the owners and the
highlighted handoff. [Blueprint example](https://github.com/sandrinodm/deckster/blob/v0.7.0/decks/lookbook/slides/service-blueprint.mdx)

## Choose a path

Start with one prompt and two plausible workflows. Give each route a scenario, a short set of
actions and its own outcome. In the live deck, select each branch and check the return to the
choices. In previews and exports, check that both workflows and outcomes read side by side.
[Branching example](https://github.com/sandrinodm/deckster/blob/v0.7.0/decks/lookbook/slides/demo-choose-path.mdx)

## Vision storyboard

Write three `scenes` with a pictured action, a time or moment label and one consequence for the
customer. Carry the same person or object across the frames so viewers can follow the change.
Shot one establishes the starting situation. Shot two shows how the experience works. Shot three
shows what becomes easier for the customer. With `reveal: true`, the first frame opens the slide and
two clicks complete the story. [Customer-experience storyboarding](https://articles.sequoiacap.com/visualizing-customer-experience) · [Wrenhaul example](https://github.com/sandrinodm/deckster/blob/v0.7.0/decks/lookbook/slides/vision-storyboard.mdx)

## Sketch to ship

Use your own working `sketch` and `finished` artwork at the same 16:9 ratio. Pin two `annotations`
to the feature's location in each image with percentages from the top left. Reserve room above
and to the right of each pin so the underlying evidence remains visible. The working sketch
sets up a question about the design. The released view answers it with the same two landmarks.
Name the consequence for the user in `result`. [Wrenhaul example](https://github.com/sandrinodm/deckster/blob/v0.7.0/decks/lookbook/slides/sketch-to-ship.mdx)

## Transit roadmap

Use four time `periods` shared by three `tracks`. Write one stop per relevant period and `null`
where a workstream has no stop. Give `transfer` a period position, two workstream positions and a
label that names what one team supplies to the other. Finish with a dated `milestone` that depends
on that handoff. With `reveal: true`, the routes establish the parallel work, the transfer connects
the teams, and the milestone lands last. [Wrenhaul example](https://github.com/sandrinodm/deckster/blob/v0.7.0/decks/lookbook/slides/roadmap-transit.mdx)

## Uncertainty hill roadmap

Give each of three `scopes` its `previous` and `current` placement on the same hill. The left slope
means the team is discovering the approach, the crest means the approach is known, and the right
slope means the team is carrying it out. The authored positions from 0 to 100 place markers on the
curve. Use judgment about uncertainty and execution to choose those placements. Give both review
dates and say what the movement means for the next decision. [Basecamp Hill Charts](https://basecamp.com/shapeup/3.4-chapter-13) · [Wrenhaul example](https://github.com/sandrinodm/deckster/blob/v0.7.0/decks/lookbook/slides/roadmap-hill.mdx)

## Opportunity map

Use a 16:9 `map` of a real study area or an explicitly illustrative scenario. Include the roads,
barriers or districts that make location relevant. Give `districts`, `proposed`, `constraint`, and
`route` points in percentages from the top left of the same map. Begin with the geography, trace
the selected connection and then reveal the constraint that changes the expansion decision.
[Wrenhaul example](https://github.com/sandrinodm/deckster/blob/v0.7.0/decks/lookbook/slides/opportunity-map.mdx)

## Strategy canvas

Name four to six buying `factors` and their positive direction, such as “Lower price”. Score two
`alternatives` and your `offer` from 1 to 5, using the same meaning of each score for all three
profiles. Include one score per factor in the same order. Use the first two profiles as context,
then reveal your offer and state the priorities and tradeoff. Describe the evidence or rubric in
a footnote or speaker notes. [Blue Ocean Strategy Canvas](https://www.blueoceanstrategy.com/tools/strategy-canvas/) · [Wrenhaul example](https://github.com/sandrinodm/deckster/blob/v0.7.0/decks/lookbook/slides/strategy-canvas.mdx)

## Future-back plan

Put a `future` outcome on the right with a date and a picture that shows what the customer can do.
Name two `capabilities` and explain what each contributes to that future. Trace the links right to
left and land on one near-term `bet` with a time and a test that will change a decision. A strong
final frame lets a reader trace the bet forward and see how it tests the capabilities that the
future depends on. [Wrenhaul example](https://github.com/sandrinodm/deckster/blob/v0.7.0/decks/lookbook/slides/future-back.mdx)
