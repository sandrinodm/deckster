import { defineLayoutCatalog } from '@deckster/engine/layout';

import { actionsLayoutContract } from '#layouts/actions-layout.contract.ts';
import { agendaLayoutContract } from '#layouts/agenda-layout.contract.ts';
import { askLayoutContract } from '#layouts/ask-layout.contract.ts';
import { beforeAfterLayoutContract } from '#layouts/before-after-layout.contract.ts';
import { bentoLayoutContract } from '#layouts/bento-layout.contract.ts';
import { bioLayoutContract } from '#layouts/bio-layout.contract.ts';
import { cardsLayoutContract } from '#layouts/cards-layout.contract.ts';
import { chartLayoutContract } from '#layouts/chart-layout.contract.ts';
import { choosePathLayoutContract } from '#layouts/choose-path-layout.contract.ts';
import { closingLayoutContract } from '#layouts/closing-layout.contract.ts';
import { codeLayoutContract } from '#layouts/code-layout.contract.ts';
import { columnsLayoutContract } from '#layouts/columns-layout.contract.ts';
import { comparisonLayoutContract } from '#layouts/comparison-layout.contract.ts';
import { contentLayoutContract } from '#layouts/content-layout.contract.ts';
import { conversationLayoutContract } from '#layouts/conversation-layout.contract.ts';
import { dashboardLayoutContract } from '#layouts/dashboard-layout.contract.ts';
import { defaultLayoutContract } from '#layouts/default-layout.contract.ts';
import { definitionLayoutContract } from '#layouts/definition-layout.contract.ts';
import { demoLayoutContract } from '#layouts/demo-layout.contract.ts';
import { diagramLayoutContract } from '#layouts/diagram-layout.contract.ts';
import { doDontLayoutContract } from '#layouts/do-dont-layout.contract.ts';
import { equationLayoutContract } from '#layouts/equation-layout.contract.ts';
import { exerciseLayoutContract } from '#layouts/exercise-layout.contract.ts';
import { faqLayoutContract } from '#layouts/faq-layout.contract.ts';
import { featuresLayoutContract } from '#layouts/features-layout.contract.ts';
import { galleryLayoutContract } from '#layouts/gallery-layout.contract.ts';
import { imageLayoutContract } from '#layouts/image-layout.contract.ts';
import { logosLayoutContract } from '#layouts/logos-layout.contract.ts';
import { marketLayoutContract } from '#layouts/market-layout.contract.ts';
import { matrixLayoutContract } from '#layouts/matrix-layout.contract.ts';
import { personaLayoutContract } from '#layouts/persona-layout.contract.ts';
import { pricingLayoutContract } from '#layouts/pricing-layout.contract.ts';
import { productCutawayLayoutContract } from '#layouts/product-cutaway-layout.contract.ts';
import { proofLayoutContract } from '#layouts/proof-layout.contract.ts';
import { quadrantsLayoutContract } from '#layouts/quadrants-layout.contract.ts';
import { quizLayoutContract } from '#layouts/quiz-layout.contract.ts';
import { quoteLayoutContract } from '#layouts/quote-layout.contract.ts';
import { recapLayoutContract } from '#layouts/recap-layout.contract.ts';
import { risksLayoutContract } from '#layouts/risks-layout.contract.ts';
import { scheduleLayoutContract } from '#layouts/schedule-layout.contract.ts';
import { screenLayoutContract } from '#layouts/screen-layout.contract.ts';
import { sectionLayoutContract } from '#layouts/section-layout.contract.ts';
import { serviceBlueprintLayoutContract } from '#layouts/service-blueprint-layout.contract.ts';
import { shiftLayoutContract } from '#layouts/shift-layout.contract.ts';
import { sourcesLayoutContract } from '#layouts/sources-layout.contract.ts';
import { splitLayoutContract } from '#layouts/split-layout.contract.ts';
import { statementLayoutContract } from '#layouts/statement-layout.contract.ts';
import { statsLayoutContract } from '#layouts/stats-layout.contract.ts';
import { statusLayoutContract } from '#layouts/status-layout.contract.ts';
import { stepsLayoutContract } from '#layouts/steps-layout.contract.ts';
import { tableLayoutContract } from '#layouts/table-layout.contract.ts';
import { teamLayoutContract } from '#layouts/team-layout.contract.ts';
import { timelineLayoutContract } from '#layouts/timeline-layout.contract.ts';
import { titleLayoutContract } from '#layouts/title-layout.contract.ts';
import { voicesLayoutContract } from '#layouts/voices-layout.contract.ts';

export {
  brandLayoutCatalog,
  brandLayoutContract,
  checkBrandLayouts,
  type BrandLayoutCheck,
  type BrandLayoutProblem,
} from '#layouts/brand-layout.contract.ts';

/**
 * The contracts of every layout the kit registers, for the build and `deck layouts`, in the order a
 * deck usually uses them. It is loaded in Node, so it imports only contracts: no components, no
 * JSX, no browser code. Every layout in `runtime.ts` has its contract here, under the same name.
 */
export default defineLayoutCatalog({
  source: '@deckster/kit',
  layouts: [
    defaultLayoutContract,
    titleLayoutContract,
    sectionLayoutContract,
    statementLayoutContract,
    contentLayoutContract,
    splitLayoutContract,
    statsLayoutContract,
    equationLayoutContract,
    marketLayoutContract,
    chartLayoutContract,
    dashboardLayoutContract,
    diagramLayoutContract,
    serviceBlueprintLayoutContract,
    codeLayoutContract,
    demoLayoutContract,
    choosePathLayoutContract,
    definitionLayoutContract,
    agendaLayoutContract,
    recapLayoutContract,
    quoteLayoutContract,
    voicesLayoutContract,
    conversationLayoutContract,
    proofLayoutContract,
    imageLayoutContract,
    galleryLayoutContract,
    beforeAfterLayoutContract,
    screenLayoutContract,
    productCutawayLayoutContract,
    cardsLayoutContract,
    columnsLayoutContract,
    quadrantsLayoutContract,
    faqLayoutContract,
    featuresLayoutContract,
    bentoLayoutContract,
    stepsLayoutContract,
    actionsLayoutContract,
    exerciseLayoutContract,
    comparisonLayoutContract,
    matrixLayoutContract,
    pricingLayoutContract,
    doDontLayoutContract,
    quizLayoutContract,
    shiftLayoutContract,
    timelineLayoutContract,
    scheduleLayoutContract,
    tableLayoutContract,
    statusLayoutContract,
    risksLayoutContract,
    logosLayoutContract,
    teamLayoutContract,
    bioLayoutContract,
    personaLayoutContract,
    askLayoutContract,
    sourcesLayoutContract,
    closingLayoutContract,
  ],
});
