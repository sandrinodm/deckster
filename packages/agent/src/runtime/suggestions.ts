import type { AgentLintFinding } from '#protocol/agent-events.ts';

/**
 * How many suggestions the empty panel offers.
 */
const MAX_SUGGESTIONS = 3;

/**
 * The longest label shown, in characters.
 */
const MAX_LABEL_CHARS = 70;

/**
 * A run of whitespace, which a label shows as one space.
 */
const WHITESPACE_RUN = /\s+/g;

/**
 * A prompt the empty panel offers, put into the composer on click.
 */
export type Suggestion = {
  /**
   * Where it comes from: a lint finding, a review comment, or a generic example.
   */
  readonly source: 'lint' | 'comment' | 'example';

  /**
   * The button text.
   */
  readonly label: string;

  /**
   * The prompt it writes.
   */
  readonly prompt: string;

  /**
   * A review comment id to attach, for a suggestion from a comment.
   */
  readonly comment?: string;
};

/**
 * What is true of the slide on screen.
 */
export type SlideFacts = {
  /**
   * The slide's title, or an empty string.
   */
  readonly title: string;

  /**
   * The lint findings the conversation has for it (the page has no lint of its own).
   */
  readonly findings: readonly AgentLintFinding[];

  /**
   * Its open review comments.
   */
  readonly comments: readonly {
    /**
     * The comment id.
     */
    readonly id: string;

    /**
     * Its number on the slide.
     */
    readonly number: number;

    /**
     * The text.
     */
    readonly text: string;
  }[];
};

/**
 * Two or three prompts for the slide on screen: its lint errors and open review comments first,
 * then generic examples to fill up.
 *
 * @param facts - The slide's title, findings and comments.
 */
export function slideSuggestions(facts: SlideFacts): Suggestion[] {
  const fromLint = facts.findings
    .toSorted((left, right) => severityRank(left) - severityRank(right))
    .slice(0, 2)
    .map((finding): Suggestion => ({
      source: 'lint',
      label: clip(`Fix: ${finding.message}`),
      prompt: lintPrompt(finding),
    }));
  const fromComments = facts.comments.slice(0, 2).map((comment): Suggestion => ({
    source: 'comment',
    label: clip(`Address #${comment.number}: ${comment.text}`),
    prompt: `Address review comment #${comment.number}.`,
    comment: comment.id,
  }));
  const examples: Suggestion[] = [
    {
      source: 'example',
      label: facts.title === '' ? 'Give this slide a sharper title' : 'Shorten the title',
      prompt:
        facts.title === ''
          ? 'Give this slide a short title that states its point.'
          : `Shorten the title "${facts.title}" while keeping its point.`,
    },
    {
      source: 'example',
      label: 'Turn the bullets into three cards',
      prompt: 'Turn the bullets on this slide into three cards.',
    },
    {
      source: 'example',
      label: 'Make it readable at a glance',
      prompt: 'Cut the words on this slide so it reads at a glance.',
    },
  ];
  return [...fromLint, ...fromComments, ...examples].slice(0, MAX_SUGGESTIONS);
}

/**
 * Errors before warnings.
 *
 * @param finding - A finding.
 */
function severityRank(finding: AgentLintFinding): number {
  return finding.severity === 'error' ? 0 : 1;
}

/**
 * The prompt that asks the agent to fix one lint finding.
 *
 * @param finding - The finding.
 */
function lintPrompt(finding: AgentLintFinding): string {
  const detail = `${finding.message} ${finding.fix}`;
  return `Fix the ${finding.rule} lint ${finding.severity}: ${detail}`.trim();
}

/**
 * A label cut to {@link MAX_LABEL_CHARS}.
 *
 * @param text - The label.
 */
function clip(text: string): string {
  const flat = text.replaceAll(WHITESPACE_RUN, ' ').trim();
  return flat.length > MAX_LABEL_CHARS ? `${flat.slice(0, MAX_LABEL_CHARS - 1)}…` : flat;
}
