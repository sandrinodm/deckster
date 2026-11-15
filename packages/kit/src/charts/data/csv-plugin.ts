import type { Plugin } from 'vite-plus';

import { parseCsv } from '#charts/data/csv.ts';

/**
 * Imports of CSV files, with or without a query.
 */
const CSV_IMPORT = /\.csv(?:\?.*)?$/u;

/**
 * Serves `.csv` files imported from a deck (`import teams from '../data/teams.csv'`) as their rows,
 * parsed at build time: a default export of objects keyed by the header line, numbers as numbers,
 * empty cells as `null`. A malformed file fails the build with its path and line.
 *
 * @returns The Vite plugin.
 */
export function csvPlugin(): Plugin {
  return {
    name: 'deck-kit-csv',
    enforce: 'pre',
    transform(code, id) {
      if (!CSV_IMPORT.test(id)) {
        return null;
      }

      try {
        return { code: `export default ${JSON.stringify(parseCsv(code))};`, map: null };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.error(`${id}: ${reason}`);
      }
    },
  };
}
