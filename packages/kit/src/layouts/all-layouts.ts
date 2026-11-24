import type { LayoutDefinition } from '@deckster/engine';

import { actionsLayout } from '#layouts/actions-layout.tsx';
import { agendaLayout } from '#layouts/agenda-layout.tsx';
import { askLayout } from '#layouts/ask-layout.tsx';
import { beforeAfterLayout } from '#layouts/before-after-layout.tsx';
import { bentoLayout } from '#layouts/bento-layout.tsx';
import { bioLayout } from '#layouts/bio-layout.tsx';
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
import { imageRevealLayout } from '#layouts/image-reveal-layout.tsx';
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

/**
 * Every layout the kit registers, in the order of its catalog (`catalog.ts`): the default export of
 * `runtime.ts` registers them all. Each one lives in `layouts/<name>-layout.tsx` as
 * `<camelName>Layout`, which the deck plugin relies on to generate a list without the layouts a
 * code layout replaces.
 */
const allLayouts: readonly LayoutDefinition[] = [
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
  imageRevealLayout,
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
];

export default allLayouts;
