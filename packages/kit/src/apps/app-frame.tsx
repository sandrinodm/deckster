import { useReadyHold, useSlide, useStatic, useStep } from '@deckster/engine';
import { deckCommand } from '@deckster/engine/command';
import { registerShortcut } from '@deckster/presenter';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { AppChrome, type FrameChrome } from '#apps/app-chrome.tsx';
import { AppFallback } from '#apps/app-error-boundary.tsx';
import { PosterView, type Poster } from '#apps/app-poster.tsx';
import {
  isInsideAppFrame,
  showsDeckPage,
  useOnline,
  useProbe,
  type ProbeResult,
} from '#apps/app-probe.ts';
import { AppSteps } from '#apps/app-steps.tsx';
import {
  allowAttribute,
  resolveAppTarget,
  sandboxAttribute,
  type AppTarget,
} from '#apps/app-target.ts';
import { frameLifecycle } from '#apps/frame-lifecycle.ts';
import { ReleaseControl } from '#apps/release-hint.tsx';
import { useAppBridge } from '#apps/use-app-bridge.ts';
import { useFrameFocus } from '#apps/use-frame-focus.ts';
import { checkComponentProps } from '#components/check-component-props.ts';

/**
 * How long the deck waits for an app to report `ready` before it releases the slide's `ready()` and
 * warns, in milliseconds. The engine's own `ready()` gives up after 30 seconds.
 */
export const READY_TIMEOUT_MS = 8000;

/**
 * Milliseconds in a second, for the timeout message.
 */
const MS_PER_SECOND = 1000;

/**
 * No extra sandbox tokens or allow features, kept stable between renders.
 */
const NONE: readonly string[] = [];

/**
 * The key that switches a frame with a `fallback` between the live app and the recording.
 */
export const RECORDING_KEY = 'v';

/**
 * Props of {@link AppFrame}.
 */
export type AppFrameProps = {
  /**
   * The mini app to show: the name of a folder under `decks/<deck>/apps/`, built with the deck and
   * served at `apps/<name>/`. Give this or `src`.
   */
  app?: string;

  /**
   * An address to load instead: a full URL, or a path on the deck's own origin. A URL on another
   * origin is external: it needs network at the venue and gets no bridge unless `bridge` is set.
   */
  src?: string;

  /**
   * What static mode, `deckster shot`, PDF and PPTX export and offline runs show in place of the
   * frame: an image URL, or a function that renders it (it gets the slide's step, so a poster can
   * show the app's state at each step). Required; `deckster lint` reports a missing one as
   * `app-missing-poster`.
   */
  poster: Poster;

  /**
   * What the app shows, for people who cannot see it; the poster image's alt text and the frame's
   * title.
   */
  alt?: string;

  /**
   * A recorded video of the demo, played muted and looping where the live app cannot run: the
   * browser is offline, an external host does not answer, or the app failed. The presenter can also
   * switch to it, and back, with the "Recording" control in the frame's chrome or the `v` key. It
   * also silences `app-external-src`.
   */
  fallback?: string;

  /**
   * The frame's dressing: `none`, `browser` (dots, lock and a fake address bar) or `window` (a
   * neutral title bar). Defaults to `none`.
   */
  chrome?: FrameChrome;

  /**
   * The text in the address bar or title bar. Defaults to the app's name, or the `src` host.
   */
  title?: string;

  /**
   * The number of slide steps the app owns, registered even in static mode so exports and `deck
   * shot --steps` see them. A connected app overrides it with `requestSteps`. Defaults to 0.
   */
  steps?: number;

  /**
   * `adjacent` (default) loads the app as soon as its slide is on the stage; `active` loads it only
   * on the slide on screen.
   */
  mount?: 'adjacent' | 'active';

  /**
   * Keep the app mounted, paused, after its slide leaves the screen (with `mount="active"`), so
   * coming back resumes where it was. Defaults to `false`.
   */
  keepAlive?: boolean;

  /**
   * Turns the bridge on for an external `src` that includes `@deckster/app-bridge`. Bundled apps
   * always have it.
   */
  bridge?: boolean;

  /**
   * Tokens to add to the iframe's `sandbox`, such as `allow-downloads`.
   */
  sandbox?: readonly string[];

  /**
   * Features to add to the iframe's `allow`, such as `microphone`.
   */
  allow?: readonly string[];

  /**
   * Milliseconds to wait for the app's `ready` before releasing the slide's `ready()`; defaults to
   * {@link READY_TIMEOUT_MS}.
   */
  readyTimeout?: number;

  /**
   * Called with the size an app asks for.
   */
  onResize?: (size: { width?: number; height?: number }) => void;
};

/**
 * What the frame is doing, from loading to done.
 */
type FrameStatus = 'loading' | 'ready' | 'timeout' | 'failed';

/**
 * A sandboxed iframe that hosts a mini app inside the slide, filling the region it is placed in. A
 * bundled app (`app="agent-demo"`) loads with the deck, receives the brand's tokens, activates when
 * its slide arrives and pauses when it leaves, and can own steps of the slide. It is marked
 * interactive: clicks inside do not move the deck, and while it has focus the keyboard is the app's
 * until Escape or the "Return to deck" control. The slide's `ready()` waits for the app's `ready`
 * message, or a timeout. In static mode, `deckster shot` and export it shows the `poster` and never
 * loads the frame. An app the deck does not have shows a card that says so (`deckster lint` reports
 * `app-missing`), never the deck's own page.
 *
 * ```mdx
 * <AppFrame app="agent-demo" poster="./agent.png" alt="An agent run" chrome="window" />
 * ```
 */
export function AppFrame(props: AppFrameProps): ReactNode {
  checkComponentProps('AppFrame', props);
  const { app, src, poster, alt = '', chrome = 'none' } = props;
  const target = useMemo(() => resolveAppTarget({ app, src, base: document.baseURI }), [app, src]);
  const slide = useSlide();
  const isStatic = useStatic();
  const step = useStep();
  const nested = useMemo(() => isInsideAppFrame(), []);
  const [wasMounted, setWasMounted] = useState(false);
  const [requestedSteps, setRequestedSteps] = useState<number | undefined>(undefined);
  const lifecycle = frameLifecycle({
    isStatic: isStatic || nested,
    isActive: slide.isActive,
    isOnStage: slide.state !== undefined,
    mount: props.mount ?? 'adjacent',
    keepAlive: props.keepAlive ?? false,
    wasMounted,
  });
  if (lifecycle.mounted && !wasMounted) {
    setWasMounted(true);
  }

  const bundledApp = app !== undefined;
  const probe = useProbe(
    target,
    bundledApp,
    !nested && (bundledApp || (target.kind === 'external' && lifecycle.mounted)),
  );
  const label = props.title ?? target.display;
  const missing = probe === 'missing';
  return (
    <div
      className="kit-app"
      data-deck-interactive=""
      data-app-kind={target.kind}
      data-app-mounted={lifecycle.mounted && !missing}
      data-chrome={chrome}
      {...(app === undefined ? {} : { 'data-app-name': app })}
      {...(missing ? { 'data-app-missing': '' } : {})}
      {...(target.kind === 'external' ? { 'data-app-external': '' } : {})}
      {...(props.fallback === undefined ? {} : { 'data-app-has-fallback': '' })}>
      {lifecycle.mounted && !missing ? (
        <LiveFrame
          {...props}
          target={target}
          running={lifecycle.running}
          label={label}
          probe={probe}
          onRequestSteps={setRequestedSteps}
        />
      ) : (
        <AppChrome chrome={chrome} label={label}>
          <PosterView poster={poster} alt={alt} step={step} />
          {missing && <MissingApp name={app ?? ''} />}
        </AppChrome>
      )}
      <AppSteps count={requestedSteps ?? props.steps ?? 0} />
    </div>
  );
}

/**
 * The card a frame shows for an app the deck does not have.
 */
function MissingApp({ name }: { name: string }): ReactNode {
  return (
    <AppFallback
      title={`There is no app "${name}"`}
      message={
        `The deck has no apps/${name}/index.html. Create it with \`${deckCommand()} new app <deck> ` +
        `${name}\`, or fix the name in <AppFrame app>.`
      }
    />
  );
}

/**
 * Props of {@link LiveFrame}.
 */
type LiveFrameProps = AppFrameProps & {
  /**
   * Where the frame points.
   */
  target: AppTarget;

  /**
   * Whether the app should run.
   */
  running: boolean;

  /**
   * The accessible title of the frame.
   */
  label: string;

  /**
   * Whether the address answered; an unreachable external host plays the recording.
   */
  probe: ProbeResult;

  /**
   * Called when the app asks for steps.
   */
  onRequestSteps: (count: number) => void;
};

/**
 * The running frame: the iframe over its poster, the bridge, readiness, focus capture, the steps
 * the app owns, the recording when the app cannot run (or the presenter asks for it) and the
 * branded fallback when it fails.
 */
function LiveFrame(props: LiveFrameProps): ReactNode {
  const { target, running, poster, alt = '', fallback, readyTimeout = READY_TIMEOUT_MS } = props;
  const chrome = props.chrome ?? 'none';
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [status, setStatus] = useState<FrameStatus>('loading');
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [chosen, setChosen] = useState<'live' | 'recording' | undefined>(undefined);
  const step = useStep();
  const slide = useSlide();

  const bridged = target.kind === 'bundled' || props.bridge === true;
  const focus = useFrameFocus(frame, running);
  const online = useOnline();
  const offline = target.kind === 'external' && (!online || props.probe === 'unreachable');
  const failed = status === 'failed' || offline;
  const hasRecording = fallback !== undefined;
  const showsRecording = hasRecording && (chosen === undefined ? failed : chosen === 'recording');
  const forcedLive = chosen === 'live' && status !== 'failed';
  const showsFrame = !showsRecording && (forcedLive || !failed) && props.probe !== 'pending';
  useReadyHold(showsFrame && status === 'loading');

  const { release } = focus;
  const toggleRecording = useCallback(() => {
    setChosen(showsRecording ? 'live' : 'recording');
    release();
  }, [showsRecording, release]);
  useRecordingKey(hasRecording && slide.isActive && running, toggleRecording);

  const onLoaded = useCallback(() => {
    if (frame !== null && target.kind === 'bundled' && showsDeckPage(frame)) {
      setProblem(
        `${target.url} served the deck itself, not an app. Check that the app exists under ` +
          'apps/ and that the host serves the built apps/ folder.',
      );
      setStatus('failed');
      return;
    }

    if (!bridged) {
      setStatus('ready');
    }
  }, [bridged, frame, target]);
  useReadyTimeout({ status, showsFrame, readyTimeout, label: props.label, setStatus });
  useAppBridge({
    frame,
    origin: target.origin,
    enabled: bridged,
    running,
    step,
    handlers: {
      onReady: () => setStatus((current) => (current === 'failed' ? current : 'ready')),
      onRequestSteps: props.onRequestSteps,
      onResize: (size) => props.onResize?.(size),
      onError: (message) => {
        setProblem(message);
        setStatus('failed');
      },
      onRelease: release,
      onFocus: focus.setReported,
    },
  });

  const referrerPolicy = target.kind === 'external' ? 'no-referrer-when-downgrade' : undefined;
  const tools = (
    <>
      {focus.interacting ? <ReleaseControl onRelease={release} escape={bridged} /> : null}
      {hasRecording ? (
        <RecordingButton showing={showsRecording} onToggle={toggleRecording} />
      ) : null}
    </>
  );
  return (
    <AppChrome chrome={chrome} label={props.label} tools={tools}>
      <PosterView poster={poster} alt={alt} step={step} />
      {showsFrame ? (
        <iframe
          ref={setFrame}
          className="kit-app-iframe"
          data-app-status={status}
          title={props.alt ?? props.label}
          src={target.url}
          sandbox={sandboxAttribute(target.kind, props.sandbox ?? NONE)}
          allow={allowAttribute(target.kind, props.allow ?? NONE)}
          loading="eager"
          referrerPolicy={referrerPolicy}
          onLoad={onLoaded}
        />
      ) : null}
      {showsRecording ? (
        <video
          className="kit-app-fallback-video"
          src={fallback}
          muted
          loop
          autoPlay
          playsInline
          aria-label={alt}
        />
      ) : null}
      {failed && !showsRecording && !showsFrame ? (
        <AppFallback
          title="The live demo is unavailable"
          message={problem ?? offlineMessage(online)}
        />
      ) : null}
    </AppChrome>
  );
}

/**
 * Props of {@link RecordingButton}.
 */
type RecordingButtonProps = {
  /**
   * Whether the recording is showing, which the button reports as pressed.
   */
  showing: boolean;

  /**
   * Switches between the live app and the recording.
   */
  onToggle: () => void;
};

/**
 * The chrome control that switches a frame between its live app and its recording.
 */
function RecordingButton({ showing, onToggle }: RecordingButtonProps): ReactNode {
  return (
    <button
      type="button"
      className="kit-app-tool kit-type-caption"
      aria-pressed={showing}
      title={`Switch between the live app and the recording (${RECORDING_KEY.toUpperCase()})`}
      onClick={onToggle}>
      <span className="kit-app-tool-dot" data-on={showing} aria-hidden="true" />
      {showing ? 'Recording' : 'Live'}
      <kbd className="kit-app-hint-key">{RECORDING_KEY.toUpperCase()}</kbd>
    </button>
  );
}

/**
 * Props of {@link useReadyTimeout}.
 */
type ReadyTimeoutOptions = {
  /**
   * Where the frame is; the wait runs only while it is `loading`.
   */
  status: FrameStatus;

  /**
   * Whether the frame is on screen, which starts the wait.
   */
  showsFrame: boolean;

  /**
   * Milliseconds to wait for the app's `ready`.
   */
  readyTimeout: number;

  /**
   * The frame's label, named in the warning.
   */
  label: string;

  /**
   * Sets the frame's status.
   */
  setStatus: (status: FrameStatus) => void;
};

/**
 * Stops waiting for an app's `ready` after `readyTimeout`: it warns and sets the status to
 * `timeout`, so the slide's `ready()` is released and the slide continues without the app.
 *
 * @param options - The frame's state and the timeout.
 */
function useReadyTimeout(options: ReadyTimeoutOptions): void {
  const { status, showsFrame, readyTimeout, label, setStatus } = options;
  useEffect(() => {
    if (status !== 'loading' || !showsFrame) {
      return undefined;
    }

    const timer = setTimeout(() => {
      console.warn(
        `[deck] The app "${label}" did not report ready within ` +
          `${readyTimeout / MS_PER_SECOND}s, so the slide continues without it. ` +
          'Call ready() from @deckster/app-bridge once the first frame is drawn, ' +
          'or raise `readyTimeout`.',
      );
      setStatus('timeout');
    }, readyTimeout);
    return () => clearTimeout(timer);
  }, [status, showsFrame, readyTimeout, label, setStatus]);
}

/**
 * Why an external page is not shown, when the app reported nothing itself.
 *
 * @param online - Whether the browser has a network.
 */
function offlineMessage(online: boolean): string {
  return online
    ? 'The page did not answer, so the recorded poster stands in for it.'
    : 'No network, so the recorded poster stands in for the app.';
}

/**
 * Registers the `v` key while a frame with a recording is on screen, so the presenter can switch to
 * the recording and back without the mouse. The help overlay lists it.
 *
 * @param enabled - Whether the frame is on screen and has a recording.
 * @param toggle - Switches between the live app and the recording.
 */
function useRecordingKey(enabled: boolean, toggle: () => void): void {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    return registerShortcut({
      id: 'kit.app-frame.recording',
      keys: [RECORDING_KEY],
      label: 'Switch a live demo to its recording and back',
      group: 'Live demos',
      window: 'audience',
      run: () => toggle(),
    });
  }, [enabled, toggle]);
}
