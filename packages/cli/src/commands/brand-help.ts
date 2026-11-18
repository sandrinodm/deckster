import { DEFAULT_BRAND } from '@deckster/brand';

/**
 * The text `deck brand --help` prints.
 */
export const HELP = `Usage: deck brand [name] [--json]
       deck brand check <name> [--json]
       deck brand add <source> [--force] [--json]

Prints a brand's resolved tokens, validates a brand without rendering a deck, or adds a brand
from a git repository.

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
  deck brand add <source>  Copies a brand folder from a git repository into brands/<name>, named
                           by the brand's \`name\`. <source> is gh:owner/repo/<folder>#<ref>
                           (over https), a GitHub link (https://github.com/owner/repo/tree/<ref>/
                           <folder>), or any https or ssh address with the folder after //, such
                           as git@github.com:owner/repo.git//brands/acme#v2. Without #<ref>, the
                           default branch. It runs your git, so your credential helper, SSH key
                           and url.<base>.insteadOf rules apply. brand.ts and layouts.ts are read
                           as data and never run; the brand is checked before anything is
                           written, and only brand.ts, layouts.ts, images, fonts and documents
                           are copied (no other code, symlinks or package files). Fonts are not
                           installed: it prints the commands to run next (pnpm install in this
                           repository, or npm install for missing fonts), then deck brand check,
                           which checks what needs the fonts. Each git step that uses the
                           network may take up to 2 minutes.

Options:
  --json        For check: { brand, file, ok, errors, warnings }, each problem { path, message,
                fix }. For add: { ok, brand, dir, source, commit, replaced, files, written,
                skipped: [{ path, reason }], fonts: [{ name, version, installed }], warnings,
                next }. A failure prints { ok: false, error: { type, message } }.
  --force       For add: replace a brand of the same name the workspace already has.
  -h, --help    Show this help.`;
