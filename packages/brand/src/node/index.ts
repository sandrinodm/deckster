export { brandTokensJson } from '#node/brand-json.ts';
export {
  BRAND_FILE,
  BRANDS_DIR,
  brandLocation,
  fileExists,
  listBrands,
  type BrandLocation,
} from '#node/brand-paths.ts';
export { resolveFontFiles, type ResolvedFonts } from '#node/font-files.ts';
export { loadBrand, type LoadedBrand } from '#node/load-brand.ts';
export {
  gatedLoad,
  holdCode,
  isCodeHeld,
  onCodeReleased,
  rememberLoaded,
  resetCodeGate,
  type CodeHold,
  type GatedLoad,
} from '#node/code-gate.ts';
export {
  CONTENT_FOLDER_NAMES,
  CONTENT_FOLDERS,
  CONTENT_SCOPE_SENTENCE,
  foldPath,
  isContentDirectory,
  isContentFile,
  STAGING_LIMITS,
  type StagingLimits,
} from '#node/content-policy.ts';
export { type GuardEntry } from '#node/guard-snapshot.ts';
export {
  assertDeckFolder,
  assertSlidePath,
  beginTurnGuard,
  guardBlobsDir,
  guardedBaseline,
  guardedWrite,
  recoverTurnGuard,
  recoverTurnsForBrand,
  resetTurnGuards,
  syncActiveTurn,
  turnRecordFile,
  writeDeckManifest,
  type GuardChange,
  type GuardOutcome,
  type GuardTarget,
  type RevertedPath,
  type TurnGuard,
} from '#node/turn-guard.ts';
export { TurnGuardError, turnGuardError } from '#node/turn-guard-error.ts';
export {
  BRAND_CALLEE,
  DECK_CONFIG_CALLEE,
  readStaticModule,
  type StaticCallee,
  type StaticModule,
} from '#node/static-module.ts';
