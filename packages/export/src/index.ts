export {
  captureSlide,
  fetchEmbedded,
  fetchEmbeddedWithin,
  type CapturedSlide,
  type CaptureOptions,
} from '#capture/capture-slide.ts';
export { decodeDiagramDescription, isDrawableDiagram } from '#diagram/decode-diagram.ts';
export { ExportError, exportError } from '#export-error.ts';
export {
  EMBEDDED_FONT_PRESENTATION_ATTRIBUTES,
  embeddedFontListXml,
  latinAttributes,
  latinXml,
} from '#fonts/embedded-font-xml.ts';
export {
  FONT_DATA_CONTENT_TYPE,
  FONT_DATA_EXTENSION,
  FONT_RELATIONSHIP,
  fntdata,
  readEotHeader,
  type EotHeader,
} from '#fonts/eot.ts';
export { fontFiles, fontsReadme, type FontFile } from '#fonts/font-files.ts';
export {
  emptyFontPlan,
  instanceFonts,
  MAX_FAMILY_NAME,
  type EmbeddedFamily,
  type FontFace,
  type FontInstance,
  type FontPlan,
  type FontSourceAxes,
  type MissingCharacters,
  type ResolvedFont,
} from '#fonts/font-plan.ts';
export { fontUses, type FontStyleKey, type FontUse, type StyledText } from '#fonts/font-uses.ts';
export { FONT_SLOTS, type FontSlot } from '#fonts/instance-tables.ts';
export {
  staticFontsArgs,
  useStaticFonts,
  type StaticFontFace,
  type StaticFontsArgs,
  type StaticFontsResult,
} from '#fonts/pdf-fonts.ts';
export { systemFontsStyle } from '#fonts/system-fonts.ts';
export {
  assemblePdf,
  type AssembledPdf,
  type NotesPage,
  type PrintedPage,
} from '#pdf/assemble-pdf.ts';
export { printNotesPage, printSlide, type NotesContent } from '#pdf/print-pages.ts';
export type { JpegEncoder, RgbPixels } from '#pdf/recompress-images.ts';
export {
  EXPORT_MODES,
  planScene,
  type ExportMode,
  type MasterBackground,
  type PlanNote,
  type ScenePlan,
} from '#plan/plan-scene.ts';
export { planChart, plotSvg } from '#plan/chart-policy.ts';
export type { ChartPlan } from '#pptx/chart-model.ts';
export { buildPptx, type PptxResult, type PptxSlideReport } from '#pptx/build-pptx.ts';
export { layoutArtCount } from '#pptx/layout-art.ts';
export type {
  EmbeddedFile,
  EmbeddedFont,
  GrainFile,
  PptxDeckInput,
  PptxFonts,
  PptxSlideInput,
  SlideAssets,
  SurfaceTexture,
} from '#pptx/deck-input.ts';
export type { FontChoice, FontResolver } from '#pptx/text-xml.ts';
export {
  OUTLINE_MIN_SIZE_PX,
  outlineFonts,
  type OutlineFace,
  type OutlineFonts,
} from '#pptx/outline-text.ts';
export { surfaceThemes, type SurfaceTheme } from '#pptx/theme.ts';
export {
  dryRunReport,
  formatDryRun,
  type DryRunReport,
  type PlannedSlide,
} from '#report/dry-run.ts';
export type { RunStyle, SceneNode, SceneRect, SlideScene } from '#scene/scene.ts';
export { parseSlideSelection, type SlideSelection } from '#select/parse-slides.ts';
export {
  compareImages,
  drawComparison,
  type ComparisonMark,
  type ComparisonPictures,
  type ImageComparison,
} from '#verify/compare-images.ts';
export {
  dockerStatus,
  DOCKER_MISSING,
  DOCKER_STOPPED,
  type DockerStatus,
} from '#verify/docker-image.ts';
export { fontFamily, fontFilesIn } from '#verify/font-files.ts';
export {
  attributeOverlaps,
  formatVerdict,
  judgeRegion,
  REGION_THRESHOLDS,
  slideRegions,
  worstRegions,
  type RegionKind,
  type RegionMeasurement,
  type RegionVerdict,
  type VerifyRegion,
} from '#verify/regions.ts';
export {
  DEFAULT_RENDERER_IDS,
  detectRenderers,
  libreOfficeLabel,
  macFontLabel,
  RENDERER_IDS,
  withoutEmbeddedFonts,
  type RendererFontContext,
  type Renderer,
  type RendererFont,
  type RendererId,
  type RenderedSlides,
} from '#verify/renderers.ts';
export {
  parseValidatorOutput,
  validateOoxml,
  type OoxmlValidation,
} from '#verify/validate-ooxml.ts';
