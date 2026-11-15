import type { ReactNode } from 'react';

import { Notes } from '@deckster/engine';
import { AppFrame } from '@deckster/kit';

import { AgentRun } from '../lib/agent/agent-run.tsx';
import { LAST_STEP, stepTicks } from '../lib/agent/script.ts';

/**
 * Read by the build without running the slide, so it must stay a literal.
 */
export const frontmatter = {
  layout: 'demo',
  title: 'An agent checks two sources, then answers',
  eyebrow: 'Agent demo',
  budget: '2m',
};

/**
 * The scripted agent in its own frame. Each step of the slide plays one move of the run; the poster
 * is the same run, drawn by the deck, at the step the slide shows, so exports and screenshots show
 * every step.
 */
export default function AgentSlide(): ReactNode {
  return (
    <>
      <AppFrame
        app="agent-demo"
        chrome="window"
        title="Ops console"
        alt="A scripted agent run: a question, two tool calls, then the answer"
        steps={LAST_STEP}
        poster={({ step }) => <AgentRun step={step} tick={stepTicks(step)} />}
      />
      <Notes>
        Press next to play each move: the agent plans and searches the runbooks, queries the
        metrics, then answers. It is a fixed script, so it works offline and plays the same every
        time. Click inside to use the app yourself; Escape returns the keyboard to the deck.
      </Notes>
    </>
  );
}
