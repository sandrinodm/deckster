import { useSlide } from '@deckster/engine';
import { useState, type ReactNode } from 'react';

import { checkComponentProps } from '#components/check-component-props.ts';
import { useDemoPhase } from '#demo/demo-phase.ts';
import { useStillMotion } from '#motion/still-motion.ts';
import '#demo/demo-stories.css';

/**
 * A short edit with its unchanged context and rationale.
 */
export type ReviewDiffProps = {
  /**
   * The document or field under review.
   */
  document: string;

  /**
   * Unchanged text before the edit.
   */
  before: string;

  /**
   * Words the agent proposes removing.
   */
  original: string;

  /**
   * Words the agent proposes adding.
   */
  suggestion: string;

  /**
   * Unchanged text after the edit.
   */
  after: string;

  /**
   * Why the agent offers the change.
   */
  rationale: string;

  /**
   * Whether two deck advances show the edit and its scripted acceptance.
   */
  reveal?: boolean;
};

/**
 * Shows a specific proposed edit, a human decision and the resulting local draft.
 */
export function ReviewDiff(props: ReviewDiffProps): ReactNode {
  checkComponentProps('ReviewDiff', props);
  const { reveal = true } = props;
  const phase = useDemoPhase(reveal);
  const still = useStillMotion();
  const { isActive } = useSlide();
  const enabled = isActive && !still;
  const reviewSession = enabled && phase > 0 ? 'review' : 'reset';
  return <ReviewView key={reviewSession} phase={phase} enabled={enabled} {...props} />;
}

/**
 * The decision made locally, or the authored approval at the last step.
 */
type Decision = 'accept' | 'keep';

/**
 * By default, the final authored frame records approval and the resulting draft text.
 */
function ReviewView({
  phase,
  enabled,
  document,
  before,
  original,
  suggestion,
  after,
  rationale,
}: ReviewDiffProps & { phase: number; enabled: boolean }): ReactNode {
  const [decision, setDecision] = useState<Decision>();
  const status = decision ?? (phase === 2 ? 'accept' : undefined);
  const message = status === 'keep' ? original : suggestion;
  return (
    <div className="kit-demo-story kit-review-story" data-review-phase={phase}>
      <section className="kit-review-diff" aria-label={document}>
        <div className="kit-review-top kit-type-label">{document}</div>
        <div className="kit-review-line" data-kind="original">
          <span className="kit-type-label">Original</span>
          <p className="kit-type-lead">
            {before}
            <del>{original}</del>
            {after}
          </p>
        </div>
        {phase > 0 ? (
          <div className="kit-review-line" data-kind="suggestion">
            <span className="kit-type-label">Suggested</span>
            <p className="kit-type-lead">
              {before}
              <ins>{suggestion}</ins>
              {after}
            </p>
          </div>
        ) : null}
      </section>
      {phase > 0 ? (
        <section className="kit-review-decision" aria-label="Human review">
          <DecisionPanel
            status={status}
            rationale={rationale}
            message={`${before}${message}${after}`}
            enabled={enabled}
            decide={setDecision}
          />
        </section>
      ) : null}
    </div>
  );
}

/**
 * The strings and local actions needed for the review decision.
 */
type DecisionPanelProps = {
  /**
   * The chosen decision, once made.
   */
  status: Decision | undefined;

  /**
   * Why the proposed edit is useful.
   */
  rationale: string;

  /**
   * The full draft selected by the reviewer.
   */
  message: string;

  /**
   * Whether the active demo is accepting input.
   */
  enabled: boolean;

  /**
   * Records the human selection in the current slide session.
   */
  decide: (decision: Decision) => void;
};

/**
 * Shows the human decision or the exact draft it selected.
 */
function DecisionPanel({
  status,
  rationale,
  message,
  enabled,
  decide,
}: DecisionPanelProps): ReactNode {
  if (status !== undefined) {
    return (
      <div aria-live="polite">
        <p className="kit-demo-status kit-type-label">
          {status === 'keep' ? 'Original kept' : 'Edit approved'}
        </p>
        <h2 className="kit-type-title">Draft after review</h2>
        <p className="kit-type-lead">{message}</p>
      </div>
    );
  }

  return (
    <>
      <p className="kit-demo-status kit-type-label">Human review</p>
      <h2 className="kit-type-title">{rationale}</h2>
      {enabled ? (
        <div className="kit-review-buttons">
          <button
            type="button"
            className="kit-demo-control kit-type-small"
            onClick={() => decide('accept')}>
            Accept edit
          </button>
          <button
            type="button"
            className="kit-demo-control kit-type-small"
            onClick={() => decide('keep')}>
            Keep original
          </button>
        </div>
      ) : (
        <p className="kit-type-body">Accept edit or keep original</p>
      )}
    </>
  );
}
