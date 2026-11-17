export { Canvas } from '#canvas/canvas.tsx';
export { CANVAS_HEIGHT, CANVAS_WIDTH } from '#canvas/fit-canvas.ts';
export type {
  AnyLayoutContract,
  ContentBudget,
  LayoutCatalog,
  LayoutContract,
  LayoutExample,
  LayoutVariant,
  PptxMapping,
  SlotBudgets,
  SlotContentKind,
  SlotContract,
  TitleContract,
  VariantCondition,
} from '#contract/layout-contract.ts';
export type {
  DeckManifest,
  SlideContentProps,
  SlideEntry,
  SlideKind,
  SlideMeta,
  SlideModule,
} from '#contract/manifest.ts';
export type { SlideFrontmatter, SlideFrontmatterInput } from '#contract/slide-frontmatter.ts';
export type { TransitionKind } from '#contract/transition.ts';
export { BODY_SLOT, slotTag } from '#contract/slots.ts';
export { Deck, type DeckProps } from '#deck/deck.tsx';
export { useDeck, type DeckControls } from '#deck/deck-context.ts';
export { SlideView, type SlideViewProps } from '#deck/slide-view.tsx';
export type { SlideSummary } from '#deck/slide-summary.ts';
export {
  defineLayout,
  type BleedInput,
  type BleedSide,
  type LayoutDefinition,
  type LayoutProps,
  type LayoutRegistration,
  type LayoutRegistry,
  type LayoutSlotName,
  type LayoutSlots,
} from '#layouts/layout.ts';
export { useLayouts } from '#layouts/use-layouts.ts';
export { MORPH_ATTRIBUTE } from '#morph/morph-elements.ts';
export { INTERACTIVE_ATTRIBUTE, isInteractiveTarget } from '#navigation/interactive-target.ts';
export type { Direction, Position } from '#navigation/navigation.ts';
export { Notes, type NotesProps } from '#notes/notes.tsx';
export { definePlugin, type DeckPlugin } from '#plugins/deck-plugin.ts';
export { useReadyHold } from '#readiness/use-ready-hold.ts';
export type { DeckApi } from '#runtime/deck-api.ts';
export { readStaticMode, useStatic } from '#static/static-mode.ts';
export { useSlide, type SlideInfo, type SlideState } from '#steps/slide-context.ts';
export { Step, useStep, useStepAt, type StepProps, type StepState } from '#steps/step.tsx';
