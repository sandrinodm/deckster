import { definePlugin, type DeckPlugin, type LayoutDefinition } from '@deckster/engine';
import tokens from 'virtual:deck/brand';

import { AppFrame } from '#apps/app-frame.tsx';
import { Live } from '#apps/live.tsx';
import { CHART_COMPONENTS } from '#charts/chart-components.ts';
import { Chrome } from '#chrome/chrome.tsx';
import { CodeMove } from '#code/code-move.tsx';
import { CodeStep } from '#code/code-step.tsx';
import { Code } from '#code/code.tsx';
import { Cmd, Out, Terminal } from '#code/terminal.tsx';
import { CommandDemo } from '#demo/command-demo.tsx';
import { GroundedAnswer } from '#demo/grounded-answer.tsx';
import { ReviewDiff } from '#demo/review-diff.tsx';
import { RunTrace } from '#demo/run-trace.tsx';
import { DIAGRAM_COMPONENTS } from '#diagrams/diagram-components.ts';
import { MarkdownTable } from '#foundation/markdown-table.tsx';
import { Icon } from '#icons/icon.tsx';
import { brandLayoutDefinitions } from '#layouts/brand-layout.tsx';
import { Button } from '#links/button.tsx';
import { Download } from '#links/download.tsx';
import { LinkCard } from '#links/link-card.tsx';
import { Link } from '#links/link.tsx';
import { QR } from '#links/qr.tsx';
import { Image } from '#media/image.tsx';
import { Lottie } from '#media/lottie.tsx';
import { Video } from '#media/video.tsx';
import { Morph } from '#motion/morph.tsx';
import { Step } from '#motion/step.tsx';
import { Place } from '#place/place.tsx';
import { Shape } from '#place/shape.tsx';
import { Text } from '#place/text.tsx';

/**
 * The kit's runtime plugin with the given kit layouts. It registers those layouts (the `default`
 * layout among them goes over the engine's unstyled one), the animated `Step` that MDX and TSX
 * slides reveal content with, markdown links (`a`, which open outside sites in a new tab) and
 * tables (`table`, which the table layout treats from the slide's frontmatter), the link components
 * (`Button`, `Download`, `LinkCard`, `QR`), the code components (`Code`, `CodeMove`, `CodeStep`,
 * `Terminal`, `Cmd`, `Out`), the media components (`Image`, `Video`, `Lottie`), `Icon` and the page
 * chrome the brand describes. It ends with the active brand's own layouts (`layouts.ts`), each
 * drawn by the generic `BrandLayout`.
 *
 * The deck plugin calls it from a generated module with every kit layout a code layout does not
 * replace, so a replaced layout's component and stylesheet are never loaded. It imports no
 * stylesheet of its own: whoever calls it imports the layouts first and `kit-styles.ts` after them,
 * which keeps the stylesheet in the order `runtime.ts` has always given it.
 *
 * @param layouts - The kit layouts to register, in catalog order; the brand's layouts follow them.
 * @returns The plugin.
 */
export function kitPlugin(layouts: readonly LayoutDefinition[]): DeckPlugin {
  return definePlugin({
    name: '@deckster/kit',
    layouts: [...layouts, ...brandLayoutDefinitions(tokens.layouts)],
    components: {
      a: Link,
      table: MarkdownTable,
      Step,
      Morph,
      Button,
      Download,
      LinkCard,
      QR,
      Code,
      CodeMove,
      CodeStep,
      Terminal,
      Cmd,
      Out,
      Image,
      Video,
      Lottie,
      Icon,
      Live,
      AppFrame,
      CommandDemo,
      GroundedAnswer,
      ReviewDiff,
      RunTrace,
      Place,
      Shape,
      Text,
      ...CHART_COMPONENTS,
      ...DIAGRAM_COMPONENTS,
    },
    chrome: Chrome,
  });
}
