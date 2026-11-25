/**
 * One-line descriptions (and defaults) for the rows SchemaReference shows. The generated JSON
 * Schemas (src/data/brand-schema.json, deck-config.json) carry types, ranges and required flags
 * only, so what each field does is written here, by hand, from deckster's code:
 * packages/brand/src/schema/*.ts and resolve/*.ts for the brand,
 * packages/engine/src/contract/deck-config.ts for the deck config. Written at v0.3.0 (commit
 * 4e0b186); the diagram look and cards (`diagram.edges`, `groups`, `labels`, `kinds`, `cards` and
 * `color.surfaces.<name>.diagram.cards`), new in 0.4.0, from schema/diagram-schema.ts and
 * resolve/resolve-diagram.ts at commit 6c27269; the design controls new in 0.8.0 (`diagram.align`,
 * `nodes`, `notes`, `edges.lineStyle`, `groups.lineStyle`, pixel strokes, and a card's
 * `borderStyle`, `icon.border*` and `subtitle`) from the same files at v0.10.1. Checked against the 0.5.0 release merge
 * (commit 7dc64ea on main): the brand and deck-config
 * schemas and their defaults are otherwise unchanged (0.5.0 changes only the slide frontmatter,
 * which has no overlay).
 *
 * Keys are the row paths exactly as flattenSchema in format.ts writes them
 * (`color.surfaces.<name>.background[type=image].fit`). A row with no entry shows an empty
 * description. A key that names no row fails the build (see SchemaReference.astro), so a renamed
 * field cannot leave a description behind unnoticed.
 *
 * Descriptions are plain text with `code` spans; `default` is the value used when the field is
 * left out, shown as "Default `x`.".
 */
import type { SchemaRow } from "./format";

export type SchemaOf = "brand" | "deck-config";

type Entry = string | { text: string; default: unknown };

const DECK_CONFIG: Record<string, Entry> = {
  title: "The deck's title, any non-empty text.",
  slides:
    "The slide ids in presentation order. Each id names `slides/<id>.mdx` or `slides/<id>.tsx`, without the extension, in kebab-case.",
  brand: {
    text: "The folder under `brands/` the deck renders in, in kebab-case. `--brand <name>` overrides it for one run.",
    default: "default",
  },
  mouseNavigation: {
    text: "`false` stops left and right clicks from moving the deck; keys still work.",
    default: true,
  },
  duration:
    "The length of the talk in minutes and seconds (`20m`, `90s`, `1m30s`). The presenter window paces against it and `time-budget` checks the slide budgets against it.",
};

// ------------------------------------------------------------------ brand: repeated groups

/** ROLE_NAMES, and the pair each is checked in (checks/contrast-checks.ts ROLE_PAIRS). */
const ROLES: Record<string, string> = {
  bg: "The slide background. Text roles are checked for contrast against it.",
  surface: "The fill of cards, panels and diagram nodes.",
  fg: "Body text, at 4.5:1 on `bg` and `surface`.",
  heading: "Headings, at 3:1 on `bg` and `surface`.",
  muted: "Secondary text, captions and labels, at 4.5:1 on `bg` and `surface`.",
  accent: "Marks, highlights and large accent text, at 3:1 on `bg`.",
  "accent-fg": "Text on an `accent` fill, at 4.5:1 on it.",
  border: "Borders, rules and node outlines.",
  positive: "Good news: positive deltas and marks, at 3:1 on `bg`.",
  negative: "Bad news: negative deltas and marks, at 3:1 on `bg`.",
};

/** CODE_TOKENS (schema/theme-schema.ts, compile/shiki-theme.ts). */
const CODE: Record<string, string> = {
  background: "The code block's background.",
  foreground: "Code text no other token colours.",
  comment: "Comments, set in italic.",
  keyword: "Keywords.",
  string: "Strings.",
  number: "Numbers.",
  function: "Function names.",
  type: "Type names.",
  punctuation: "Punctuation, braces and operators.",
  highlight: "The background of a highlighted line.",
  added: "The tint of an added line in a diff.",
  removed: "The tint of a removed line in a diff.",
};

/** DIAGRAM_TOKENS (resolve/derive-themes.ts deriveDiagramTheme). */
const DIAGRAM: Record<string, string> = {
  node: "Node fill; derived from `surface`.",
  "node-border": "Node outline; derived from `border`.",
  "node-text": "Text on a node, at 4.5:1 on the node fill.",
  group: "The fill of a group box.",
  edge: "Edge lines, at 3:1 on the background.",
  label: "Edge and group labels and node subtitles, at 4.5:1 on the background.",
  highlight: "The fill of a highlighted node; derived from `accent`.",
  "highlight-text": "Text on a highlighted node, at 4.5:1 on its fill.",
  packet: "Packets that travel along edges; derived from `accent`.",
};

/**
 * The colour fields of a card a surface may recolour (schema/diagram-schema.ts SurfaceCardColors,
 * resolve/resolve-diagram.ts writtenCardColors), at 6c27269.
 */
const SURFACE_CARD: Record<string, string> = {
  fill: "The card's `fill` on this surface.",
  border: "The card's `border` on this surface.",
  text: "The card's title colour on this surface.",
  subtext: "The card's subtitle colour on this surface.",
  icon: "The card's icon colours on this surface.",
  "icon.color": "The icon glyph's colour on this surface.",
  "icon.fill": "The tile colour of a `solid` icon on this surface.",
  accent: "The card's accent stripe on this surface.",
  "accent.color": "The stripe's colour on this surface.",
  "icon.border": "The icon tile's border colour on this surface. New in 0.8.0.",
};

/**
 * A card (schema/diagram-schema.ts DiagramCard), with what fills each field in when it is left out
 * (resolve/resolve-diagram.ts STANDARD_LOOKS, BASE_GEOMETRY, STANDARD_GEOMETRY, cardTokens), at
 * 6c27269.
 */
const CARD: Record<string, Entry> = {
  fill:
    "A role (`surface`), a role with an opacity in percent (`accent/12`), a palette reference, a colour, or `none`. A role follows the slide's surface. Left out: the diagram `node` colour, `none` for `outline`, `accent` for `solid`, `accent/12` for `tint`, `surface` for `raised`.",
  border:
    "The outline colour, written as `fill` is. Left out: the diagram `node-border` colour, `none` for `solid`, `accent` for `tint`.",
  stroke:
    "The outline width, from `shape.stroke`. Left out: the brand's `default` card's, else `regular`; the standard `raised` keeps `hairline`.",
  radius: "The corner radius, from `shape.radius`, or `none`. Left out: the brand's `default` card's, else `md`.",
  shadow: {
    text: "One of the brand's shadows, as the slide's surface draws it, or `none`; inset layers are left out. Not taken from the `default` card. The standard `raised` has `md`.",
    default: "none",
  },
  shape: {
    text: "`kind` keeps the node kind's shape (a cylinder for a database), `box` draws a rectangle, `pill` a rectangle with round ends.",
    default: "kind",
  },
  text: "The title colour. Left out, it is derived to reach 4.5:1 on the card's fill on every surface; a colour written here is checked against that.",
  subtext: "The subtitle colour, derived and checked as `text` is.",
  icon: "How the node's icon is drawn.",
  "icon.style":
    "`chip` a bordered tile, `solid` a filled tile, `plain` the glyph alone, `none` no icon. Left out: `chip`, `plain` for `solid`, `solid` for `tint`.",
  "icon.color": "The glyph's colour. Left out, it is derived to reach 3:1 on what it sits on.",
  "icon.fill": { text: "The tile colour of a `solid` icon.", default: "accent" },
  accent:
    "A stripe along one side of the node, clipped to its outline and drawn over the fill, under the outline. Writing `accent`, even `{}`, draws it.",
  "accent.side": { text: "The side the stripe runs along.", default: "left" },
  "accent.color": { text: "The stripe's colour, written as `fill` is.", default: "accent" },
  "accent.width": { text: "The stripe's depth, from `shape.stroke`.", default: "bold" },
  title:
    "How the node title is set; its size stays the brand's `small` step. Each field left out comes from the brand's `default` card, else the `title` type step.",
  "title.family": "A family role: `display`, `body` or `mono`.",
  "title.weight": "A font weight from 1 to 1000.",
  "title.tracking": "Letter spacing in em.",
  "title.case": { text: "`upper` sets the title in capitals.", default: "none" },
  borderStyle:
    "`solid`, `dashed` or `dotted` node outline. Left out: the brand's `default` card's. New in 0.8.0.",
  "icon.border": "The icon tile's border colour, written as `fill` is. New in 0.8.0.",
  "icon.borderWidth":
    "The icon tile's border width: a name from `shape.stroke` or canvas pixels; `0` removes the outline. New in 0.8.0.",
  "icon.borderStyle": "`solid`, `dashed` or `dotted` icon tile border. New in 0.8.0.",
  subtitle:
    "How the node subtitle is set: a type step (`caption`, `label`, `small` or `body`) or an object. Its fields win over the brand's `default` card's, which win over `diagram.nodes.subtitle`; `null` skips the `default` card's and uses `diagram.nodes.subtitle`. New in 0.8.0.",
  "subtitle.type": "The base type step: `caption`, `label`, `small` or `body`.",
  "subtitle.family": "A family role: `display`, `body` or `mono`.",
  "subtitle.weight": "A font weight from 1 to 1000.",
  "subtitle.tracking": "Letter spacing in em.",
  "subtitle.case": "`upper` sets the subtitle in capitals, `none` as written.",
};

/** DataPalettes (schema/color-schema.ts). */
const DATA: Record<string, string> = {
  categorical: "Colours for unordered series.",
  sequential: "A scale from low to high.",
  diverging: "A scale from one extreme through a neutral midpoint to the other.",
  context: "The muted colour of everything a chart does not highlight.",
};

/** ShadowLayer (schema/shape-schema.ts). */
const SHADOW_LAYER: Record<string, Entry> = {
  x: { text: "Horizontal offset in canvas pixels; positive moves the shadow right.", default: 0 },
  y: "Vertical offset in canvas pixels; positive moves the shadow down.",
  blur: "Blur radius in canvas pixels.",
  spread: {
    text: "How far the shadow grows (positive) or shrinks (negative) before blurring. A PowerPoint export approximates it.",
    default: 0,
  },
  color: "The shadow colour with its opacity, usually a palette reference such as `ink.950/14`.",
  inset: { text: "Draws the shadow inside the box instead of outside.", default: false },
};

/** A chart line (schema/charts-schema.ts ChartLine), with its defaults (resolve/resolve-charts.ts). */
function chartLine(base: string, what: string, color: string): Record<string, Entry> {
  return {
    [base]: `The ${what}.`,
    [`${base}.show`]: { text: `Whether the ${what} is drawn.`, default: true },
    [`${base}.color`]: { text: "The role it takes its colour from on each surface.", default: color },
    [`${base}.stroke`]: { text: "A stroke width from `shape.stroke`.", default: "hairline" },
    [`${base}.dash`]: { text: "The line style.", default: "solid" },
  };
}

function prefixed(prefix: string, entries: Record<string, Entry>): Record<string, Entry> {
  return Object.fromEntries(Object.entries(entries).map(([key, entry]) => [`${prefix}.${key}`, entry]));
}

const SURFACE = "color.surfaces.<name>";
const BG = `${SURFACE}.background`;

const BRAND: Record<string, Entry> = {
  name: "The brand's folder name under `brands/`, in kebab-case; it must match the folder.",
  label: "The name people read, such as `Acme`.",

  // color
  color: "Palettes, roles, surfaces, chart palettes and contrast waivers.",
  "color.palette":
    "Colour scales by name, each a map of step (`50`, `500`, `base`) to a hex or `oklch()` colour. Everything else refers to them as `<palette>.<step>`.",
  "color.roles": "The base colour of each role. Layouts and components use only roles, never palette steps.",
  ...prefixed("color.roles", ROLES),
  "color.roles.heading": { text: ROLES.heading!, default: "fg" },
  "color.surfaces":
    "Named surfaces a slide picks with `surface:`. `default`, `inverse`, `accent` and `gradient` always exist; one left out is derived from the roles.",
  ...Object.fromEntries(
    Object.keys(ROLES).map((role) => [`${SURFACE}.${role}`, `Overrides the base \`${role}\` role on this surface.`]),
  ),
  [`${SURFACE}.bg`]:
    "Overrides the base `bg` on this surface. Required with an image or pattern layer: the colour contrast is checked against.",
  [`${SURFACE}.gradient`]: "A gradient from `gradients`, painted as the surface's background.",
  [BG]: "Layers painted in order over the surface's colour and gradient, under the slide's content.",
  [`${BG}[type=image].type`]: "A photo or texture that fills the slide.",
  [`${BG}[type=image].file`]: "An `.svg`, `.png`, `.webp` or `.jpg` file inside the brand folder.",
  [`${BG}[type=image].fit`]: { text: "`cover` crops the image to the slide around `focal`; `contain` shows all of it.", default: "cover" },
  [`${BG}[type=image].focal`]: { text: "The point `cover` crops around, in percent of the image.", default: { x: 50, y: 50 } },
  [`${BG}[type=image].opacity`]: { text: "The layer's opacity.", default: 1 },
  [`${BG}[type=image].treatment`]: "An image treatment from `imagery.treatments`.",
  [`${BG}[type=image].tint`]: "A translucent colour laid over the image, so text reads on a busy photo.",
  [`${BG}[type=placed].type`]: "An image at a fixed place: a corner mark, an edge band, a watermark.",
  [`${BG}[type=placed].file`]: "An `.svg`, `.png`, `.webp` or `.jpg` file inside the brand folder.",
  [`${BG}[type=placed].aspect`]: "The image's width divided by its height.",
  [`${BG}[type=placed].anchor`]: "Where the image sits: a corner, the middle of an edge or the centre.",
  [`${BG}[type=placed].width`]: "The image's width in canvas pixels.",
  [`${BG}[type=placed].offset`]: { text: "Moves the image from its anchor in canvas pixels; negative runs it off the edge.", default: { x: 0, y: 0 } },
  [`${BG}[type=placed].opacity`]: { text: "The layer's opacity.", default: 1 },
  [`${BG}[type=placed].rotate`]: { text: "Rotation in degrees.", default: 0 },
  [`${BG}[type=pattern].type`]: "An image repeated across the slide.",
  [`${BG}[type=pattern].file`]: "An `.svg`, `.png`, `.webp` or `.jpg` file inside the brand folder.",
  [`${BG}[type=pattern].aspect`]: "The tile image's width divided by its height.",
  [`${BG}[type=pattern].tile`]: "The width of one tile in canvas pixels.",
  [`${BG}[type=pattern].offset`]: { text: "Shifts the pattern from the top left corner in canvas pixels.", default: { x: 0, y: 0 } },
  [`${BG}[type=pattern].opacity`]: { text: "The layer's opacity.", default: 1 },
  [`${BG}[type=gradient].type`]: "One of the brand's gradients laid over the layers below: a scrim over a photo, a glow over a pattern.",
  [`${BG}[type=gradient].gradient`]: "A gradient from `gradients`.",
  [`${BG}[type=gradient].opacity`]: { text: "The layer's opacity.", default: 1 },
  [`${SURFACE}.logo`]: "The `logo.variants` entry shown on this surface instead of `logo.default`.",
  [`${SURFACE}.data`]: "Chart palettes for this surface, for colours that only work on its background. Lists left out are the brand's.",
  [`${SURFACE}.data.plate`]:
    "The opaque panel charts draw behind themselves. Defaults to `bg` on a solid surface whose text reaches 10:1 on it, else a deeper shade of the background.",
  ...prefixed(`${SURFACE}.data`, DATA),
  [`${SURFACE}.code`]: "Code colours on this surface; they win over the top-level `code`.",
  ...prefixed(`${SURFACE}.code`, CODE),
  [`${SURFACE}.diagram`]: "Diagram colours and card colours on this surface; they win over the top-level `diagram`.",
  ...prefixed(`${SURFACE}.diagram`, DIAGRAM),
  [`${SURFACE}.diagram.cards`]:
    "Recolours cards on this surface, by card name: colour fields only, each winning over the card's own here. The card must exist, standard or the brand's own.",
  ...prefixed(`${SURFACE}.diagram.cards.<name>`, SURFACE_CARD),
  [`${SURFACE}.shadow`]: "Shadows for this surface (`sm`, `md`, `lg`), such as deeper ones on a dark background.",
  [`${SURFACE}.shadow.<name>`]: "`\"none\"`, or the shadow's layers, top first.",
  ...prefixed(`${SURFACE}.shadow.<name>[]`, SHADOW_LAYER),
  "color.data": "The brand's chart palettes.",
  ...prefixed("color.data", DATA),
  "color.waivers":
    "Accepted contrast shortfalls: the pair then needs only 3:1, and a pass below 4.5:1 is a warning that carries the reason.",
  "color.waivers[].color": "The role of the text or mark.",
  "color.waivers[].on": "The role it sits on.",
  "color.waivers[].surface": "The one surface the waiver applies to; left out, it applies on every surface.",
  "color.waivers[].reason": "Why the shortfall is accepted, shown with the warning.",

  // gradients
  gradients: "Named gradients that surfaces and `gradient` background layers refer to.",
  "gradients.<name>[type=linear].type": "A straight gradient at an angle.",
  "gradients.<name>[type=linear].angle": "CSS degrees: 0 points up, 90 points right.",
  "gradients.<name>[type=linear].stops":
    "At least two stops, each a colour or `{ color, at }`. As in CSS, the first defaults to 0, the last to 100 and the rest spread evenly between.",
  "gradients.<name>[type=linear].stops[].at": "The stop's position in percent.",
  "gradients.<name>[type=linear].grain": "Noise over the gradient, as its opacity.",
  "gradients.<name>[type=radial].type": "A gradient from a centre outward.",
  "gradients.<name>[type=radial].shape": { text: "The gradient's shape.", default: "ellipse" },
  "gradients.<name>[type=radial].at": { text: "The centre, in percent of the slide.", default: { x: 50, y: 50 } },
  "gradients.<name>[type=radial].stops":
    "At least two stops, each a colour or `{ color, at }`. As in CSS, the first defaults to 0, the last to 100 and the rest spread evenly between.",
  "gradients.<name>[type=radial].stops[].at": "The stop's position in percent.",
  "gradients.<name>[type=radial].grain": "Noise over the gradient, as its opacity.",
  "gradients.<name>[type=mesh].type": "Soft glows of colour layered over a base colour.",
  "gradients.<name>[type=mesh].base": "The colour under the glows.",
  "gradients.<name>[type=mesh].points": "The glows, at least one.",
  "gradients.<name>[type=mesh].points[].x": "The glow's centre, in percent of the slide's width.",
  "gradients.<name>[type=mesh].points[].y": "The glow's centre, in percent of the slide's height.",
  "gradients.<name>[type=mesh].points[].size": { text: "How far the glow reaches, in percent of the slide.", default: 60 },
  "gradients.<name>[type=mesh].grain": "Noise over the gradient, as its opacity.",

  // typography
  typography: "The three font families and the eleven type steps.",
  "typography.families": "The `display`, `body` and `mono` families that type steps pick from.",
  "typography.families.<name>": "One family, with the fields below.",
  "typography.families.<name>.family":"The CSS family name, such as `IBM Plex Sans`.",
  "typography.families.<name>.fallback": "Families to fall back to, ending in a generic family such as `sans-serif`.",
  "typography.families.<name>.source": "Where the font files come from, by `kind`.",
  "typography.families.<name>.source[kind=fontsource].kind": "A Fontsource package installed with npm.",
  "typography.families.<name>.source[kind=fontsource].package": "The package, such as `@fontsource-variable/inter`.",
  "typography.families.<name>.source[kind=fontsource].axes": {
    text: "The file set a variable package loads, such as `wght`, `standard` or `full`.",
    default: "wght",
  },
  "typography.families.<name>.source[kind=fontsource].weights": "The weights a static package loads.",
  "typography.families.<name>.source[kind=fontsource].styles": { text: "The styles to load.", default: ["normal"] },
  "typography.families.<name>.source[kind=fontsource].subsets": { text: "The character subsets to load.", default: ["latin", "latin-ext"] },
  "typography.families.<name>.source[kind=files].kind": "Font files in the brand folder.",
  "typography.families.<name>.source[kind=files].files": "The font files, at least one.",
  "typography.families.<name>.source[kind=files].files[].path": "A `.woff2`, `.woff`, `.ttf` or `.otf` file inside the brand folder.",
  "typography.families.<name>.source[kind=files].files[].weight": "The file's weight, or `[min, max]` for a variable file.",
  "typography.families.<name>.source[kind=files].files[].style": { text: "The file's style.", default: "normal" },
  "typography.families.<name>.source[kind=files].files[].unicodeRange": "A CSS `unicode-range`, such as `U+0000-00FF`.",
  "typography.families.<name>.source[kind=system].kind": "A font the viewer's system provides; nothing is loaded.",
  "typography.families.<name>.source[kind=unavailable].kind":
    "A font the brand cannot ship yet: text renders in the fallback and every build warns.",
  "typography.families.<name>.source[kind=unavailable].reason": "Why the files are missing, shown in the warning.",
  "typography.families.<name>.substitute":
    "The installed family an exported PowerPoint file names as a stand-in when the brand font is neither embedded nor installed.",
  "typography.families.<name>.substitute.family": "The stand-in family, such as `Arial`.",
  "typography.families.<name>.substitute.panose": "The ten PANOSE bytes as 20 hex digits; known families have them built in.",
  "typography.families.<name>.substitute.pitchFamily": "The pitch-and-family byte PowerPoint writes; known families have it built in.",
  "typography.families.<name>.substitute.charset": "The charset byte PowerPoint writes; known families have it built in.",
  "typography.scale": "All eleven type steps; each becomes a `type-<step>` class.",
  "typography.scale.<name>": "One type step, with the fields below.",
  "typography.scale.<name>.family": "The family role the step uses.",
  "typography.scale.<name>.size": "Size in canvas pixels, at least 20.",
  "typography.scale.<name>.lineHeight": "Unitless line height.",
  "typography.scale.<name>.tracking": "Letter spacing in em.",
  "typography.scale.<name>.weight": "Font weight on the CSS scale.",
  "typography.scale.<name>.case": { text: "`upper` sets the step in capitals.", default: "none" },
  "typography.scale.<name>.style": { text: "The font style.", default: "normal" },
  "typography.scale.<name>.features": "OpenType features to turn on, such as `tnum` or `ss01`.",
  "typography.scale.<name>.axes": "Variable font axis values, such as `{ opsz: 144 }`.",

  // shape
  shape: "Corner radii, stroke widths and shadows.",
  "shape.radius": "Corner radii in canvas pixels; each becomes a `rounded-<name>` class.",
  "shape.stroke": "Stroke widths in canvas pixels, for borders, rules and diagram edges.",
  "shape.shadow": "The `sm`, `md` and `lg` shadows; each becomes a `shadow-<name>` class.",
  "shape.shadow.<name>": "`\"none\"`, or the shadow's layers, top first.",
  ...prefixed("shape.shadow.<name>[]", SHADOW_LAYER),

  // spacing
  spacing: "The spacing scale, slide margins and column grid, in canvas pixels.",
  "spacing.scale": "Eight spacing steps; each becomes `p-<step>`, `gap-<step>` and so on.",
  "spacing.margin": "The slide margins.",
  "spacing.margin.x": "Left and right margin in canvas pixels.",
  "spacing.margin.y": "Top and bottom margin in canvas pixels.",
  "spacing.grid": "The layout grid.",
  "spacing.grid.columns": "The number of columns.",
  "spacing.grid.rows": "The number of rows that a placed element's `rows` and `height` count, 1 to 12. Default `6`. New in 0.10.0.",
  "spacing.grid.gutter": "The gap between columns, and between rows for placed elements, in canvas pixels.",

  // logo
  logo: "Logo files and where the chrome places the logo.",
  "logo.variants": "Named logo files, such as `primary` and `reversed`.",
  "logo.variants.<name>.file": "An `.svg`, `.png` or `.webp` file inside the brand folder.",
  "logo.variants.<name>.aspect": "Width divided by height, to reserve space before the file loads.",
  "logo.default": "The variant shown unless a surface picks another with its `logo`.",
  "logo.clearSpace": "Clear space around the logo, as a multiple of its height.",
  "logo.placement": "Where the chrome draws the logo.",
  "logo.placement.corner": "The slide corner.",
  "logo.placement.height": "The logo's height in canvas pixels.",

  // icons
  icons: "The icon set slides draw icons from.",
  "icons.set": "An Iconify collection, such as `lucide` or `tabler`.",
  "icons.strokeWidth": "The stroke width icons are drawn at.",

  // imagery
  imagery: "Image treatments and the one images get by default.",
  "imagery.treatments": "Named treatments a slide or background layer can apply. `plain` always exists and draws the picture as it is.",
  "imagery.treatments.<name>[type=none].type": "Draws the picture as it is.",
  "imagery.treatments.<name>[type=rounded].type": "Rounds the picture's corners.",
  "imagery.treatments.<name>[type=rounded].radius": "A radius from `shape.radius`.",
  "imagery.treatments.<name>[type=grayscale].type": "Draws the picture in grey.",
  "imagery.treatments.<name>[type=duotone].type": "Maps the picture's dark and light tones to two colours.",
  "imagery.treatments.<name>[type=duotone].shadow": "The colour of the dark tones.",
  "imagery.treatments.<name>[type=duotone].highlight": "The colour of the light tones.",
  "imagery.treatments.<name>[type=tint].type": "Lays a translucent colour over the picture.",
  "imagery.treatments.<name>[type=tint].color": "The tint colour.",
  "imagery.treatments.<name>[type=tint].opacity": "The tint's opacity.",
  "imagery.default": "The treatment images get when they name none.",

  // chrome
  chrome: "What the engine draws around every slide.",
  "chrome.pageNumber": "The slide number.",
  "chrome.pageNumber.show": "Whether it is drawn.",
  "chrome.pageNumber.format": "Text with `{n}` for the slide number and, optionally, `{total}` for the count: `{n} / {total}`.",
  "chrome.pageNumber.corner": "The slide corner.",
  "chrome.footer": "A line of footer text.",
  "chrome.footer.show": "Whether it is drawn.",
  "chrome.footer.text": "The footer text.",
  "chrome.footer.corner": "The slide corner.",
  "chrome.progress": "A progress bar along one edge.",
  "chrome.progress.show": "Whether it is drawn.",
  "chrome.progress.edge": "The edge it runs along.",
  "chrome.progress.thickness": "Its thickness in canvas pixels.",
  "chrome.logo": "The logo, placed by `logo.placement`.",
  "chrome.logo.show": "Whether it is drawn.",
  "chrome.skipFirst": "`true` hides all chrome on the first slide.",

  // motion
  motion: "Easing curves, durations and the default slide transition.",
  "motion.easings":
    "Named cubic Bézier curves `[x1, y1, x2, y2]`. The kit reads `standard`, `emphasized` and `exit`.",
  "motion.durations": "Named durations in milliseconds. The kit reads `fast`, `base` and `slow`.",
  "motion.transition": "The slide transition used unless a slide sets `transition:`.",
  "motion.transition.kind": "The kind of transition.",
  "motion.transition.duration": "The name of a duration in `motion.durations`.",
  "motion.transition.easing": "The name of an easing in `motion.easings`.",

  // code
  code: "Code colours on every surface. Left out, they are derived from each surface's roles.",
  ...prefixed("code", CODE),

  // diagram
  diagram:
    "Diagram colours, edges, groups, edge labels and cards. Left out, the colours are derived from each surface's roles and the rest uses the defaults below.",
  ...prefixed("diagram", DIAGRAM),
  "diagram.edges": "How edges are drawn.",
  "diagram.align": "Where a diagram sits in its region: `left`, `center` or `right`. A slide's `align` wins. Left out, each diagram keeps its usual layout. New in 0.8.0.",
  "diagram.edges.stroke": { text: "The line width: a name from `shape.stroke`, or canvas pixels (new in 0.8.0).", default: "regular" },
  "diagram.edges.lineStyle": "`solid`, `dashed` or `dotted` connectors. An edge's own `lineStyle` wins; dashed and async flow edges, reply and async messages and error edges still draw dashed. New in 0.8.0.",
  "diagram.edges.corners": { text: "`round` bends with the brand's `lg` radius; `sharp` bends square.", default: "round" },
  "diagram.edges.arrow": { text: "A filled `triangle`, an `open` chevron or a `dot`.", default: "triangle" },
  "diagram.groups": "How group outlines are drawn.",
  "diagram.groups.stroke": { text: "The outline width: a name from `shape.stroke`, canvas pixels (new in 0.8.0), or `none` for no outline.", default: "hairline" },
  "diagram.groups.lineStyle": "`solid`, `dashed` or `dotted` outlines; wins over `dashed`. New in 0.8.0.",
  "diagram.groups.dashed": { text: "Draws the outline dashed.", default: false },
  "diagram.groups.radius": { text: "The corner radius, from `shape.radius`, or `none`.", default: "lg" },
  "diagram.labels": "How edge labels are set.",
  "diagram.labels.style": { text: "`plain` text on a knock-out, or a bordered `chip`.", default: "plain" },
  "diagram.labels.type": {
    text: "`caption` sets labels in the caption step; `label` in the brand's `label` step, with its family, case and tracking.",
    default: "caption",
  },
  "diagram.nodes": "Default node size and subtitle type. New in 0.8.0.",
  "diagram.nodes.width": { text: "The preferred node width in canvas pixels; `0` lets the layout size nodes. The layout can narrow a node to fit its region.", default: 0 },
  "diagram.nodes.height": { text: "The minimum node height in canvas pixels; `0` lets the layout size nodes. A node grows to fit its text.", default: 0 },
  "diagram.nodes.subtitle": "How node subtitles are set: a type step (`caption`, `label`, `small` or `body`) or an object with `type`, `family`, `weight`, `tracking` and `case`. Cards can override it.",
  "diagram.nodes.subtitle.type": "The base type step: `caption`, `label`, `small` or `body`.",
  "diagram.nodes.subtitle.family": "A family role: `display`, `body` or `mono`.",
  "diagram.nodes.subtitle.weight": "A font weight from 1 to 1000.",
  "diagram.nodes.subtitle.tracking": "Letter spacing in em.",
  "diagram.nodes.subtitle.case": "`upper` sets subtitles in capitals, `none` as written.",
  "diagram.notes": "How the detail text under a timeline milestone is set, as an object (not speaker notes). New in 0.8.0.",
  "diagram.notes.type": "The base type step: `caption`, `label`, `small` or `body`.",
  "diagram.notes.family": "A family role: `display`, `body` or `mono`.",
  "diagram.notes.weight": "A font weight from 1 to 1000.",
  "diagram.notes.tracking": "Letter spacing in em.",
  "diagram.notes.case": "`upper` sets the detail in capitals, `none` as written.",
  "diagram.kinds":
    "The card a node kind uses when neither the node nor its diagram names one, such as `{ external: 'outline' }`. Keys are node kinds, not aliases (`database`, not `db`); values are cards the brand has.",
  "diagram.cards":
    "Named node styles, at most 12. `default`, `outline`, `solid`, `tint` and `raised` exist in every brand: an entry with one of those names restyles it field by field, any other kebab-case name adds a card of the brand's own, which starts from the standard `default` look.",
  ...prefixed("diagram.cards.<name>", CARD),

  // charts (resolve/resolve-charts.ts CHART_DEFAULTS)
  charts: "Gridlines, axes, chart text, number formatting, big numbers and tables.",
  ...chartLine("charts.grid", "gridlines", "border"),
  ...chartLine("charts.axis", "axis line", "muted"),
  "charts.axis.ticks": { text: "Whether the axis has tick marks.", default: false },
  "charts.labels": "The type steps of chart text.",
  "charts.labels.axis": { text: "Axis labels.", default: "caption" },
  "charts.labels.value": { text: "Data labels.", default: "small" },
  "charts.labels.legend": { text: "Legend text.", default: "caption" },
  "charts.labels.annotation": { text: "Annotation text.", default: "caption" },
  "charts.labels.color": { text: "The role axis and legend labels take their colour from.", default: "muted" },
  "charts.numbers": "Number formatting for charts, stats and tables, as `Intl.NumberFormat` options.",
  "charts.numbers.locale": { text: "A locale such as `de-DE`.", default: "en-US" },
  "charts.numbers.notation": { text: "`compact` writes 1.2M, `standard` 1,200,000.", default: "compact" },
  "charts.numbers.currency": { text: "An ISO 4217 code such as `EUR`.", default: "USD" },
  "charts.numbers.maximumFractionDigits": { text: "The most decimals a number shows.", default: 1 },
  "charts.numbers.signDisplay": { text: "When a delta shows its sign.", default: "exceptZero" },
  "charts.stat": "Big numbers.",
  "charts.stat.step": { text: "The type step of the number.", default: "stat" },
  "charts.stat.label": { text: "The type step of its label.", default: "caption" },
  "charts.stat.color": { text: "The role the number takes its colour from.", default: "heading" },
  "charts.table": "Tables.",
  "charts.table.header": { text: "The type step of the header row.", default: "label" },
  "charts.table.body": { text: "The type step of the cells.", default: "small" },
  "charts.table.emphasis": {
    text: "How emphasized rows are marked: an accent-tinted `fill`, accent `text`, or an accent `bar` at the row's edge.",
    default: "fill",
  },
  "charts.table.rule": { text: "The stroke of the rule between rows.", default: "hairline" },
  "charts.table.zebra": { text: "Whether alternate rows are tinted.", default: false },
};

const OVERLAYS: Record<SchemaOf, Record<string, Entry>> = { brand: BRAND, "deck-config": DECK_CONFIG };

/** The rows with their descriptions and defaults from the overlay; rows without an entry are unchanged. */
export function describeRows(of: SchemaOf, rows: SchemaRow[]): SchemaRow[] {
  const overlay = OVERLAYS[of];
  return rows.map((row) => {
    const entry = Object.hasOwn(overlay, row.path) ? overlay[row.path] : undefined;
    if (entry === undefined) return row;
    return typeof entry === "string"
      ? { ...row, description: entry }
      : { ...row, description: entry.text, default: entry.default };
  });
}

/** Overlay keys that name no row of the schema, for the build to refuse. */
export function unknownDescriptionPaths(of: SchemaOf, allRows: SchemaRow[]): string[] {
  const paths = new Set(allRows.map((row) => row.path));
  return Object.keys(OVERLAYS[of]).filter((key) => !paths.has(key));
}
