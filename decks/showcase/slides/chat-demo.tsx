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
  title: 'Ask for a change beside the slide',
  eyebrow: 'Scripted replay, no model',
  budget: '2m',
};

/**
 * A scripted turn of the chat agent in its own frame. Each step of the slide plays one move of the
 * run; the poster is the same run, drawn by the deck, at the step the slide shows, so exports and
 * screenshots show every step.
 */
export default function ChatDemo(): ReactNode {
  return (
    <>
      <AppFrame
        app="agent-chat"
        chrome="window"
        title="Deck agent"
        alt="A scripted agent turn: a request, two tool calls, then the answer"
        steps={LAST_STEP}
        poster={({ step }) => <AgentRun step={step} tick={stepTicks(step)} />}
      />
      <Notes>
        This is a mini app in its own frame, replaying a turn from a fixed script: no model, no
        network, the same every time. The request is already typed. [click] The agent asks which
        slide is on screen. [click] It runs the linter on that slide. [click] And it answers: the
        title is shorter, the file it touched, and nothing new from the linter. The real panel docks
        beside the slide when the dev server starts with an agent, and it talks to Claude or Codex.
        If the frame fails, the poster is the same run drawn by the deck. Transition: what does the
        designer make of all this?
      </Notes>
    </>
  );
}
