import { useSlide } from '@deckster/engine';
import { useRef, useState, type ReactNode } from 'react';

import { checkComponentProps } from '#components/check-component-props.ts';
import { useDemoPhase } from '#demo/demo-phase.ts';
import { Step } from '#motion/step.tsx';
import { useStillMotion } from '#motion/still-motion.ts';
import '#demo/demo-stories.css';

/**
 * The question, answer and evidence for a grounded answer demo.
 */
export type GroundedAnswerProps = {
  /**
   * The user's question.
   */
  question: string;

  /**
   * The answer that follows from the given document.
   */
  answer: string;

  /**
   * The original document or brief name.
   */
  sourceTitle: string;

  /**
   * The document reference, such as a page and section number.
   */
  reference: string;

  /**
   * The context that precedes the cited passage.
   */
  context: string;

  /**
   * The exact cited passage, reproduced word for word.
   */
  evidence: string;

  /**
   * Whether the answer and evidence appear on two deck advances.
   */
  reveal?: boolean;
};

/**
 * Reveals a cited answer and connects its citation to the exact supporting passage.
 */
export function GroundedAnswer(props: GroundedAnswerProps): ReactNode {
  checkComponentProps('GroundedAnswer', props);
  const { reveal = true } = props;
  const phase = useDemoPhase(reveal);
  const still = useStillMotion();
  const { isActive } = useSlide();
  return <AnswerView key={phase} phase={phase} enabled={isActive && !still} {...props} />;
}

/**
 * Combines the evidence and answer without changing their geometry between steps.
 */
function AnswerView({
  phase,
  enabled,
  sourceTitle,
  reference,
  context,
  evidence,
  question,
  answer,
}: GroundedAnswerProps & { phase: number; enabled: boolean }): ReactNode {
  const [cited, setCited] = useState(false);
  const passage = useRef<HTMLParagraphElement>(null);
  const active = phase === 2 || cited;
  const reply = (
    <div className="kit-grounded-reply">
      <div className="kit-demo-status kit-type-label">Answer</div>
      <p className="kit-type-lead">{answer}</p>
      {enabled ? (
        <button
          className="kit-demo-control kit-type-small"
          type="button"
          onClick={() => {
            setCited(true);
            passage.current?.focus();
          }}>
          {reference}
        </button>
      ) : (
        <span className="kit-grounded-citation kit-type-small">{reference}</span>
      )}
    </div>
  );
  return (
    <div className="kit-demo-story kit-grounded-story">
      <article className="kit-grounded-document" aria-label={sourceTitle}>
        <p className="kit-demo-status kit-type-label">{reference}</p>
        <h2 className="kit-type-title">{sourceTitle}</h2>
        <p className="kit-type-body">{context}</p>
        <p
          ref={passage}
          tabIndex={-1}
          data-cited={active}
          className="kit-grounded-passage kit-type-lead">
          {evidence}
        </p>
      </article>
      <article className="kit-grounded-answer" aria-label="Question and answer">
        <p className="kit-type-label">Question</p>
        <h2 className="kit-type-title">{question}</h2>
        {phase === 0 ? (
          <Step at={1} effect="fade">
            {reply}
          </Step>
        ) : (
          reply
        )}
      </article>
    </div>
  );
}
