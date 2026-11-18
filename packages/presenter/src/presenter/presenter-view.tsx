import {
  isInteractiveTarget,
  neighbourShownSlide,
  SlideView,
  useDeck,
  type DeckControls,
} from '@deckster/engine';
import {
  useEffect,
  useState,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

import { formatDuration, formatRemaining, formatSigned } from '#presenter/format-clock.ts';
import { NotesPanel } from '#presenter/notes-panel.tsx';
import { computePacing, type Pacing } from '#presenter/pacing.ts';
import { useTimer, type TimerControls } from '#presenter/use-timer.ts';
import { navigationMove, runNavigation } from '#shortcuts/navigation-keys.ts';
import { updateUi, useUiState, type BlackoutMode } from '#ui/ui-state.ts';

/**
 * Converts a fraction of the pane to a CSS percentage.
 */
const PERCENT = 100;

/**
 * What the next pane shows.
 */
type NextView = {
  /**
   * The zero-based slide.
   */
  slide: number;

  /**
   * The step.
   */
  step: number;

  /**
   * Whether it is a later step of the same slide, rather than the next slide.
   */
  isStep: boolean;
};

/**
 * The presenter window, shown instead of the stage when the page is opened with `?presenter`: the
 * current slide, what comes next, speaker notes, the timer, the wall clock and pacing against the
 * slide budgets. Every pane is a `SlideView`, so it needs nothing from the deck's own stage; the
 * current pane is not inert, so it reports the slide's step count as the stage would.
 *
 * A presenter with a clicker must never get stuck: Space, the arrows and PageUp/PageDown always
 * navigate here, whatever button was clicked last, unless focus is in a text field or a modal panel
 * is open. Enter still presses the focused button.
 */
export function PresenterView(): ReactNode {
  const deck = useDeck();
  const timer = useTimer(deck.manifest.id);
  const { laser } = useUiState();
  const { slide } = deck.position;
  const current = deck.slides[slide];
  const next = nextView(deck);
  const slideElapsedSeconds = useSlideElapsed(slide, timer.elapsedSeconds);
  const pacing = computePacing({
    budgets: deck.slides.map((entry) => entry.budget),
    hidden: deck.slides.map((entry) => entry.hidden),
    slide,
    elapsedSeconds: timer.elapsedSeconds,
    slideElapsedSeconds,
    started: timer.running || timer.elapsedSeconds > 0,
    durationSeconds: deck.manifest.durationSeconds,
  });
  useEffect(() => {
    document.title = `Presenter: ${deck.manifest.title}`;
  }, [deck.manifest.title]);

  /**
   * Navigates on Space, arrows and PageUp/PageDown before a focused button can take them.
   */
  const onKeyDownCapture = (event: KeyboardEvent) => {
    const move = navigationMove(event.nativeEvent);
    if (move !== undefined) {
      event.preventDefault();
      runNavigation(move, deck);
    }
  };
  return (
    <div
      className="dp-ui dp-presenter"
      data-deck-interactive=""
      data-presenter-view=""
      onKeyDownCapture={onKeyDownCapture}>
      <PresenterHeader deck={deck} timer={timer} pacing={pacing} />
      <main className="dp-p-main">
        <div className="dp-p-col">
          <div>
            <div className="dp-p-label">
              <span>Current</span>
              <span>{laser ? 'Laser on: move over the slide' : ''}</span>
            </div>
            <CurrentPane deck={deck} laserOn={laser} />
          </div>
          <PacingStats pacing={pacing} duration={deck.manifest.durationSeconds} />
        </div>
        <div className="dp-p-col">
          <NextPane deck={deck} next={next} />
          <NotesPanel notes={current?.notes ?? ''} />
        </div>
      </main>
    </div>
  );
}

/**
 * Props of {@link PresenterHeader}.
 */
type PresenterHeaderProps = {
  /**
   * The deck's controls.
   */
  deck: DeckControls;

  /**
   * The talk's timer.
   */
  timer: TimerControls;

  /**
   * How the talk is going against its plan.
   */
  pacing: Pacing;
};

/**
 * The presenter header: the deck and slide count, the timer, and the pills for the audience
 * window's state, the pacing and the wall clock.
 */
function PresenterHeader({ deck, timer, pacing }: PresenterHeaderProps): ReactNode {
  const { blackout, audienceGone } = useUiState();
  const { slide, step } = deck.position;
  return (
    <header className="dp-p-head">
      <div className="dp-p-where">
        <span className="dp-p-deck">{deck.manifest.title}</span>
        <span className="dp-p-count" data-testid="slide-count">
          Slide {slide + 1} of {deck.slides.length}
          {deck.slides[slide]?.hidden === true ? ' · hidden' : ''}
          {deck.stepCount !== undefined && deck.stepCount > 1
            ? ` · step ${step} of ${deck.stepCount - 1}`
            : ''}
        </span>
      </div>
      <TimerBar timer={timer} />
      <div className="dp-p-side">
        {audienceGone ? (
          <span className="dp-pill" data-tone="warn" data-testid="audience-gone">
            Audience window closed
          </span>
        ) : null}
        {blackout === undefined ? null : (
          <span className="dp-pill" data-tone="warn">
            {blackoutText(blackout)}
          </span>
        )}
        <PacingPill pacing={pacing} />
        <span className="dp-p-clock" title="Wall clock" data-testid="wall-clock">
          {new Date(timer.now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </header>
  );
}

/**
 * Seconds on the timer since the slide came on screen. Moving to another slide, or resetting the
 * timer, starts the count again.
 *
 * @param slide - The zero-based slide on screen.
 * @param elapsedSeconds - Seconds on the timer.
 */
function useSlideElapsed(slide: number, elapsedSeconds: number): number {
  const [entered, setEntered] = useState({ slide, at: elapsedSeconds });
  if (entered.slide !== slide || elapsedSeconds < entered.at) {
    setEntered({ slide, at: elapsedSeconds });
    return 0;
  }

  return elapsedSeconds - entered.at;
}

/**
 * The timer readout and its buttons.
 */
function TimerBar({ timer }: { timer: TimerControls }): ReactNode {
  return (
    <div className="dp-p-timer">
      <span className="dp-p-elapsed" data-running={timer.running} data-testid="elapsed">
        {formatDuration(timer.elapsedSeconds)}
      </span>
      <button
        type="button"
        className="dp-button"
        data-variant={timer.running ? undefined : 'primary'}
        data-testid="timer-toggle"
        onClick={timer.toggle}>
        {timer.running ? 'Pause' : 'Start'}
      </button>
      <button type="button" className="dp-button" data-testid="timer-reset" onClick={timer.reset}>
        Reset
      </button>
    </div>
  );
}

/**
 * The pacing summary beside the clock.
 */
function PacingPill({ pacing }: { pacing: Pacing }): ReactNode {
  return (
    <span className="dp-pill" data-status={pacing.status} data-testid="pacing">
      {pacingText(pacing)}
    </span>
  );
}

/**
 * What the pacing pill says.
 *
 * @param pacing - The pacing.
 */
function pacingText(pacing: Pacing): string {
  switch (pacing.status) {
    case 'idle':
      return 'Not started';
    case 'ahead':
      return `Ahead ${formatDuration(pacing.offsetSeconds)}`;
    case 'behind':
      return `Behind ${formatDuration(pacing.offsetSeconds)}`;
    case 'on-pace':
      return 'On pace';
    case 'unplanned':
      return 'No budgets';
  }
}

/**
 * The slide's own countdown, the whole talk's remaining time and the schedule offset.
 */
function PacingStats({
  pacing,
  duration,
}: {
  pacing: Pacing;
  duration: number | undefined;
}): ReactNode {
  const { slideRemainingSeconds, totalRemainingSeconds, slideBudgetSeconds } = pacing;
  return (
    <dl className="dp-p-pace" data-testid="pacing-stats">
      <div
        className="dp-p-stat"
        title={
          slideBudgetSeconds === undefined
            ? 'This slide has no budget'
            : `This slide's budget: ${formatDuration(slideBudgetSeconds)}`
        }>
        <dt>This slide</dt>
        <dd
          data-tone={
            slideRemainingSeconds !== undefined && slideRemainingSeconds < 0 ? 'danger' : undefined
          }>
          {slideRemainingSeconds === undefined ? '—' : formatRemaining(slideRemainingSeconds)}
        </dd>
      </div>
      <div className="dp-p-stat">
        <dt>{duration === undefined ? 'Budgets left' : 'Talk left'}</dt>
        <dd
          data-tone={
            totalRemainingSeconds !== undefined && totalRemainingSeconds < 0 ? 'danger' : undefined
          }>
          {totalRemainingSeconds === undefined ? '—' : formatRemaining(totalRemainingSeconds)}
        </dd>
      </div>
      <div className="dp-p-stat">
        <dt>Schedule</dt>
        <dd data-tone={pacing.status === 'behind' ? 'danger' : undefined}>
          {pacing.status === 'unplanned' || pacing.status === 'idle'
            ? '—'
            : formatSigned(scheduleOffset(pacing))}
        </dd>
      </div>
    </dl>
  );
}

/**
 * The schedule offset with the sign a presenter expects: positive when ahead.
 *
 * @param pacing - The pacing.
 */
function scheduleOffset(pacing: Pacing): number {
  return pacing.status === 'behind' ? -pacing.offsetSeconds : pacing.offsetSeconds;
}

/**
 * The current slide. Clicking it goes forward, unless the click lands on interactive content inside
 * the slide; with the laser on, moving over it sends the point to the audience window. The pane is
 * not inert: it stands for the slide on screen and reports its step count, which this window has no
 * stage for.
 */
function CurrentPane({ deck, laserOn }: { deck: DeckControls; laserOn: boolean }): ReactNode {
  const { laserPoint } = useUiState();
  const ref = useRef<HTMLDivElement>(null);
  /**
   * The pointer as fractions of the slide pane, or `undefined` before the pane has a size.
   */
  const point = (event: PointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0) {
      return undefined;
    }

    return {
      x: clampFraction((event.clientX - box.left) / box.width),
      y: clampFraction((event.clientY - box.top) / box.height),
    };
  };

  return (
    <div
      ref={ref}
      className="dp-p-current"
      data-testid="current-slide"
      data-laser={laserOn}
      role="button"
      tabIndex={0}
      aria-label="Current slide, activate for the next step"
      onClick={(event) => advanceOnClick(event, deck)}
      onKeyDown={(event) => advanceOnEnter(event, deck)}
      onPointerMove={(event) => laserOn && updateUi({ laserPoint: point(event) })}
      onPointerLeave={() => laserOn && updateUi({ laserPoint: undefined })}>
      <div className="dp-thumb" inert>
        <SlideView slide={deck.position.slide} step={deck.position.step} inactive={false} />
      </div>
      {laserOn && laserPoint !== undefined ? (
        <span
          className="dp-p-laser"
          style={{
            left: `${laserPoint.x * PERCENT}%`,
            top: `${laserPoint.y * PERCENT}%`,
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Keeps a fraction of the pane inside the pane, from 0 to 1.
 *
 * @param value - The fraction, which the pointer may put outside the pane.
 */
function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * The preview of what comes next: the next step of this slide while it has more, else the next
 * slide.
 */
function NextPane({ deck, next }: { deck: DeckControls; next: NextView | undefined }): ReactNode {
  return (
    <div>
      <div className="dp-p-label">
        <span>{nextLabel(next)}</span>
        <span>{next === undefined ? '' : deck.slides[next.slide]?.title}</span>
      </div>
      {next === undefined ? (
        <div className="dp-p-end" data-testid="next-slide">
          End of the deck
        </div>
      ) : (
        <div
          className="dp-p-next"
          data-testid="next-slide"
          role="button"
          tabIndex={0}
          aria-label="Next, activate to go there"
          onClick={(event) => advanceOnClick(event, deck)}
          onKeyDown={(event) => advanceOnEnter(event, deck)}>
          <div className="dp-thumb">
            <SlideView slide={next.slide} step={next.step} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Goes forward on a click on a pane, unless the click was meant for interactive content inside the
 * slide.
 *
 * @param event - The click.
 * @param deck - The deck's controls.
 */
function advanceOnClick(event: MouseEvent<HTMLElement>, deck: DeckControls): void {
  const slide = event.currentTarget.querySelector('.deck-slide-view');
  const target = event.target;
  const isInSlide = target instanceof Node && slide?.contains(target) === true;
  if (isInSlide && isInteractiveTarget(target)) {
    return;
  }

  deck.next();
}

/**
 * Goes forward on Enter on a focused pane.
 *
 * @param event - The key press.
 * @param deck - The deck's controls.
 */
function advanceOnEnter(event: KeyboardEvent<HTMLElement>, deck: DeckControls): void {
  if (event.key === 'Enter' && event.target === event.currentTarget) {
    event.preventDefault();
    deck.next();
  }
}

/**
 * What the header says while the audience screen is covered.
 *
 * @param mode - The cover.
 */
function blackoutText(mode: BlackoutMode): string {
  return mode === 'black' ? 'Audience screen blacked out' : 'Audience screen whited out';
}

/**
 * The label above the next pane.
 *
 * @param next - What the next pane shows, if anything.
 */
function nextLabel(next: NextView | undefined): string {
  if (next === undefined) {
    return 'Next';
  }

  return next.isStep ? 'Next step' : 'Next slide';
}

/**
 * The next thing the audience will see: the next step of this slide, else the next shown slide.
 *
 * @param deck - The deck's controls.
 */
function nextView(deck: DeckControls): NextView | undefined {
  const { slide, step } = deck.position;
  if (deck.stepCount !== undefined && step < deck.stepCount - 1) {
    return { slide, step: step + 1, isStep: true };
  }

  const following = neighbourShownSlide(
    deck.slides.map((entry) => entry.hidden),
    slide,
    'forward',
  );
  return following === undefined ? undefined : { slide: following, step: 0, isStep: false };
}
