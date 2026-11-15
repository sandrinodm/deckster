/**
 * A streamed word with its trailing whitespace, so partial output keeps its original spacing.
 */
const STREAMED_WORD_PATTERN = /\S+\s*/g;

/**
 * One tool the scripted agent calls.
 */
export type ToolCall = {
  /**
   * A stable id, used as the element key.
   */
  id: string;

  /**
   * The tool's name, as an agent framework would list it.
   */
  name: string;

  /**
   * The arguments the agent passes, as one line of text.
   */
  args: string;

  /**
   * What the tool returns, as a sentence.
   */
  result: string;

  /**
   * How long the call took, in milliseconds.
   */
  ms: number;

  /**
   * Which of the brand's categorical data colors marks the tool, from 1.
   */
  color: number;
};

/**
 * One thing that happens in the run.
 */
export type Beat =
  | {
      /**
       * The user's message.
       */
      kind: 'user';

      /**
       * What the user wrote.
       */
      text: string;
    }
  | {
      /**
       * Text the agent streams word by word.
       */
      kind: 'say';

      /**
       * A stable id, used as the element key.
       */
      id: string;

      /**
       * What the agent says.
       */
      text: string;

      /**
       * Whether this is the final answer rather than narration between tool calls.
       */
      final: boolean;
    }
  | {
      /**
       * A tool call that runs and returns.
       */
      kind: 'tool';

      /**
       * The call.
       */
      call: ToolCall;
    };

/**
 * How long one clock tick is, in milliseconds: one streamed word, or a fourteenth of a tool call.
 */
export const TICK_MS = 55;

/**
 * Ticks a tool call spends running before it returns its result.
 */
export const TOOL_TICKS = 14;

/**
 * The run, one list of beats per slide step. Step 0 is the user's message alone; each later step is
 * one move of the agent. It is a fixed script: no model, no network, the same on every run.
 */
export const STEPS: readonly (readonly Beat[])[] = [
  [
    {
      kind: 'user',
      text: 'The title on this slide runs to three lines. Shorten it.',
    },
  ],
  [
    {
      kind: 'say',
      id: 'plan',
      final: false,
      text: 'First the slide on screen, then what the linter says about it.',
    },
    {
      kind: 'tool',
      call: {
        id: 'slide',
        name: 'current_slide',
        args: 'no arguments',
        result: 'review-rounds, chart layout, step 0.',
        ms: 12,
        color: 1,
      },
    },
  ],
  [
    {
      kind: 'tool',
      call: {
        id: 'lint',
        name: 'deck_lint',
        args: 'slide: "review-rounds"',
        result: 'content-budget: the title is over the limit.',
        ms: 840,
        color: 2,
      },
    },
  ],
  [
    {
      kind: 'say',
      id: 'answer',
      final: true,
      text:
        'The title is now "Review rounds fell from five to two", one line in both brands. ' +
        'I edited slides/review-rounds.mdx and the linter reports nothing new.',
    },
  ],
];

/**
 * The last step of the run; the app asks the deck for this many steps.
 */
export const LAST_STEP = STEPS.length - 1;

/**
 * Splits streamed text into words, each keeping the space that follows it.
 *
 * @param text - Any text.
 */
export function words(text: string): string[] {
  return text.match(STREAMED_WORD_PATTERN) ?? [];
}

/**
 * The clock ticks one beat takes to play out.
 *
 * @param beat - A beat.
 */
function beatTicks(beat: Beat): number {
  switch (beat.kind) {
    case 'user':
      return 0;
    case 'say':
      return words(beat.text).length;
    case 'tool':
      return TOOL_TICKS;
  }
}

/**
 * The clock ticks a step takes to play out.
 *
 * @param step - A step of the run; a value past the last step counts as the last.
 */
export function stepTicks(step: number): number {
  const beats = STEPS[Math.min(Math.max(step, 0), LAST_STEP)] ?? [];
  return beats.reduce((total, beat) => total + beatTicks(beat), 0);
}

/**
 * One line of the conversation as it looks at a moment of the run.
 */
export type RunItem =
  | {
      /**
       * The user's message.
       */
      kind: 'user';

      /**
       * What the user wrote.
       */
      text: string;
    }
  | {
      /**
       * Agent text.
       */
      kind: 'say';

      /**
       * The element key.
       */
      id: string;

      /**
       * The words shown so far.
       */
      text: string;

      /**
       * Whether the text is still streaming.
       */
      streaming: boolean;

      /**
       * Whether this is the final answer.
       */
      final: boolean;
    }
  | {
      /**
       * A tool call.
       */
      kind: 'tool';

      /**
       * The call.
       */
      call: ToolCall;

      /**
       * `running` until the result arrives.
       */
      state: 'running' | 'done';
    };

/**
 * What the agent is doing, for the header's status.
 */
export type RunPhase = 'idle' | 'thinking' | 'calling' | 'answering' | 'done';

/**
 * The run at one moment: the conversation so far, what the agent is doing and the counters.
 */
export type RunView = {
  /**
   * The conversation, oldest first.
   */
  items: RunItem[];

  /**
   * What the agent is doing now.
   */
  phase: RunPhase;

  /**
   * Tool calls that have returned.
   */
  toolsDone: number;

  /**
   * Tokens the agent has produced, estimated from its words.
   */
  tokens: number;

  /**
   * Milliseconds the run has taken so far.
   */
  elapsedMs: number;
};

/**
 * The tokens a word costs, on average.
 */
const TOKENS_PER_WORD = 1.3;

/**
 * Tokens a tool call costs to describe and read back.
 */
const TOKENS_PER_TOOL = 24;

/**
 * The phase while a line of text is streaming, or `undefined` once it is complete.
 *
 * @param streaming - Whether the text is still streaming.
 * @param final - Whether the text is the final answer.
 */
function streamingPhase(streaming: boolean, final: boolean): RunPhase | undefined {
  if (!streaming) {
    return undefined;
  }

  return final ? 'answering' : 'thinking';
}

/**
 * The run as it looks `tick` ticks into `step`. Earlier steps are complete; `tick` counts only
 * within the step, so a step that is not being played passes its own `stepTicks`.
 *
 * @param step - The slide step, from 0.
 * @param tick - Ticks played within the step; clamped to the step's length.
 */
export function viewAt(step: number, tick: number): RunView {
  const last = Math.min(Math.max(step, 0), LAST_STEP);
  const items: RunItem[] = [];
  let busy: RunPhase | undefined;
  let tokens = 0;
  let elapsedMs = 0;
  for (let index = 0; index <= last; index += 1) {
    let remaining = index === last ? Math.max(tick, 0) : Number.POSITIVE_INFINITY;
    for (const beat of STEPS[index] ?? []) {
      const total = beatTicks(beat);
      if (beat.kind === 'user') {
        items.push({ kind: 'user', text: beat.text });
        continue;
      }

      if (remaining <= 0 && index === last) {
        busy = 'thinking';
        break;
      }

      const played = Math.min(remaining, total);
      remaining -= played;
      elapsedMs += played * TICK_MS;
      if (beat.kind === 'say') {
        const shown = words(beat.text).slice(0, played);
        tokens += Math.round(shown.length * TOKENS_PER_WORD);
        const streaming = played < total;
        items.push({
          kind: 'say',
          id: beat.id,
          text: shown.join('').trimEnd(),
          streaming,
          final: beat.final,
        });
        busy = streamingPhase(streaming, beat.final) ?? busy;
        continue;
      }

      const done = played >= total;
      items.push({ kind: 'tool', call: beat.call, state: done ? 'done' : 'running' });
      tokens += done ? TOKENS_PER_TOOL : 0;
      busy = done ? busy : 'calling';
    }
  }

  const toolsDone = items.filter((item) => item.kind === 'tool' && item.state === 'done').length;
  const finished = last === LAST_STEP && tick >= stepTicks(LAST_STEP);
  const phase = busy ?? (finished ? 'done' : 'idle');
  return { items, phase, toolsDone, tokens, elapsedMs };
}
