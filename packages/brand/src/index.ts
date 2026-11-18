export { contrastRatio } from '#color/contrast.ts';
export { parseColorLiteral, type Rgba } from '#color/color.ts';
export { GRAPHIC_CONTRAST, ROLE_PAIRS, TEXT_CONTRAST } from '#checks/contrast-checks.ts';
export {
  COMFORTABLE_ADJACENT_DELTA_E,
  CONTEXT_CONTRAST,
  CONTEXT_CONTRAST_RANGE,
  MIN_ADJACENT_DELTA_E,
  MIN_ADJACENT_DELTA_E_CVD,
  MIN_DIVERGING_ENDS_DELTA_E,
} from '#checks/data-thresholds.ts';
export { compileBrand, type CompiledBrand } from '#compile/compile-brand.ts';
export { fontFaceCss, type FontFaceRule } from '#compile/font-face.ts';
export type { ShikiTheme, ShikiTokenColor } from '#compile/shiki-theme.ts';
export { brandVariables, cssVar } from '#compile/variable-names.ts';
export type * from '#resolve/brand-tokens.ts';
export { CHART_PLATE_CONTRAST } from '#resolve/derive-data.ts';
export {
  MOTION_DURATION_NAMES,
  MOTION_EASING_NAMES,
  type MotionDurationName,
  type MotionEasingName,
} from '#resolve/derive-motion.ts';
export { layoutLayers } from '#resolve/layout-layers.ts';
export {
  resolveBrand,
  type BrandSource,
  type LayoutsSource,
  type ResolvedBrand,
} from '#resolve/resolve-brand.ts';
export { TEXT_TONES, type TextTone } from '#resolve/text-colors.ts';
export { isLargeText, typeScaleFacts, type TypeScaleFacts } from '#resolve/type-scale-facts.ts';
export { Brand, DEFAULT_BRAND, defineBrand, type BrandInput } from '#schema/brand-schema.ts';
export { isSafeName, MAX_NAME_LENGTH, SAFE_NAME_RULE, SafeName } from '#schema/safe-name.ts';
export {
  CHART_COLORS,
  LINE_DASHES,
  NUMBER_NOTATIONS,
  TABLE_EMPHASIS,
  type ChartColor,
  type LineDash,
  type NumberNotation,
  type TableEmphasis,
} from '#schema/charts-schema.ts';
export { DEFAULT_SURFACE, REQUIRED_SURFACES, ROLE_NAMES, type Role } from '#schema/color-schema.ts';
export {
  CARD_ACCENT_SIDES,
  CARD_ICON_STYLES,
  CARD_SHAPES,
  DIAGRAM_NODE_KINDS,
  EDGE_ARROWS,
  EDGE_CORNERS,
  LABEL_STYLES,
  MAX_DIAGRAM_CARDS,
  STANDARD_CARDS,
  type CardAccentSide,
  type CardIconStyle,
  type CardShape,
  type DiagramNodeKind,
  type EdgeArrow,
  type EdgeCorners,
  type LabelStyle,
  type StandardCard,
} from '#schema/diagram-schema.ts';
export {
  BrandLayoutSpec,
  BrandLayouts,
  defineBrandLayouts,
  LAYOUTS_FILE,
  LAYOUT_CANVAS_HEIGHT,
  LAYOUT_CANVAS_WIDTH,
  MAX_BRAND_LAYOUTS,
  MAX_LAYOUT_REGIONS,
  MIN_BOX_SIZE_PX,
  type BrandLayoutSpecInput,
  type LayoutBox,
} from '#schema/layout-schema.ts';
export { PLAIN_TREATMENT } from '#schema/identity-schema.ts';
export {
  CODE_TOKENS,
  DIAGRAM_TOKENS,
  type CodeToken,
  type DiagramToken,
} from '#schema/theme-schema.ts';
export { SHADOW_NAMES, type ShadowName } from '#schema/shape-schema.ts';
export {
  BOLD_WEIGHT,
  FAMILY_ROLES,
  LARGE_BOLD_TEXT_PX,
  LARGE_TEXT_PX,
  MIN_TYPE_SIZE_PX,
  TYPE_STEPS,
  type FamilyRole,
  type TypeStep,
} from '#schema/typography-schema.ts';
export {
  BrandError,
  brandError,
  describeProblem,
  type BrandProblem,
} from '#validate/brand-error.ts';
