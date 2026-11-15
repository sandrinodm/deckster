import type { ReactNode } from 'react';

/**
 * The size an icon takes when the caller gives none, in CSS pixels.
 */
const DEFAULT_ICON_PX = 16;

/**
 * A circle of radius 9 around the centre, drawn as one path: the frame of the status icons.
 */
const CIRCLE_PATH = 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z';

/**
 * A sheet of paper with a folded corner.
 */
const SHEET_PATH = 'M7 3h7l4 4v14H7z';

/**
 * A rectangle wider than it is tall, the frame of a window.
 */
const WINDOW_PATH = 'M3 5h18v14H3z';

/**
 * The panel's icons: SVG path `d` strings in a 24x24 box, drawn with the presenter tools' 1.75px
 * stroke so the panel and the tool cluster read as one set.
 */
export const ICONS = {
  /**
   * A chat bubble with a spark: the agent.
   */
  agent: [
    'M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.4-4.6A7.5 7.5 0 1 1 20 11.5z',
    'M12 7.8l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z',
  ],

  /**
   * An arrow up: send.
   */
  send: ['M12 19V5', 'M6 11l6-6 6 6'],

  /**
   * A square: stop.
   */
  stop: ['M7 7h10v10H7z'],

  /**
   * A crosshair: pick an element.
   */
  pick: ['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],

  /**
   * A camera: screenshot.
   */
  camera: ['M4 8h3l1.5-2h7L17 8h3v11H4z', 'M12 10.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],

  /**
   * A frame with corners: a screenshot of the slide.
   */
  screenshot: ['M4 8V5h3', 'M17 5h3v3', 'M20 16v3h-3', 'M7 19H4v-3', 'M8 9h8v6H8z'],

  /**
   * A speech bubble: a review comment.
   */
  comment: ['M20 12a7 7 0 0 1-10.2 6.2L5 19.5l1.3-4.3A7 7 0 1 1 20 12z'],

  /**
   * A page: a slide file.
   */
  file: [SHEET_PATH, 'M14 3v4h4'],

  /**
   * An open book page with lines: reading.
   */
  read: [SHEET_PATH, 'M10 12h5', 'M10 16h5'],

  /**
   * A pencil: an edit.
   */
  edit: ['M4 20l1-4L16 5l3 3L8 19z', 'M14 7l3 3'],

  /**
   * A magnifier: a search.
   */
  search: ['M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'M15.5 15.5L20 20'],

  /**
   * A check in a circle: lint.
   */
  lint: [CIRCLE_PATH, 'M8 12.5l2.7 2.5L16 9.5'],

  /**
   * A prompt: a shell command.
   */
  shell: ['M4 5h16v14H4z', 'M7.5 10l2.5 2-2.5 2', 'M12 14.5h4'],

  /**
   * A wrench: another tool.
   */
  tool: ['M14.5 6.5a4 4 0 0 0 4.9 4.9L13 17.8 9.2 21 3 14.8 6.2 11l6.4-6.4a4 4 0 0 0 1.9 1.9z'],

  /**
   * A circle with a bar: refused.
   */
  denied: [CIRCLE_PATH, 'M5.6 5.6l12.8 12.8'],

  /**
   * A cross in a circle: failed.
   */
  failed: [CIRCLE_PATH, 'M9 9l6 6', 'M15 9l-6 6'],

  /**
   * A chevron pointing right: a disclosure.
   */
  chevron: ['M9 6l6 6-6 6'],

  /**
   * An arrow turning back: undo.
   */
  undo: ['M9 14L4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],

  /**
   * An arrow turning forward: redo.
   */
  redo: ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],

  /**
   * A window with a panel on its right: dock beside the slide.
   */
  dockRight: [WINDOW_PATH, 'M15 5v14'],

  /**
   * A window with a panel at its bottom: dock below the slide.
   */
  dockBottom: [WINDOW_PATH, 'M3 14h18'],

  /**
   * A cross: close or remove.
   */
  close: ['M6 6l12 12', 'M18 6L6 18'],

  /**
   * A pencil on a square: a new conversation.
   */
  compose: ['M12 4H5v15h15v-7', 'M18.5 3.5l2 2L13 13l-3 1 1-3z'],

  /**
   * Two sheets: copy.
   */
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],

  /**
   * An arrow down: jump to the latest message.
   */
  down: ['M12 5v14', 'M6 13l6 6 6-6'],

  /**
   * A circular arrow: retry.
   */
  retry: ['M20 12a8 8 0 1 1-2.3-5.6', 'M20 4v4.5h-4.5'],

  /**
   * A collapse bar: hide the panel.
   */
  collapse: ['M5 12h14'],
} as const satisfies Record<string, readonly string[]>;

/**
 * An icon's name.
 */
export type IconName = keyof typeof ICONS;

/**
 * Draws one of the panel's icons. Decorative: the control around it carries the name.
 *
 * @param props - The icon and an optional size in pixels.
 */
export function Icon({
  name,
  size = DEFAULT_ICON_PX,
}: {
  name: IconName;
  size?: number;
}): ReactNode {
  return (
    <svg
      className="da-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false">
      {ICONS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
