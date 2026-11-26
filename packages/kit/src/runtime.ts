import { kitPlugin } from '#kit-plugin.ts';
import allLayouts from '#layouts/all-layouts.ts';
import '#kit-styles.ts';

/**
 * The kit's runtime plugin with every kit layout (see `kitPlugin`). Each layout's contract is in
 * `catalog.ts`, which the build loads in Node. The deck plugin loads a generated copy instead
 * (`virtual:deck/kit-runtime`), which leaves out the kit layouts a brand's or a deck's code layout
 * replaces; this module serves everything else that needs the whole kit, such as tests and the
 * dependency scan.
 */
export default kitPlugin(allLayouts);
