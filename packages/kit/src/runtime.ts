import { definePlugin } from '@deckster/engine';
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
import { actionsLayout } from '#layouts/actions-layout.tsx';
import { agendaLayout } from '#layouts/agenda-layout.tsx';
import { askLayout } from '#layouts/ask-layout.tsx';
import { beforeAfterLayout } from '#layouts/before-after-layout.tsx';
import { bentoLayout } from '#layouts/bento-layout.tsx';
import { bioLayout } from '#layouts/bio-layout.tsx';
import { brandLayoutDefinitions } from '#layouts/brand-layout.tsx';
import { cardsLayout } from '#layouts/cards-layout.tsx';
import { chartLayout } from '#layouts/chart-layout.tsx';
import { choosePathLayout } from '#layouts/choose-path-layout.tsx';
import { closingLayout } from '#layouts/closing-layout.tsx';
import { codeLayout } from '#layouts/code-layout.tsx';
import { columnsLayout } from '#layouts/columns-layout.tsx';
import { comparisonLayout } from '#layouts/comparison-layout.tsx';
import { contentLayout } from '#layouts/content-layout.tsx';
import { conversationLayout } from '#layouts/conversation-layout.tsx';
import { dashboardLayout } from '#layouts/dashboard-layout.tsx';
import { defaultLayout } from '#layouts/default-layout.tsx';
import { definitionLayout } from '#layouts/definition-layout.tsx';
import { demoLayout } from '#layouts/demo-layout.tsx';
import { diagramLayout } from '#layouts/diagram-layout.tsx';
import { doDontLayout } from '#layouts/do-dont-layout.tsx';
import { equationLayout } from '#layouts/equation-layout.tsx';
import { exerciseLayout } from '#layouts/exercise-layout.tsx';
import { faqLayout } from '#layouts/faq-layout.tsx';
import { featuresLayout } from '#layouts/features-layout.tsx';
import { futureBackLayout } from '#layouts/future-back-layout.tsx';
import { galleryLayout } from '#layouts/gallery-layout.tsx';
import { imageLayout } from '#layouts/image-layout.tsx';
import { logosLayout } from '#layouts/logos-layout.tsx';
import { marketLayout } from '#layouts/market-layout.tsx';
import { matrixLayout } from '#layouts/matrix-layout.tsx';
import { opportunityMapLayout } from '#layouts/opportunity-map-layout.tsx';
import { personaLayout } from '#layouts/persona-layout.tsx';
import { pricingLayout } from '#layouts/pricing-layout.tsx';
import { productCutawayLayout } from '#layouts/product-cutaway-layout.tsx';
import { proofLayout } from '#layouts/proof-layout.tsx';
import { quadrantsLayout } from '#layouts/quadrants-layout.tsx';
import { quizLayout } from '#layouts/quiz-layout.tsx';
import { quoteLayout } from '#layouts/quote-layout.tsx';
import { recapLayout } from '#layouts/recap-layout.tsx';
import { risksLayout } from '#layouts/risks-layout.tsx';
import { roadmapHillLayout } from '#layouts/roadmap-hill-layout.tsx';
import { roadmapTransitLayout } from '#layouts/roadmap-transit-layout.tsx';
import { scheduleLayout } from '#layouts/schedule-layout.tsx';
import { screenLayout } from '#layouts/screen-layout.tsx';
import { screenStoryLayout } from '#layouts/screen-story-layout.tsx';
import { sectionLayout } from '#layouts/section-layout.tsx';
import { serviceBlueprintLayout } from '#layouts/service-blueprint-layout.tsx';
import { shiftLayout } from '#layouts/shift-layout.tsx';
import { sketchToShipLayout } from '#layouts/sketch-to-ship-layout.tsx';
import { sourcesLayout } from '#layouts/sources-layout.tsx';
import { splitLayout } from '#layouts/split-layout.tsx';
import { statementLayout } from '#layouts/statement-layout.tsx';
import { statsLayout } from '#layouts/stats-layout.tsx';
import { statusLayout } from '#layouts/status-layout.tsx';
import { stepsLayout } from '#layouts/steps-layout.tsx';
import { strategyCanvasLayout } from '#layouts/strategy-canvas-layout.tsx';
import { tableLayout } from '#layouts/table-layout.tsx';
import { teamLayout } from '#layouts/team-layout.tsx';
import { timelineLayout } from '#layouts/timeline-layout.tsx';
import { titleLayout } from '#layouts/title-layout.tsx';
import { visionStoryboardLayout } from '#layouts/vision-storyboard-layout.tsx';
import { voicesLayout } from '#layouts/voices-layout.tsx';
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
import '#apps/apps.css';
import '#code/code.css';
import '#icons/icon.css';
import '#layouts/code-layout.css';
import '#media/media.css';
import '#links/links.css';
import '#chrome/chrome.css';
import '#motion/motion.css';
import '#place/place.css';

/**
 * The kit's runtime plugin, loaded into every deck by `@deckster/vite-plugin`. It registers the
 * brand-aware layouts (the `default` layout over the engine's unstyled one), the animated `Step`
 * that MDX and TSX slides reveal content with, markdown links (`a`, which open outside sites in a
 * new tab) and tables (`table`, which the table layout treats from the slide's frontmatter), the
 * link components (`Button`, `Download`, `LinkCard`, `QR`), the code components (`Code`,
 * `CodeMove`, `CodeStep`, `Terminal`, `Cmd`, `Out`), the media components (`Image`, `Video`,
 * `Lottie`), `Icon` and the page chrome the brand describes. It ends with the active brand's own
 * layouts (`layouts.ts`), each drawn by the generic `BrandLayout`. Each layout's contract is in
 * `catalog.ts`, which the build loads in Node.
 */
export default definePlugin({
  name: '@deckster/kit',
  layouts: [
    defaultLayout,
    titleLayout,
    sectionLayout,
    statementLayout,
    contentLayout,
    splitLayout,
    statsLayout,
    equationLayout,
    marketLayout,
    chartLayout,
    dashboardLayout,
    diagramLayout,
    serviceBlueprintLayout,
    codeLayout,
    demoLayout,
    choosePathLayout,
    definitionLayout,
    agendaLayout,
    recapLayout,
    quoteLayout,
    voicesLayout,
    conversationLayout,
    proofLayout,
    imageLayout,
    galleryLayout,
    beforeAfterLayout,
    screenLayout,
    screenStoryLayout,
    visionStoryboardLayout,
    sketchToShipLayout,
    futureBackLayout,
    roadmapTransitLayout,
    roadmapHillLayout,
    opportunityMapLayout,
    strategyCanvasLayout,
    productCutawayLayout,
    cardsLayout,
    columnsLayout,
    quadrantsLayout,
    faqLayout,
    featuresLayout,
    bentoLayout,
    stepsLayout,
    actionsLayout,
    exerciseLayout,
    comparisonLayout,
    matrixLayout,
    pricingLayout,
    doDontLayout,
    quizLayout,
    shiftLayout,
    timelineLayout,
    scheduleLayout,
    tableLayout,
    statusLayout,
    risksLayout,
    logosLayout,
    teamLayout,
    bioLayout,
    personaLayout,
    askLayout,
    sourcesLayout,
    closingLayout,
    ...brandLayoutDefinitions(tokens.layouts),
  ],
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
