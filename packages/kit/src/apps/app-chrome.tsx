import type { ReactNode } from 'react';

/**
 * How a frame is dressed: no chrome, a browser window with an address bar, or a neutral window with
 * a title bar.
 */
export type FrameChrome = 'none' | 'browser' | 'window';

/**
 * Props of {@link AppChrome}.
 */
type AppChromeProps = {
  /**
   * The chrome to draw.
   */
  chrome: FrameChrome;

  /**
   * What the address bar shows in `browser`, or the title bar in `window`.
   */
  label: string;

  /**
   * The presenter's controls (switch to the recording, return to the deck), drawn at the right of
   * the bar, or over the screen's top-right corner when the frame has no bar. Live mode only.
   */
  tools?: ReactNode;

  /**
   * The app's screen.
   */
  children?: ReactNode;
};

/**
 * Draws a frame's chrome around its screen from brand tokens only: the surface and border roles,
 * the brand's radius, stroke and shadow, and its caption type. `browser` has three dots, a fake
 * address bar and a lock; `window` is device-neutral, a title bar with the label and window
 * controls. The dressing is decoration, hidden from assistive technology, and the address bar is
 * not a real control; the tools beside it are.
 */
export function AppChrome({ chrome, label, tools, children }: AppChromeProps): ReactNode {
  return (
    <div className="kit-app-window" data-chrome={chrome}>
      {chrome === 'none' ? null : <AppBar chrome={chrome} label={label} tools={tools} />}
      <div className="kit-app-screen">
        {children}
        {chrome === 'none' && hasTools(tools) ? (
          <div className="kit-app-tools" data-floating="">
            {tools}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Props of {@link AppBar}.
 */
type AppBarProps = {
  /**
   * The chrome to draw; `none` never reaches the bar.
   */
  chrome: FrameChrome;

  /**
   * The address bar or title bar text.
   */
  label: string;

  /**
   * The presenter's controls, drawn at the bar's right.
   */
  tools: ReactNode;
};

/**
 * The bar across the top of a `browser` or `window` frame, with the presenter's controls at its
 * right when there are any.
 */
function AppBar({ chrome, label, tools }: AppBarProps): ReactNode {
  return (
    <div className="kit-app-bar">
      <div className="kit-app-bar-dressing" aria-hidden="true" data-decorative="">
        {chrome === 'browser' ? <BrowserBar label={label} /> : <WindowBar label={label} />}
      </div>
      {hasTools(tools) ? <div className="kit-app-tools">{tools}</div> : null}
    </div>
  );
}

/**
 * Whether there are any presenter controls to draw: nothing, `null` and `false` are none.
 *
 * @param tools - The controls the frame was given.
 */
function hasTools(tools: ReactNode): boolean {
  return tools !== undefined && tools !== null && tools !== false;
}

/**
 * The browser frame's bar: dots, then an address pill.
 */
function BrowserBar({ label }: { label: string }): ReactNode {
  return (
    <>
      <span className="kit-app-dots">
        <i />
        <i />
        <i />
      </span>
      <span className="kit-app-address kit-type-caption">
        <svg className="kit-app-lock" viewBox="0 0 12 12" aria-hidden="true">
          <rect x="2.25" y="5.25" width="7.5" height="5" rx="1.25" />
          <path d="M4 5.25V3.75a2 2 0 0 1 4 0v1.5" />
        </svg>
        <span className="kit-app-address-text">{label}</span>
      </span>
    </>
  );
}

/**
 * The neutral window's bar: an accent mark and the title, with the three window controls on the
 * right, each drawn in the same square so they read as minimize, maximize and close rather than as
 * dashes and a box.
 */
function WindowBar({ label }: { label: string }): ReactNode {
  return (
    <>
      <span className="kit-app-mark" />
      <span className="kit-app-title kit-type-caption">{label}</span>
      <span className="kit-app-controls">
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 9.5h7" />
        </svg>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
        </svg>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.75 2.75l6.5 6.5M9.25 2.75l-6.5 6.5" />
        </svg>
      </span>
    </>
  );
}
