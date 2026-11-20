import type { ReactNode } from 'react';

import { checkComponentProps } from '#components/check-component-props.ts';
import { Step } from '#motion/step.tsx';
import '#demo/demo-stories.css';

/**
 * An observed tool call, with the input and the result visible.
 */
export type DemoToolCall = {
  /**
   * The name of the tool that was called.
   */
  tool: string;

  /**
   * The parameters or record looked up.
   */
  input: string;

  /**
   * The information the call returned.
   */
  observation: string;
};

/**
 * A finished run with two calls and one human checkpoint.
 */
export type RunTraceProps = {
  /**
   * The user's instruction to the assistant.
   */
  instruction: string;

  /**
   * Two calls in execution order, each with its own observation.
   */
  calls: readonly [DemoToolCall, DemoToolCall];

  /**
   * The pending human action that protects an external operation.
   */
  checkpoint: string;

  /**
   * The artifact or draft created during the run.
   */
  outcome: string;

  /**
   * Whether the two calls and then the checkpoint appear on deck advances.
   */
  reveal?: boolean;
};

/**
 * Progressively exposes observable tool calls and stops at the stated human checkpoint.
 */
export function RunTrace(props: RunTraceProps): ReactNode {
  checkComponentProps('RunTrace', props);
  const { instruction, calls, checkpoint, outcome, reveal = true } = props;
  return (
    <div className="kit-demo-story kit-trace-story">
      <header className="kit-trace-task">
        <p className="kit-demo-status kit-type-label">Task</p>
        <h2 className="kit-type-title">{instruction}</h2>
      </header>
      <section className="kit-trace-route" aria-label="Run activity">
        {calls.map((call, index) => (
          <div key={index}>
            <TraceBeat at={index + 1} reveal={reveal}>
              <ToolCall call={call} />
            </TraceBeat>
          </div>
        ))}
        <div>
          <TraceBeat at={calls.length + 1} reveal={reveal}>
            <section className="kit-trace-checkpoint" aria-label="Run stopped for human approval">
              <div className="kit-trace-gate">
                <span className="kit-trace-stop" aria-hidden="true" data-decorative="" />
                <div>
                  <p className="kit-demo-status kit-type-label">Human checkpoint</p>
                  <h3 className="kit-type-lead">{checkpoint}</h3>
                </div>
              </div>
              <div className="kit-trace-draft">
                <p className="kit-type-label">Prepared draft</p>
                <p className="kit-type-body">{outcome}</p>
              </div>
            </section>
          </TraceBeat>
        </div>
      </section>
    </div>
  );
}

/**
 * Draws an operation and its observation in one linked step.
 */
function ToolCall({ call }: { call: DemoToolCall }): ReactNode {
  return (
    <section className="kit-trace-node">
      <div className="kit-trace-tool">
        <p className="kit-demo-status kit-type-label">Tool call</p>
        <h3 className="kit-type-code">{call.tool}</h3>
        <p className="kit-type-small">{call.input}</p>
      </div>
      <span className="kit-trace-down" aria-hidden="true">
        ↓
      </span>
      <div className="kit-trace-observation">
        <p className="kit-type-label">Returned</p>
        <p className="kit-type-body">{call.observation}</p>
      </div>
    </section>
  );
}

/**
 * Reserves geometry while revealing a link in the run.
 */
function TraceBeat({
  at,
  reveal,
  children,
}: {
  at: number;
  reveal: boolean;
  children: ReactNode;
}): ReactNode {
  return reveal ? (
    <Step at={at} effect="fade">
      {children}
    </Step>
  ) : (
    children
  );
}
