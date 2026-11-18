import { DEFAULT_BRAND } from '@deckster/brand';

/**
 * The text `deck brand --help` prints.
 */
export const HELP = `Usage: deck brand [name] [--json]
       deck brand check <name> [--json]

Prints a brand's resolved tokens, or validates a brand without rendering a deck.

  deck brand [name]        A summary of brands/<name>: families, type scale, spacing, each
                           surface's roles, with the small-text color of a role that reaches only
                           3:1, the diagram look (edges, groups, edge labels, the card each mapped
                           node kind uses) and every diagram card with its colors on the default
                           surface. Default: "${DEFAULT_BRAND}". With --json, every resolved token:
                           palette, surfaces (roles, text colors, backdrop, background layers,
                           code, diagram, diagramCards, data with the chart plate, charts,
                           shadows), gradients, typography, shape, spacing, logo, chrome, motion,
                           data, charts and diagram. diagram is { edges, groups, labels: { style,
                           type }, kinds, cards }: cards has each card's geometry and title type
                           by name, the five standard cards first, with titleOwn (the brand wrote
                           the title type, on the card or its default card); a surface's
                           diagramCards holds each card's colors and shadow there, after any
                           recoloring the surface writes, with nodeFill (the fill is that
                           surface's diagram node color). Colors are hex, sizes canvas px.
                           It also prints the number and names of the brand's own layouts
                           (brands/<name>/layouts.ts). With --json, layouts has each
                           layout with its defaults filled in.
  deck brand check <name>  Loads and validates brands/<name> and prints every error and warning
                           with its field and fix. This includes its layouts: each must name a
                           kit or engine layout as its fallback, bind only slots and fields that
                           layout has, bind every one it requires, and not clash with a kit
                           layout's name. Exits with 1 when it has errors.

Options:
  --json        For check: { brand, file, ok, errors, warnings }, each problem { path, message,
                fix }. A failure prints { ok: false, error: { type, message } }.
  -h, --help    Show this help.`;
