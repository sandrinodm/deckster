import { definePlugin } from '@deckster/engine';

import { columnsLayout } from './columns-layout.tsx';

/**
 * The test layouts' runtime plugin.
 */
export default definePlugin({ name: 'e2e-fixtures', layouts: [columnsLayout] });
