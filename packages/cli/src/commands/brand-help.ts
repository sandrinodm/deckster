import { DEFAULT_BRAND } from '@deckster/brand';

/**
 * The text `deck brand --help` prints.
 */
export const HELP = `Usage: deck brand [name] [--json]
       deck brand check <name> [--json]

Prints a brand's resolved tokens, or validates a brand without rendering a deck.

  deck brand [name]        A summary of brands/<name>: families, type scale, spacing and each
                           surface's roles, with the small-text color of a role that reaches only
                           3:1. Default: "${DEFAULT_BRAND}". With --json, every resolved token:
                           palette, surfaces (roles, text colors, backdrop, background layers,
                           code, diagram, data with the chart plate, charts, shadows), gradients,
                           typography, shape, spacing, logo, chrome, motion, data and charts.
                           Colors are hex, sizes canvas px.
  deck brand check <name>  Loads and validates brands/<name> and prints every error and warning
                           with its field and fix. Exits with 1 when it has errors.

Options:
  --json        For check: { brand, file, ok, errors, warnings }, each problem { path, message,
                fix }. A failure prints { ok: false, error: { type, message } }.
  -h, --help    Show this help.`;
