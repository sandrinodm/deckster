import { useSlide, useStatic } from '@deckster/engine';
import { createContext, useContext } from 'react';

import type { RevealState } from '#charts/frame/chart-step.tsx';

/**
 * The reveal state of the nearest `<Step>` around a component, so content inside one (a stat that
 * counts up) can play when the step is revealed rather than when the slide arrives; `undefined`
 * outside a step.
 */
export const RevealContext = createContext<RevealState | undefined>(undefined);

/**
 * Whether the nearest `<Step>` around the calling component has not revealed it yet. Media that
 * plays by itself (a Lottie animation, a video) waits while this is `true`, so it starts when its
 * step is reached instead of playing out unseen while the slide waits for the click.
 *
 * @returns `true` inside a step that is still hidden; `false` outside a step or once it shows.
 */
export function useHeldByStep(): boolean {
  return useContext(RevealContext) === 'hidden';
}

/**
 * Whether motion must stay still where the calling component renders: in static mode, where shots,
 * lint and exports need finished frames, and in a `SlideView` copy (thumbnails, presenter panes),
 * which shows the slide without playing it. Reduced motion is the stylesheet's and the animating
 * component's to check, since it can change while a slide is on screen.
 *
 * @returns `true` when nothing may move.
 * @throws Error when called outside a slide.
 */
export function useStillMotion(): boolean {
  const isStatic = useStatic();
  const { state } = useSlide();
  return isStatic || state === undefined;
}
