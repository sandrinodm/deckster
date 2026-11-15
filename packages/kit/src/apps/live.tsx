import { useSlide, useStatic, useStep } from '@deckster/engine';
import { createElement, useRef, type ComponentType, type ReactNode } from 'react';

import { AppErrorBoundary } from '#apps/app-error-boundary.tsx';
import { PosterView, type Poster } from '#apps/app-poster.tsx';
import { useKeyCapture } from '#apps/interactive-region.ts';
import { ReleaseHint } from '#apps/release-hint.tsx';
import { checkComponentProps } from '#components/check-component-props.ts';

/**
 * Props of {@link Live}.
 */
export type LiveProps<Props extends object = object> = {
  /**
   * The React component to host. Give this or `children`.
   */
  component?: ComponentType<Props>;

  /**
   * The props passed to `component`.
   */
  props?: Props;

  /**
   * The widget as JSX, instead of `component`.
   */
  children?: ReactNode;

  /**
   * What static mode, `deck shot` and exports show instead of the running widget: an image URL, or
   * a function that renders it (it gets the slide's step). Without it the widget itself renders in
   * static mode, which is right only for a widget with no timers, fetches or randomness.
   */
  poster?: Poster;

  /**
   * What the widget shows, for people who cannot see it; the poster image's alt text.
   */
  alt?: string;

  /**
   * `adjacent` (default) mounts the widget as soon as its slide is on the stage, so it is ready
   * when the slide arrives; `active` mounts it only on the slide on screen. Either way, read
   * `useSlide().isActive` in the widget to pause work while the slide is not on screen.
   */
  mount?: 'adjacent' | 'active';

  /**
   * What the region is called to assistive technology.
   */
  label?: string;
};

/**
 * Hosts a React component inline in the slide, inside an error boundary with a branded fallback. It
 * is marked interactive: clicks and keys inside it do not move the deck. Once the user focuses
 * something inside, the keyboard is the widget's until Escape, and a subtle "Esc to return" hint
 * shows. In static mode, exports and screenshots it draws the `poster` instead of the widget.
 *
 * ```mdx
 * <Live component={Counter} poster="../assets/counter.png" alt="The counter at 3" />
 * ```
 */
export function Live<Props extends object = object>(props: LiveProps<Props>): ReactNode {
  checkComponentProps('Live', props);
  const { component, children, poster, alt = '', mount = 'adjacent', label } = props;
  if (component !== undefined && children !== undefined) {
    throw new Error('<Live> takes a `component` or children, not both.');
  }

  const slide = useSlide();
  const isStatic = useStatic();
  const step = useStep();
  const root = useRef<HTMLDivElement | null>(null);
  const capture = useKeyCapture(root);
  const isOnStage = slide.state !== undefined;
  const showsPoster = poster !== undefined && (isStatic || !isOnStage);
  const mountWanted = slide.isActive || mount === 'adjacent';
  const mounted = !showsPoster && (isStatic || (isOnStage && mountWanted));
  const widget = component === undefined ? children : createElement(component, props.props ?? null);
  return (
    // The region traps keys by design: it is a focus scope, not a control.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      ref={root}
      className="kit-live"
      data-deck-interactive=""
      data-live-state={mounted ? 'mounted' : 'poster'}
      data-interacting={capture.interacting}
      aria-label={label}
      {...capture.props}>
      {mounted ? (
        <AppErrorBoundary subject="This widget" resetKey={component ?? children}>
          {widget}
        </AppErrorBoundary>
      ) : null}
      {!mounted && poster !== undefined ? (
        <PosterView poster={poster} alt={alt} step={step} />
      ) : null}
      {isStatic ? null : <ReleaseHint visible={capture.interacting} />}
    </section>
  );
}
