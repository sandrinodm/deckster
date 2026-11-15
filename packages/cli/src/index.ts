export { cliLayer, cliProgram, COMMANDS, main, runCli, type CliServices } from '#cli.ts';
export {
  BrowserError,
  CliError,
  FileSystemError,
  SlideNotReadyError,
  ViteError,
} from '#cli-error.ts';
export type { Command, CommandError, CommandServices } from '#command.ts';
export { DeckBrowser } from '#browser/deck-browser.ts';
export type { DeckPage, PageSlide } from '#browser/deck-page.ts';
export { DeckServer, type RunningDeckServer } from '#server/deck-server.ts';
export {
  lintDeck,
  runDeckRules,
  runSlideRules,
  type LintOptions,
  type LintReport,
} from '#lint/run-lint.ts';
export { LINT_RULES } from '#lint/rules/index.ts';
export type {
  BrandContext,
  DeckContext,
  DeckRule,
  DeckRuleInput,
  ElementSnapshot,
  LintFinding,
  LintRule,
  RuleViolation,
  Severity,
  SlideContext,
  SlideRule,
  SlideRuleInput,
  StepSnapshot,
} from '#lint/types.ts';
export { takeShots, type ShotFile, type ShotOptions, type ShotResult } from '#shot/take-shots.ts';
export { listLayouts, type LayoutInfo } from '#layouts/list-layouts.ts';
export { addSlide } from '#scaffold/new-slide.ts';
export { createDeck } from '#scaffold/new-deck.ts';
export { Workspace } from '#workspace.ts';
export { runToolingStylesheet, TOOLING_STYLESHEET } from '#tooling/tailwind-stylesheet.ts';
