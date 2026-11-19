import { defineLayout, useSlide, useStatic, type LayoutProps } from '@deckster/engine';
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';

import type {
  ChoosePathBranch,
  choosePathLayoutContract,
} from '#layouts/choose-path-layout.contract.ts';

import { useFitLevel } from '#foundation/fit-level.ts';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import '#layouts/choose-path-layout.css';

/**
 * The regular and compact poster sizes, using each brand's corresponding type roles.
 */
const POSTER_TYPE_LEVELS = [
  { prompt: 'lead', title: 'title', detail: 'body' },
  { prompt: 'body', title: 'lead', detail: 'small' },
] as const;

/**
 * A presenter can pick either of the two authored workflows.
 */
type BranchIndex = 0 | 1;

/**
 * Where the presenter is in the demo, including the choice to return focus to.
 */
type DemoState =
  | { page: 'choices'; previous?: BranchIndex }
  | { page: 'workflow'; branch: BranchIndex; step: number };

/**
 * The common prompt and two workflows shared by the interactive view and its poster.
 */
type DemoProps = {
  /**
   * The prompt that starts the decision.
   */
  prompt: string;

  /**
   * The two authored workflows in presentation order.
   */
  branches: readonly [ChoosePathBranch, ChoosePathBranch];
};

/**
 * Presents a fresh interactive demo on the active slide and a complete poster elsewhere.
 */
function ChoosePathLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof choosePathLayoutContract>): ReactNode {
  const { eyebrow, title, prompt, branches } = frontmatter;
  const slide = useSlide();
  const isStatic = useStatic();
  const region = useRef<HTMLDivElement>(null);
  const interactive = !isStatic && slide.isActive && slide.state === 'current';
  return (
    <Frame layout="choose-path">
      <SlideHeader eyebrow={eyebrow} title={title} />
      <Region ref={region} className="kit-choose-region">
        {interactive ? (
          <InteractiveDemo prompt={prompt} branches={branches} />
        ) : (
          <DemoPoster prompt={prompt} branches={branches} region={region} />
        )}
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The choose-your-path runtime layout with an offline, control-free export.
 */
export const choosePathLayout = defineLayout<typeof choosePathLayoutContract>({
  name: 'choose-path',
  component: ChoosePathLayout,
});

/**
 * Shows either the choices or a workflow. Each action moves focus to its resulting view; returning
 * puts keyboard and screen reader focus back on the choice that opened the workflow.
 */
function InteractiveDemo({ prompt, branches }: DemoProps): ReactNode {
  const [view, setView] = useState<DemoState>({ page: 'choices' });
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const firstChoice = useRef<HTMLButtonElement>(null);
  const secondChoice = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (view.page === 'workflow') {
      heading.current?.focus({ preventScroll: true });
    } else if (view.previous !== undefined) {
      const button = view.previous === 0 ? firstChoice : secondChoice;
      button.current?.focus({ preventScroll: true });
    }
  }, [view]);

  return (
    <section className="kit-choose-demo" aria-labelledby={titleId} data-deck-interactive="">
      {view.page === 'choices' ? (
        <>
          <h2 id={titleId} className="kit-choose-prompt kit-type-lead">
            {smartPunctuation(prompt)}
          </h2>
          <div className="kit-choose-pair">
            <Choice
              branch={branches[0]}
              buttonRef={firstChoice}
              choose={() => setView({ page: 'workflow', branch: 0, step: 0 })}
            />
            <Choice
              branch={branches[1]}
              buttonRef={secondChoice}
              choose={() => setView({ page: 'workflow', branch: 1, step: 0 })}
            />
          </div>
        </>
      ) : (
        <Workflow
          branch={branches[view.branch]}
          stepIndex={view.step}
          headingId={titleId}
          headingRef={heading}
          advance={() => setView({ ...view, step: view.step + 1 })}
          back={() => setView({ page: 'choices', previous: view.branch })}
        />
      )}
    </section>
  );
}

/**
 * The button and the scenario it describes.
 */
type ChoiceProps = {
  /**
   * The workflow the choice opens.
   */
  branch: ChoosePathBranch;

  /**
   * The button that gets focus after returning to the choices.
   */
  buttonRef: Ref<HTMLButtonElement>;

  /**
   * Changes the current demo view to this workflow.
   */
  choose: () => void;
};

/**
 * Presents one scenario as a button with an accessible description.
 */
function Choice({ branch, buttonRef, choose }: ChoiceProps): ReactNode {
  const situationId = useId();
  return (
    <button
      ref={buttonRef}
      type="button"
      className="kit-choose-card kit-choose-choice"
      aria-label={smartPunctuation(branch.name)}
      aria-describedby={situationId}
      onClick={choose}>
      <span className="kit-choose-name kit-type-title">{smartPunctuation(branch.name)}</span>
      <span id={situationId} className="kit-choose-situation kit-type-body">
        {smartPunctuation(branch.situation)}
      </span>
      <span className="kit-choose-arrow" aria-hidden="true">
        →
      </span>
    </button>
  );
}

/**
 * Props of the current workflow view and the controls that change it.
 */
type WorkflowProps = {
  /**
   * The authored branch that was chosen.
   */
  branch: ChoosePathBranch;

  /**
   * Zero-based current action, or the action count for the outcome.
   */
  stepIndex: number;

  /**
   * Heading used to name the active interactive region.
   */
  headingId: string;

  /**
   * Receives focus when an action changes the demo.
   */
  headingRef: Ref<HTMLHeadingElement>;

  /**
   * Completes the current action.
   */
  advance: () => void;

  /**
   * Returns to both scenarios.
   */
  back: () => void;
};

/**
 * Shows the current action or the result, with a route back to the choice on every step.
 */
function Workflow({
  branch,
  stepIndex,
  headingId,
  headingRef,
  advance,
  back,
}: WorkflowProps): ReactNode {
  const action = branch.steps[stepIndex];
  const progress =
    action === undefined ? 'Outcome' : `Step ${stepIndex + 1} of ${branch.steps.length}`;
  const heading = action === undefined ? branch.outcome : action.detail;
  return (
    <div className="kit-choose-card kit-choose-workflow">
      <p className="kit-choose-progress kit-type-label">
        {smartPunctuation(branch.name)} · {progress}
      </p>
      <h2 ref={headingRef} id={headingId} tabIndex={-1} className="kit-choose-name kit-type-title">
        {smartPunctuation(heading)}
      </h2>
      <div className="kit-choose-controls">
        {action === undefined ? null : (
          <button type="button" className="kit-choose-primary kit-type-body" onClick={advance}>
            {smartPunctuation(action.action)}
          </button>
        )}
        <button type="button" className="kit-choose-back kit-type-body" onClick={back}>
          Back to choices
        </button>
      </div>
    </div>
  );
}

/**
 * Records both paths and both outcomes as selectable text in the exported slide.
 */
function DemoPoster({
  prompt,
  branches,
  region,
}: DemoProps & { region: RefObject<HTMLDivElement | null> }): ReactNode {
  const poster = useRef<HTMLDivElement>(null);
  const fitKey = JSON.stringify([prompt, branches]);
  const { level } = useFitLevel(region, poster, POSTER_TYPE_LEVELS.length, fitKey, {
    restartOnFontLoad: true,
    overflow: true,
  });
  const type = POSTER_TYPE_LEVELS[level] ?? POSTER_TYPE_LEVELS[0];
  return (
    <div
      ref={poster}
      className="kit-choose-demo"
      data-choose-poster=""
      data-compact={level > 0 ? '' : undefined}>
      <p className={`kit-choose-prompt kit-type-${type.prompt}`}>{smartPunctuation(prompt)}</p>
      <div className="kit-choose-pair">
        {branches.map((branch) => (
          <section className="kit-choose-card kit-choose-summary" key={branch.name}>
            <h2 className={`kit-choose-name kit-type-${type.title}`}>
              {smartPunctuation(branch.name)}
            </h2>
            <p className={`kit-choose-situation kit-type-${type.detail}`}>
              {smartPunctuation(branch.situation)}
            </p>
            <ol className={`kit-choose-actions kit-type-${type.detail}`}>
              {branch.steps.map((step, index) => (
                <li key={index}>{smartPunctuation(step.action)}</li>
              ))}
            </ol>
            <p className={`kit-choose-outcome kit-type-${type.detail}`}>
              <strong>Outcome</strong> {smartPunctuation(branch.outcome)}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
