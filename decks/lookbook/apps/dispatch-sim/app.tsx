import { useDeckApp } from '@deckster/app-bridge/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { FlockBoard } from '../../lib/dispatch-sim/flock-board.tsx';
import { LAST_STEP, STEP_TICKS, TICK_MS } from '../../lib/dispatch-sim/script.ts';
import { ErrorBoundary } from './error-boundary.tsx';

/**
 * The app: Dispatch's view of one batch, played by the slide's steps. A render error shows a
 * message and tells the deck, which shows the poster instead.
 */
export function App(): ReactNode {
  const { error } = useDeckApp();
  return (
    <ErrorBoundary onError={error}>
      <Simulation />
    </ErrorBoundary>
  );
}

/**
 * The scripted batch. Step 0 shows the drops waiting; each press of the clicker plays the next
 * move: Flock batches them into loops, the route solver draws the routes, the riders leave. It is a
 * fixed script with no network, the same on every run. Opened on its own (outside a deck) it plays
 * with the arrow keys.
 */
function Simulation(): ReactNode {
  const { status, step: deckStep, active, brand, ready, requestSteps } = useDeckApp();
  const standalone = status === 'standalone';
  const localStep = useArrowKeySteps(standalone);
  const step = standalone ? localStep : deckStep;
  const tick = useStepClock(step, active);

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

  return <FlockBoard step={step} tick={tick} paused={!active} />;
}

/**
 * The step the arrow keys pick when the app is opened on its own, outside a deck: right goes
 * forward and left goes back, within the simulation's steps. Inside a deck it listens to nothing
 * and stays at 0, since the deck sends the step.
 *
 * @param standalone - Whether the app runs outside a deck.
 * @returns The step chosen with the keys.
 */
function useArrowKeySteps(standalone: boolean): number {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!standalone) {
      return undefined;
    }

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowRight') {
        setStep((value) => Math.min(value + 1, LAST_STEP));
      } else if (event.key === 'ArrowLeft') {
        setStep((value) => Math.max(value - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [standalone]);

  return step;
}

/**
 * The clock that plays a step: it runs from 0 to `STEP_TICKS` one tick at a time while the slide is
 * on screen, and pauses while it is not. Moving forward one step plays that step; jumping anywhere
 * else shows the finished frame.
 *
 * @param step - The step to show.
 * @param active - Whether the slide is on screen.
 * @returns The tick within the step.
 */
function useStepClock(step: number, active: boolean): number {
  const [tick, setTick] = useState(STEP_TICKS);
  const previous = useRef(step);
  useEffect(() => {
    const forward = step === previous.current + 1;
    previous.current = step;
    setTick(forward ? 0 : STEP_TICKS);
  }, [step]);
  useEffect(() => {
    if (!active || tick >= STEP_TICKS) {
      return undefined;
    }

    const timer = setTimeout(() => setTick((value) => value + 1), TICK_MS);
    return () => clearTimeout(timer);
  }, [active, tick]);

  return tick;
}
