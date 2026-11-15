import { useDeckApp } from '@deckster/app-bridge/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { AgentRun } from '../../lib/agent/agent-run.tsx';
import { LAST_STEP, stepTicks, TICK_MS } from '../../lib/agent/script.ts';

/**
 * The simulated agent run, played by the slide's steps. Step 0 shows the user's message; each press
 * of the clicker plays the next move of the agent: a plan and a search, a metrics query, the
 * answer. Opened on its own (outside a deck) it plays with the arrow keys.
 */
export function App(): ReactNode {
  const { status, step: deckStep, active, brand, ready, requestSteps } = useDeckApp();
  const standalone = status === 'standalone';
  const [localStep, setLocalStep] = useState(0);
  const step = standalone ? localStep : deckStep;
  const [tick, restart] = useRunClock(step, active);
  useEffect(() => {
    requestSteps(LAST_STEP);
  }, [requestSteps]);
  useEffect(() => {
    if (status === 'connecting') {
      return undefined;
    }

    let cancelled = false;
    void document.fonts.ready.then(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          ready();
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [status, ready, brand]);
  useEffect(() => {
    if (!standalone) {
      return undefined;
    }

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowRight') {
        setLocalStep((value) => Math.min(value + 1, LAST_STEP));
      } else if (event.key === 'ArrowLeft') {
        setLocalStep((value) => Math.max(value - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [standalone]);
  return <AgentRun step={step} tick={tick} onReplay={restart} paused={!active} />;
}

/**
 * The clock that plays a step: it runs from 0 to the step's length one tick at a time while the
 * slide is on screen, and pauses while it is not. Moving forward one step plays that step; jumping
 * anywhere else shows the finished frame.
 *
 * @param step - The step to show.
 * @param active - Whether the slide is on screen.
 * @returns The tick within the step, and a function that plays the step again.
 */
function useRunClock(step: number, active: boolean): [number, () => void] {
  const [tick, setTick] = useState(() => stepTicks(step));
  const previous = useRef(step);
  useEffect(() => {
    const forward = step === previous.current + 1;
    previous.current = step;
    setTick(forward ? 0 : stepTicks(step));
  }, [step]);
  useEffect(() => {
    if (!active || tick >= stepTicks(step)) {
      return undefined;
    }

    const timer = setTimeout(() => setTick((value) => value + 1), TICK_MS);
    return () => clearTimeout(timer);
  }, [active, tick, step]);
  const restart = useCallback(() => setTick(0), []);
  return [tick, restart];
}
