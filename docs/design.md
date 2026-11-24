# Design decisions

This page explains why the framework is built the way it is. Each package's README describes how
it works; this page gives the reasons behind the main choices.

## The four ideas

Agents write most of the slide content, and the result should still look designed. Four ideas
carry that.

1. **A brand is data.** A brand is a typed token file plus assets. Slides hold no raw colors, fonts
   or pixel positions. A brand or a deck that needs a layout the kit cannot draw may add it as code
   ([Custom layouts](#custom-layouts)); the tokens stay data.
2. **Slides fill typed layouts.** An author picks a layout and fills its slots. The layout owns the
   type, the grid and the spacing, so a slide cannot go off-brand without the linter saying so.
3. **Agents see their own work.** `deckster shot` renders any slide to a PNG and `deckster lint` reports
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

Motion is there to segment an explanation and to signal where to look, not to decorate. A step
comes in with one of a few effects (`<Step at={2} effect="wipe">`; rise is the default), a run of
steps marked `focus` recedes each earlier one to the brand's muted color, and a big number counts
up to its value when the deck moves forward onto it. Durations and easings are the brand's motion
tokens. A receded step changes color, never opacity, so it keeps the brand's text contrast.

The page exposes `window.__deck` (`goto`, `ready()` and the slide list) and a `?static` mode in
which every animation is at its end state. `deckster shot`, `deckster lint` and `deckster export` all drive a
slide through these two. That is why content that loads late must hold `ready()`, and why
animations never run in static mode: there every revealed step is in place at full strength,
nothing is receded and every number shows its final value. Copies of a slide (thumbnails,
presenter panes) and viewers who ask for reduced motion see no movement either.

## Transitions and morphs

The brand names the slide transition (`motion.transition`) and a slide may name its own
(`transition:` in its frontmatter) for the boundary with the slide before it, both ways. The
choice belongs to the pair of slides rather than to the key that was pressed, so a deck moves the
same way from the keyboard, from a link and from the presenter window. Every kind brings the
incoming slide in on top while the outgoing one stays opaque and in place (or, for `push`, moves
off edge to edge), so the canvas never shows between two slides.

A morph carries one element from a slide to the next: `<Morph id>` on both, and the element flies
to its new place while the slides run their transition underneath. It is a view transition scoped
to the canvas, which names only the one live copy of the element on each side while the old and
new states are captured; the neighbouring slides that stay mounted, and the slide copies in
thumbnails and presenter panes, never carry the name. A view transition applies its update a frame
after it starts, so only interactive moves morph: `window.__deck` moves apply at once and never
morph, which keeps `deckster shot`, `deckster lint` and export exact.

## Hidden slides

A slide with `hidden: true` in its frontmatter stays in the deck, and a talk skips it. It is for
backup slides that answer a likely question, an appendix, or a slide parked for later, the way
"Hide slide" works in PowerPoint and "Skip slide" in Keynote.

Skipping happens in one place, the navigation reducer, so the keyboard, a clicker, the pointer, the
embed controls and the presenter window all get it. Next and previous go to the neighbouring shown
slide, and first and last go to the first and last shown slide. A deck opened without a hash starts
on its first shown slide. A hidden slide is still reachable on purpose: a link or hash names it,
the presenter's sidebar, overview and go-to open it, and `window.__deck.goto` lands on it, which is
how `deckster shot`, `deckster lint` and `deckster export` reach it. From a hidden slide that was reached this
way, next and previous step through its own steps, then move to the neighbouring shown slide on that
side; where there is none (a backup slide after the last shown one), the move does nothing.
Whatever pairs a slide with the one before or after it (transitions, morphs, the presenter's next
slide, lint's `layout-repetition`) uses the neighbouring shown slide, so the pair is what the
audience sees one after the other.

Two rules keep the numbers honest. The numbers an author works with stay positions in the full slide
list: the URL hash, the sidebar's row numbers, the presenter's "Slide 12 of 40", the number typed
into go-to, `deckster shot` file names and `--slides 3,5-9`. Hiding or showing a slide then moves none
of them, so a saved link, a review comment and a screenshot name keep pointing at the same slide.
The numbers the audience sees count shown slides only: the brand's page number and total, the
progress bar and the embed controls' count. A deck of 35 slides with 5 hidden ones shows pages 1 to
30, with no gap where a hidden slide sits. A hidden slide reached directly shows no page number,
and its progress stays where the last shown slide before it left it.

Hiding is not removing. `deckster build` still builds a hidden slide and a URL still opens it. To take
a slide out of a deck, remove it from `slides` in `deck.config.ts`. A deck whose every slide is
hidden fails the build, because a talk would have nothing to show.

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
brand: the next card in the order applies, and `deckster lint` reports it (`diagram-card-missing`)
with the brand's cards and the closest name.

## Layouts and budgets

Each layout publishes a contract: its frontmatter fields, its slots, and a content budget.
`deckster layouts --json` prints the catalog so an agent can choose a layout from the message it wants
to send.

Budgets count content (words, bullets, items), never the room the content takes. A slide within
budget in one brand is then within budget in every brand. Whether it fits a brand's type is a
separate question, answered by the overflow rules.

### Placed elements

Some slides genuinely need an accent callout, a badge, a stamp or a footer label that sits outside
the layout's slots. Three kit components cover that on a dedicated slide-level layer: `<Shape>` (a
geometric container — `rect`, `square`, `ellipse`, `circle`, `pill`, `diamond` or `triangle` — with
fitted text or lists), `<Text>` (unboxed floating text) and `<Place>` (an unstyled wrapper for any
Markdown list, `<Icon>` or other kit component).

Three design rules keep them from turning slides back into freeform collages:

- **Named and grid-first, never pixels by default.** Placement uses a named anchor (`place`) inside
  a slide `zone` (`safe`, `header`, `footer` or `canvas`), or inclusive ranges (`cols`, `rows`) on
  the brand's 12×6 grid. A raw canvas-pixel `box` exists only as an escape hatch for imported
  templates, and `deckster lint` flags it at `info` level (`placed-pixels`) with the nearest named
  place or grid cell.
- **Token-only styling and yielding chrome.** `<Shape>` and `<Text>` accept only brand surfaces,
  role colours, radii, strokes, shadows and spacing tokens; low-contrast role fills fail at build
  time. Placed boxes never paint over chrome — the chrome planner treats them like bleeding media
  and moves or hides corner chrome that collides, while `placed-chrome` warns so the tradeoff stays
  visible.
- **Hard caps.** Because placed elements sit outside slot budgets, `deckster lint` caps them per
  slide: at most 4 placed elements (`placed-count`, error), at most 25 words per element and 40
  across the slide (`placed-words`, warning), and at most 35% of the safe area per box outside
  `zone="canvas"` (`placed-size`, warning, pointing to a layout instead). Placed elements stay
  callouts, badges and labels; the argument still lives in a layout.

## Brand layouts

An organisation's template has layouts of its own: a cover with a mark in one corner, a divider
with a number set large, a photo that runs off the edge. A brand brings them in
`brands/<name>/layouts.ts`. Each one is data: a name, the kit layout it falls back to, where the
title and the slots sit on the 1920x1080 canvas, and the art behind them (SVG or raster files in
the brand folder). Every `layouts.ts` exports a static literal, so the build can read the active
brand or look up another brand's layouts without running the file. The code gate also protects the
active layout file during an agent turn (see [agent.md](agent.md)). One kit component,
`BrandLayout`, draws every brand layout from its tokens.

A brand layout takes its contract from its fallback. It has the slots and fields its regions
bind, with the fallback's descriptions, `required` flags, schemas and checks. A slide that is
valid on the brand layout is therefore valid on the fallback, and the build refuses a layout that
binds something the fallback lacks or leaves out something it requires. Markdown outside a named
slot fills the `body` slot, so a brand layout needs a `body` region to accept that content.

That is the fallback rule, and it mirrors diagram cards. A deck may be rendered in another brand,
so a name the brand lacks must not fail the build. A card the brand does not have falls to the
next card in the order, and `deckster lint` reports it (`diagram-card-missing`). A slide that names a
brand layout the deck's brand lacks renders with the layout's kit fallback, and `deckster lint`
reports it (`brand-layout-fallback`). The swap happens in Node at build time, and the built deck
names only the kit layout: nothing about another brand reaches the browser. If two brands define
the same name with different fallbacks, the build fails and asks to rename one.

Budgets come from the fallback too. A layout may tighten a slot's budget, never loosen it: each
limit is the lower of the two. A slide within the brand layout's budget is then within the
fallback's, so the swap cannot push it past what the kit layout holds. For the same reason a
data layout cannot take a name a kit layout has. A code layout can, and only by saying so (see
[Custom layouts](#custom-layouts)).

The trade-off is fixed boxes. A kit layout adapts: it sets its text in the brand's margins and
grid and steps down to fit. A brand layout places each region at pixels, so it matches the
template exactly and holds only what its boxes hold. The text still steps down to fit its box,
but a slot's budget counts words, not the room they take, and a layout whose boxes are small
should tighten its budget. Brand layouts are for the template's own slides; slides the template
does not cover use kit layouts, or a custom layout when the kit has none that fits.

In a PPTX export, each brand layout a deck uses is written as its own PowerPoint slide layout,
named after the layout's label. Its art is placed once in the layout, and media boxes become
picture placeholders.

## Custom layouts

A data layout places regions at pixels on a kit layout's contract, and some slides need more than
that: a structure the kit has no layout for, or a brand's own `title` on every deck. A brand
(`brands/<name>/layouts/<layout>/`) or a deck (`decks/<deck>/layouts/<layout>/`) may therefore ship
a layout as React code: a `contract.ts`, a `layout.tsx` and, if it needs one, a `layout.css`. Every
tool treats it like a kit layout: the build, lint, export, `deckster layouts`, the agent's catalog
and `deckster shot` find it the same way. [The authoring
reference](../skills/create-presentation/references/code-layouts.md) has the rules and a worked
example.

This reverses two decisions of the brand layouts plan: that a brand cannot ship components, and
that a brand layout never replaces a kit layout. Both held while a brand carried only data. Data
layouts stay as they were, and stay the right answer for a template's fixed regions; code layouts
are for what regions cannot do.

- **A layout is two halves.** The contract is Node code: the build, lint, export and the agent
  import it to validate slides and print the catalog. The component is browser code, and Node
  cannot load it (no JSX), so the two live in two files and the component imports the contract as
  a type only.
- **Discovery by folder and file name.** A folder named after the layout, with fixed file names,
  needs no registration file and cannot be half registered. A folder with a missing file is a
  problem that names the file.
- **Contracts load through Vite, after a static check of their imports.** A contract may import
  only `effect`, a few `@deckster/*` entry points and `.ts` files inside its own folder or
  `layouts/_shared/`. Checking the source first turns a crash deep in a loader into a problem that
  names the import. Vite then evaluates the user's files only; `effect` and the engine come from
  the CLI's own copies, so a contract's schema is built by the same `effect` that validates it, and
  an edit to a helper is seen on the next load.
- **One resolver for every path.** Every command that needs the catalog asks one function for the
  brand's and the deck's code layouts. A layout with a problem is left out and reported, and only
  the slides that use it fail. The others, and the kit's, keep working.
- **The engine stamps the layout name.** Export used to trust the first `data-layout` a layout drew.
  The engine now puts `data-deck-layout` on the slide from its frontmatter, so a layout cannot
  export under the wrong PPTX mapping by what it draws. Lint and export still read the slot
  wrappers and the kit components' classes, so a layout must keep those (the reference lists them).
- **The kit publishes what its own layouts use.** `@deckster/kit/layout-parts` (browser) and
  `@deckster/kit/layout-fields` (Node-safe, for contracts) are the public names, and the kit's
  layouts import from them too. A test holds the names and signatures, so a breaking change is a
  decision in review. A layout that wants nothing to move under it skips the parts and writes plain
  React and CSS; every tool still works as long as the DOM rules hold.
- **A code layout may replace a kit layout, on request.** A code layout, in a brand or in a deck,
  may take a kit name when its contract says `replaces: true` and a compatibility check passes: it
  keeps every required field and slot, accepts everything the original accepted, decodes the
  original's example and limit cases and every real slide on the brand, and keeps a required
  title. That check is the rule the build already applies to a data layout and its fallback,
  applied to a replacement and the original. A replacement that breaks it is left out and the kit
  layout stays, so the slides on it fail with the reasons rather than rendering something else.
  A tighter or looser budget is allowed and noted, and a replacement without the original's PPTX
  mapping is a warning. A deck layout may replace a kit layout but never a brand's layout. The
  kit's component and stylesheet for a replaced name are not loaded at all. The kit's runtime is
  generated from the catalog and skips replaced names, because two stylesheets keyed on the same
  selectors would otherwise decide by their order, and rules deleted from the copy would keep
  applying. A few stylesheets are shared with layouts or components that stay, and keep loading;
  none of them is keyed on a layout name any more.
- **Eject is the way in.** `deckster layouts eject <name>` copies a kit layout into the brand or
  the deck under its own name with `replaces: true`, so the copy renders as the kit layout did and
  is compatible by construction. Parts the kit publishes are imported from the public entry points;
  private helpers are copied once into `layouts/_shared/`, with the classes of their stylesheets
  renamed so an edit cannot reach the kit's own layouts that still use them. The copy is a
  fork, and `.eject/` keeps what it started from, so `deckster layouts diff` can show what the kit
  changed since. It prints that and applies nothing: merging stays a decision.
- **A range says which deckster the layouts were written for.** A brand's `brand.json` or a deck's
  config may declare one. Outside it, none of that owner's code layouts load, and each slide on
  one says so, instead of failing somewhere inside a component.
- **Fetched brands stay data.** `deckster brand add` leaves code out, as it always did, and records
  which layouts it left out so a slide that uses one says why it fails. Running code from someone
  else's repository on your machine is a decision, not a side effect of fetching a brand.
- **The agent cannot write layouts.** The agent's turn changes slides and assets only, and the
  contracts are held while a turn runs: read as they were, never evaluated mid-turn.

The one difference from data layouts is portability. A data layout names a kit fallback, so a deck
rendered in another brand still builds. A code layout has no fallback: another brand that lacks it
fails the build for the slides that use it, and the message names the brand that has it. A deck
meant to move between brands should use kit layouts on those slides.

## Diagrams, charts and code

- **Diagrams are placed by grid cell.** `<Flow>` takes nodes with a column and a row, or lays them
  out with ELK. Agents are reliable with grid cells and unreliable with pixel coordinates.
- **Diagrams are drawn by the kit.** There is no Mermaid tier. A diagram the kit draws takes the
  brand's tokens and type, reveals by step and can be checked by `deckster lint`.
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
  slide exactly, so `deckster export --dry-run` lists what each slide draws natively and why, and
  `--verify` scores the result against the web slide.
- **Steps.** A PPTX turns step reveals into click animations (`--no-animations` turns that off). A
  PDF has no animation, so `--steps` exports one page per step.
- **Hidden slides.** The PDF, the PNGs and the PPTX leave them out, as a talk does, and the summary
  says how many. `--include-hidden` puts them in: ordinary pages in the PDF and PNGs, and native
  hidden slides in the PPTX, so PowerPoint skips them in a slide show. A hidden slide named in
  `--slides` is exported without `--include-hidden`, as an ordinary page in the PDF and a PNG, and
  still marked hidden in the PPTX.

## History

Git is the history. One file per slide keeps text diffs readable. `deckster diff` adds the visual
side: it renders the deck at two revisions and reports the slides that changed, side by side.

## The desktop shell

`deckster present` opens the deck in an Electron window (`packages/shell`). Electron is used because
it renders with Chromium on every platform, the same engine family `deckster lint`, `deckster shot` and
export use. A shell built on the system webview would render in WebKit on macOS and Linux, and the
linter would no longer describe what the audience sees.

Electron's Chromium is not the same build as the one Playwright drives, so a slide can differ
slightly between the window and `deckster shot`. Electron's version is pinned in the workspace catalog
and changed on purpose.

The shell is thin: windows, displays, fullscreen, menus and sleep prevention. It holds no deck or
agent logic. The CLI process owns the dev server and starts the shell as a child, so everything
that works in the shell also works in a browser with `deckster dev`, and the shell could be replaced
without touching the rest. [present.md](present.md) is the guide.

## The agent panel

`--agent` adds a chat panel beside the slide. [agent.md](agent.md) is the guide for people, and
[agent-design.md](agent-design.md) explains how it is built and what a turn can and cannot do.
