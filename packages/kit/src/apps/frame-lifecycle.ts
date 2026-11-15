/**
 * Where a slide stands as the frame sees it.
 */
export type FrameLifecycleInput = {
  /**
   * Whether the deck renders in static mode (`?static`, export, screenshots).
   */
  isStatic: boolean;

  /**
   * Whether the slide is on screen.
   */
  isActive: boolean;

  /**
   * Whether the slide is mounted on the deck's stage (the current slide or a neighbour) rather than
   * in a thumbnail or preview (`SlideView`), which never runs an app.
   */
  isOnStage: boolean;

  /**
   * `adjacent` mounts the app as soon as its slide is on the stage so it is loaded when the slide
   * arrives; `active` mounts it only on the slide on screen.
   */
  mount: 'adjacent' | 'active';

  /**
   * Whether the app stays mounted, paused, after its slide stops being the one on screen, for as
   * long as the slide is on the stage.
   */
  keepAlive: boolean;

  /**
   * Whether the app has been mounted since the slide mounted.
   */
  wasMounted: boolean;
};

/**
 * What the frame shows and tells the app.
 */
export type FrameLifecycle = {
  /**
   * Whether the iframe or inline component exists. Without it the poster stands in.
   */
  mounted: boolean;

  /**
   * Whether the app should run: `true` only while the slide is on screen. A mounted app that is not
   * active is paused.
   */
  running: boolean;
};

/**
 * Decides whether an app is mounted and whether it runs. Static mode, thumbnails and previews never
 * mount it; otherwise it mounts when the slide is on screen, or earlier when `mount` is `adjacent`,
 * and `keepAlive` holds it through the slide leaving the screen.
 *
 * @param input - Where the slide stands and how the author configured the app.
 */
export function frameLifecycle(input: FrameLifecycleInput): FrameLifecycle {
  if (input.isStatic || !input.isOnStage) {
    return { mounted: false, running: false };
  }

  const mounted =
    input.isActive || input.mount === 'adjacent' || (input.keepAlive && input.wasMounted);
  return { mounted, running: input.isActive };
}
