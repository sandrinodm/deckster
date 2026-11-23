import type { ReactNode } from 'react';

import {
  STEPS,
  viewAt,
  type RunItem,
  type RunPhase,
  type RunView,
  type ToolCall,
} from './script.ts';
import './agent-run.css';

/**
 * Milliseconds represented by one second in the trace's elapsed-time display.
 */
const MILLISECONDS_PER_SECOND = 1000;

/**
 * Props of {@link AgentRun}.
 */
export type AgentRunProps = {
  /**
   * The slide step the run has reached, from 0.
   */
  step: number;

  /**
   * Ticks played within the step; the step's full length for a finished frame, which is what a
   * poster shows.
   */
  tick: number;

  /**
   * Starts the current step again; the replay button shows only when this is given.
   */
  onReplay?: () => void;

  /**
   * Whether the run is paused because its slide is off screen; set as `data-paused`.
   */
  paused?: boolean;
};

/**
 * What the status pill says for each phase.
 */
const PHASE_LABELS: Readonly<Record<RunPhase, string>> = {
  idle: 'Ready',
  thinking: 'Thinking',
  calling: 'Calling a tool',
  answering: 'Answering',
  done: 'Done',
};

/**
 * The simulated agent run: a conversation with streamed text and tool-call cards beside a trace of
 * what the agent did. Every color, radius, font and shadow comes from the brand's custom
 * properties, which the deck sets on a slide and the bridge sets in the app's frame, so the run
 * follows the brand in both. The deck draws it as a poster and the mini app plays it.
 */
export function AgentRun({ step, tick, onReplay, paused = false }: AgentRunProps): ReactNode {
  const view = viewAt(step, tick);
  return (
    <div className="ag" data-phase={view.phase} data-paused={paused}>
      <section className="ag-chat">
        <header className="ag-head">
          <span className="ag-avatar" aria-hidden="true">
            <SparkIcon />
          </span>
          <div className="ag-who">
            <strong>Deck agent</strong>
            <span>Scripted run, no model</span>
          </div>
          <span className="ag-status" data-phase={view.phase}>
            <i />
            {PHASE_LABELS[view.phase]}
          </span>
        </header>
        <div className="ag-thread">{groupItems(view.items).map(renderGroup)}</div>
        <footer className="ag-composer">
          <span className="ag-input">Message the agent</span>
          {onReplay === undefined ? null : (
            <button type="button" className="ag-replay" onClick={onReplay}>
              Replay step
            </button>
          )}
        </footer>
      </section>
      <Trace view={view} />
    </div>
  );
}

/**
 * Consecutive items of the same kind, so tool calls sit in one row.
 */
type ItemGroup = { key: string; tools: boolean; items: RunItem[] };

/**
 * Groups consecutive tool calls; every other item stands alone.
 *
 * @param items - The conversation.
 */
function groupItems(items: readonly RunItem[]): ItemGroup[] {
  const groups: ItemGroup[] = [];
  for (const item of items) {
    const previous = groups.at(-1);
    if (item.kind === 'tool' && previous?.tools === true) {
      previous.items.push(item);
      continue;
    }

    groups.push({
      key: `${item.kind}-${groups.length}`,
      tools: item.kind === 'tool',
      items: [item],
    });
  }

  return groups;
}

/**
 * Draws one group of the conversation.
 *
 * @param group - A single message or a row of tool calls.
 */
function renderGroup(group: ItemGroup): ReactNode {
  if (group.tools) {
    return (
      <div key={group.key} className="ag-tools">
        {group.items.map((item) =>
          item.kind === 'tool' ? <ToolCard key={item.call.id} {...item} /> : null,
        )}
      </div>
    );
  }

  const [item] = group.items;
  if (item?.kind === 'user') {
    return (
      <p key={group.key} className="ag-user">
        {item.text}
      </p>
    );
  }

  if (item?.kind === 'say') {
    return (
      <p
        key={group.key}
        className={item.final ? 'ag-say ag-answer' : 'ag-say'}
        data-streaming={item.streaming}>
        {item.text}
      </p>
    );
  }

  return null;
}

/**
 * A tool call: its name, arguments and, once it returns, its duration and result.
 */
function ToolCard({ call, state }: { call: ToolCall; state: 'running' | 'done' }): ReactNode {
  return (
    <article className="ag-tool" data-state={state} data-color={call.color}>
      <header>
        <ToolIcon color={call.color} />
        <code>{call.name}</code>
        <span className="ag-chip">
          {state === 'running' ? <i className="ag-spinner" aria-hidden="true" /> : <CheckIcon />}
          {state === 'running' ? 'running' : `${call.ms} ms`}
        </span>
      </header>
      <code className="ag-args">{call.args}</code>
      <p className="ag-result">{state === 'done' ? call.result : ' '}</p>
    </article>
  );
}

/**
 * The trace beside the conversation: one row per beat of the run, then the counters.
 */
function Trace({ view }: { view: RunView }): ReactNode {
  const beats = STEPS.flat();
  return (
    <aside className="ag-trace">
      <h2>Run trace</h2>
      {/* The rows are divs because `deckster lint` counts every <li> in a slide as a bullet. */}
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
      <div className="ag-steps" role="list">
        {beats.map((beat, index) => {
          const item = view.items[index];
          return (
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
            <div key={index} role="listitem" data-state={traceState(item)}>
              <i aria-hidden="true" />
              <span>
                {beat.kind === 'tool'
                  ? beat.call.name
                  : traceLabel(beat.kind, beat.kind === 'say' && beat.final)}
              </span>
              {beat.kind === 'tool' && item?.kind === 'tool' && item.state === 'done' ? (
                <em>{beat.call.ms} ms</em>
              ) : null}
            </div>
          );
        })}
      </div>
      <dl>
        <div>
          <dt>Tools</dt>
          <dd>{view.toolsDone}/2</dd>
        </div>
        <div>
          <dt>Tokens</dt>
          <dd>{view.tokens}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{(view.elapsedMs / MILLISECONDS_PER_SECOND).toFixed(1)} s</dd>
        </div>
      </dl>
    </aside>
  );
}

/**
 * The name of a beat in the trace.
 *
 * @param kind - The beat kind.
 * @param final - Whether the beat is the final answer.
 */
function traceLabel(kind: 'user' | 'say' | 'tool', final: boolean): string {
  if (kind === 'user') {
    return 'Message received';
  }

  return final ? 'Final answer' : 'Plan';
}

/**
 * Where a beat stands in the trace.
 *
 * @param item - The conversation item the beat produced so far, if any.
 */
function traceState(item: RunItem | undefined): 'pending' | 'active' | 'done' {
  if (item === undefined) {
    return 'pending';
  }

  if (item.kind === 'say') {
    return item.streaming ? 'active' : 'done';
  }

  return item.kind === 'tool' && item.state === 'running' ? 'active' : 'done';
}

/**
 * The agent's mark: a four-point spark.
 */
function SparkIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3c.6 4.8 3.2 7.4 8 8-4.8.6-7.4 3.2-8 8-.6-4.8-3.2-7.4-8-8 4.8-.6 7.4-3.2 8-8Z" />
    </svg>
  );
}

/**
 * A tool's icon: a magnifier for the first tool, a bar chart for the second.
 *
 * @param color - The tool's data color number.
 */
function ToolIcon({ color }: { color: number }): ReactNode {
  return (
    <svg className="ag-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
      {color === 1 ? (
        <>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4.2-4.2" />
        </>
      ) : (
        <>
          <path d="M5 20V11M12 20V4M19 20v-6" />
        </>
      )}
    </svg>
  );
}

/**
 * A check mark for a finished tool call.
 */
function CheckIcon(): ReactNode {
  return (
    <svg className="ag-check" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}
