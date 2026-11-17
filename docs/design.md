# Design decisions

This page explains why the framework is built the way it is. Each package's README describes how
it works; this page gives the reasons behind the main choices.

## The four ideas

Agents write most of the slide content, and the result should still look designed. Four ideas
carry that.

1. **A brand is data.** A brand is a typed token file plus assets. Slides hold no raw colors, fonts
   or pixel positions.
2. **Slides fill typed layouts.** An author picks a layout and fills its slots. The layout owns the
   type, the grid and the spacing, so a slide cannot go off-brand without the linter saying so.
3. **Agents see their own work.** `deck shot` renders any slide to a PNG and `deck lint` reports
   overflow, contrast, off-brand values and content over budget, each with its fix. Without that
   loop an agent cannot tell a good slide from a broken one.
4. **One React tree.** Diagrams, code, video and live mini apps are components on the slide, driven
   by one step counter.

## A small engine of its own

The engine (`packages/engine`) is a custom React runtime on Vite, not a layer over an existing
slide framework. The reason is the step counter. A slide's step is React state, and diagrams,
charts and code animations read it with `useStep()`. A framework that keeps reveal steps as DOM
classes would give those components a second source of truth. A framework built on another UI
library would push every React component into an iframe.

The parts an existing framework would save (scaling, keyboard navigation, steps, presenter sync)
are small. The parts that decide quality (brand tokens, layouts, diagrams, lint, export) have to be
written on any base.

## One file per slide and a manifest

A deck is a folder with a `deck.config.ts` and one file per slide in `slides/`.

- **MDX, not plain Markdown.** Slides need components. Markdown extensions end up as a worse
  component system.
- **MDX, not HTML.** HTML has no schema to validate and invites inline styling.
- **One file per slide.** Diffs stay small, several authors or agents can work in parallel without
  conflicts, and a review comment maps to exactly one file.
- **The config lists the order.** Moving a slide is a one-line change, not a rename of numbered
  files. Files in `slides/` that the config does not list are helpers, not slides.
- **TSX is the escape hatch.** A slide that needs real code is a `.tsx` file with the same layouts,
  slots and steps.
- **Validated at build time.** Frontmatter, the title and slot usage are checked against the
  layout's contract, and each error names its fix.

## A fixed canvas and one step counter

Every slide is laid out on a 1920 by 1080 canvas that is scaled to the window with a CSS
transform. Type sizes are canvas pixels from the brand's scale, so a slide looks the same at every
window size, in a screenshot and in an export.

Each slide has one integer step. Components opt in with `<Step at={2}>` or an `at` prop. The URL
hash holds the slide and the step (`#/12/3`), so a reload or a shared link lands on the same view.

The page exposes `window.__deck` (`goto`, `ready()` and the slide list) and a `?static` mode in
which every animation is at its end state. `deck shot`, `deck lint` and `deck export` all drive a
slide through these two. That is why content that loads late must hold `ready()`, and why
animations never run in static mode.

## Brands

A brand (`brands/<name>/brand.ts`) defines colors as palette scales and semantic roles, and named
surfaces (default, inverse, accent, gradient) that remap the roles. Surfaces give a deck its
rhythm: a section slide on the accent surface reads differently from a content slide without any
slide naming a color.

A surface may also paint background layers over its color and gradient (`background`): a photo
or texture that fills the slide (with a tint), an image placed from a corner or edge, a repeating
pattern, or one of the brand's gradients. They are not CSS on the slide but elements the kit's
`Frame` draws first (`Backdrop`), so each layer keeps its own opacity, treatment and tint, `deck
lint` measures only the text that actually sits over a picture against its pixels, and exports
see ordinary pictures. A surface with an image or pattern layer states the color it reads as
(its own `bg`), which the brand's contrast checks use. A slide can bring its own image
(`background: assets/hall.jpg`, or with `focal`, `opacity`, a `tint` in a role and `layers:
over`) or hide the surface's layers (`background: none`); a layout picks layered backgrounds the
way it picks any surface, through its contract's default `surface`.

The compiler turns a brand into CSS variables scoped by `data-brand` and `data-surface`, a Tailwind
theme, `@font-face` rules and code colors. A brand that fails contrast between role pairs, or whose
data palette cannot be told apart with a color-vision deficiency, does not load: the error names
the pair and the fix. Switching a deck to another brand is one line in `deck.config.ts`.

A brand also sets how diagrams look (`diagram`): the edges (line weight, round or sharp bends,
arrowheads), the group outlines, edge labels as plain text or chips, and named **cards**. A card
is a node style: fill, border, corner radius, shadow, shape, icon tile, an accent stripe along one
side, and the title's family, weight and case. Its colors are usually roles, so a card follows the
surface the slide is on (a palette step or a literal stays the same on every surface), and text the
brand does not color itself is moved in lightness until it reads on the card's fill. Where a
fixed color does not work on one surface (a pale fill on the inverse surface), the surface
recolors the card (`color.surfaces.<name>.diagram.cards`, colors only).

Five cards exist in every brand: `default` (the plain node), `outline`, `solid`, `tint` and
`raised`. A brand that does not write them gets them derived from its roles and shape; a brand may
restyle them and add its own. Every card takes its line weight, corner radius and title type from
the brand's `default` card unless the card has its own (the standard `raised` keeps its hairline),
so a brand writes those once. The standard names keep a deck portable: a slide that marks its key
node `card="solid"` renders in every brand, each in its own way. A brand's own names are for a
deck that belongs to that brand.

A node takes, in order, its own `card`, its diagram's `card`, the card the brand maps its kind to
(`diagram.kinds`, such as databases as `tint`), then `default`. States win over the card:
highlighted, error and success still recolor the outline, and muted nodes and a focus still dim. A
name the brand does not have does not fail the build, because a deck may be rendered in another
brand: the next card in the order applies, and `deck lint` reports it (`diagram-card-missing`)
with the brand's cards and the closest name.

## Layouts and budgets

Each layout publishes a contract: its frontmatter fields, its slots, and a content budget.
`deck layouts --json` prints the catalog so an agent can choose a layout from the message it wants
to send.

Budgets count content (words, bullets, items), never the room the content takes. A slide within
budget in one brand is then within budget in every brand. Whether it fits a brand's type is a
separate question, answered by the overflow rules.

## Diagrams, charts and code

- **Diagrams are placed by grid cell.** `<Flow>` takes nodes with a column and a row, or lays them
  out with ELK. Agents are reliable with grid cells and unreliable with pixel coordinates.
- **Diagrams are drawn by the kit.** There is no Mermaid tier. A diagram the kit draws takes the
  brand's tokens and type, reveals by step and can be checked by `deck lint`.
- **Charts lead with the point.** Every chart takes a `highlight` (what matters; the rest is
  muted) and `annotations`. The slide title states the takeaway and the chart supports it. Labels
  sit on the marks where possible, in place of a legend.
- **Each chart is a pure planner.** Rows, a size and a theme go in; a scene of shapes and text
  comes out. A chart can be tested without a browser, and its description can be exported as a
  native PowerPoint chart.
- **Code is highlighted at build time** with CSS-variable colors, so one highlight fits every
  brand and surface.

## Mini apps

A live demo runs in one of two ways. `<Live>` hosts a React component in the slide's own tree,
inside an error boundary; it suits small widgets. `<AppFrame>` shows a folder under the deck's
`apps/` as its own Vite build in an iframe, with a `postMessage` bridge for brand tokens and
lifecycle events. The iframe isolates CSS and globals. It is not a security boundary.

Both need a `poster`. Screenshots, exports and thumbnails show the poster and never the live app,
and a recorded `fallback` covers a venue with no network. Live demos fail on stage, so the linter
treats a missing poster as an error.

## Review comments are files

A comment made in the dev overlay is saved to `.feedback/<slide-id>.json` in the deck, with the
source file and line of the element it points at. Comments are committed files, so they show up in
code review and in history, and an agent can list them, fix the slide and resolve them from the
CLI. Commenting on a hosted static build would need a backend; a built deck has no comment
overlay.

## Export

- **PDF** pages are printed by Chromium from the static mode, so text stays text and links work.
- **PPTX** is written as OOXML by the framework itself. Text, shapes, tables, pictures, notes and
  links are native wherever the slide can be expressed that way; charts and diagrams become native
  charts, shapes and connectors, and a picture is used only for what PowerPoint cannot draw (an
  app, a video's frame, effects it has no equivalent for). An editable slide never matches the web
  slide exactly, so `deck export --dry-run` lists what each slide draws natively and why, and
  `--verify` scores the result against the web slide.
- **Steps.** A PPTX turns step reveals into click animations (`--no-animations` turns that off). A
  PDF has no animation, so `--steps` exports one page per step.

## History

Git is the history. One file per slide keeps text diffs readable. `deck diff` adds the visual
side: it renders the deck at two revisions and reports the slides that changed, side by side.

## The desktop shell

`deck present` opens the deck in an Electron window (`packages/shell`). Electron is used because
it renders with Chromium on every platform, the same engine family `deck lint`, `deck shot` and
export use. A shell built on the system webview would render in WebKit on macOS and Linux, and the
linter would no longer describe what the audience sees.

Electron's Chromium is not the same build as the one Playwright drives, so a slide can differ
slightly between the window and `deck shot`. Electron's version is pinned in the workspace catalog
and changed on purpose.

The shell is thin: windows, displays, fullscreen, menus and sleep prevention. It holds no deck or
agent logic. The CLI process owns the dev server and starts the shell as a child, so everything
that works in the shell also works in a browser with `deck dev`, and the shell could be replaced
without touching the rest. [present.md](present.md) is the guide.

## The agent panel

`--agent` adds a chat panel beside the slide. [agent.md](agent.md) is the guide for people, and
[agent-design.md](agent-design.md) explains how it is built and what a turn can and cannot do.
