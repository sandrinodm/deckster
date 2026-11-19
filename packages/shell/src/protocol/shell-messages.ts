import { isAgentCode } from '#main/agent-code.ts';
import { isLoopbackHttpUrl } from '#protocol/loopback-url.ts';

/**
 * The longest title a target may carry.
 */
export const MAX_TARGET_TITLE = 200;

/**
 * The longest background colour a target may carry.
 */
const MAX_TARGET_COLOR = 64;

/**
 * A rectangle in screen points, as Electron reports bounds.
 */
export type ShellRect = {
  /**
   * The left edge.
   */
  x: number;

  /**
   * The top edge.
   */
  y: number;

  /**
   * The width.
   */
  width: number;

  /**
   * The height.
   */
  height: number;
};

/**
 * One connected display, as the shell reports it.
 */
export type ShellDisplay = {
  /**
   * Electron's display id, stable while the display stays connected.
   */
  id: number;

  /**
   * The display's name, such as `Built-in Retina Display`; may be empty.
   */
  label: string;

  /**
   * The display's full area.
   */
  bounds: ShellRect;

  /**
   * The area not covered by the menu bar or dock.
   */
  workArea: ShellRect;

  /**
   * Device pixels per point.
   */
  scaleFactor: number;

  /**
   * Whether this is the primary display.
   */
  primary: boolean;
};

/**
 * Which window a message is about.
 */
export type ShellWindowRole = 'audience' | 'presenter';

/**
 * Where the windows go and how they are shown. The CLI computes it from the flags and the displays
 * the shell reported; the shell only carries it out.
 */
export type ShellPlan = {
  /**
   * The audience window.
   */
  audience: {
    /**
     * The id of the display it opens on.
     */
    displayId: number;

    /**
     * Whether it goes fullscreen once it is painted.
     */
    fullscreen: boolean;
  };

  /**
   * The presenter window, opened with the audience window; `undefined` opens none.
   */
  presenter?: {
    /**
     * The id of the display it opens on.
     */
    displayId: number;
  };

  /**
   * Kiosk: no menu, and Cmd/Ctrl+Q must be pressed twice to quit.
   */
  kiosk: boolean;
};

/**
 * What the shell tells the CLI about one open window.
 */
export type ShellWindowInfo = {
  /**
   * Which window.
   */
  window: ShellWindowRole;

  /**
   * The id of the display the window is on.
   */
  displayId: number;

  /**
   * The window's bounds.
   */
  bounds: ShellRect;
};

/**
 * The deck the windows show. It arrives in the shell's configuration (`url`, `title`,
 * `backgroundColor`, `agentCode`) or, when the shell was started without a deck, with the `open`
 * command, once, before the first window.
 */
export type ShellTarget = {
  /**
   * The deck's URL, an http or https address on a loopback host. Only its origin stays in the app.
   */
  url: string;

  /**
   * The deck's title: the window title and the dock name (at most 200 characters).
   */
  title: string;

  /**
   * The brand's default surface colour, so a window never flashes white while it loads (at most 64
   * characters).
   */
  backgroundColor: string;

  /**
   * A one-time code (16 to 128 URL-safe characters) the audience window's first load sends as the
   * `X-Deck-Agent-Code` header.
   */
  agentCode?: string;
};

/**
 * The chooser address and the preferred operator display. The shell falls back to another
 * non-audience display if the topology changes.
 */
export type ShellChooserTarget = {
  /**
   * The loopback URL of the chooser document.
   */
  url: string;

  /**
   * The display where the audience will open.
   */
  audienceDisplayId: number;

  /**
   * The preferred separate operator display.
   */
  operatorDisplayId: number | undefined;
};

/**
 * Everything the shell writes to its standard output, one JSON object per line.
 */
export type ShellEvent =
  | {
      /**
       * The displays. Sent once at start-up, before any window exists, on `list-displays` and when
       * a display is added, removed or changed.
       */
      type: 'displays';

      /**
       * The connected displays.
       */
      displays: readonly ShellDisplay[];
    }
  | {
      /**
       * The audience window has loaded the page.
       */
      type: 'ready';

      /**
       * Correlates desktop selection requests with their own readiness event.
       */
      requestId?: string;

      /**
       * The windows now open.
       */
      windows: readonly ShellWindowInfo[];

      /**
       * The URL the audience window loaded.
       */
      url: string;

      /**
       * The page title.
       */
      title: string;

      /**
       * Whether `window.__deck` exists in the audience page.
       */
      hasDeck: boolean;
    }
  | {
      /**
       * A window opened after `ready`, such as the presenter window.
       */
      type: 'window-opened';

      /**
       * The window.
       */
      info: ShellWindowInfo;
    }
  | {
      /**
       * A window closed.
       */
      type: 'window-closed';

      /**
       * Which window.
       */
      window: ShellWindowRole;
    }
  | {
      /**
       * A window entered or left fullscreen.
       */
      type: 'fullscreen';

      /**
       * Which window.
       */
      window: ShellWindowRole;

      /**
       * Whether it is fullscreen now.
       */
      on: boolean;
    }
  | {
      /**
       * A picture of the audience window was written, for the shell's capture test option.
       */
      type: 'captured';

      /**
       * The PNG file.
       */
      path: string;
    }
  | {
      /**
       * The chooser document has finished loading.
       */
      type: 'chooser-ready';

      /**
       * The display where the operator window was placed.
       */
      displayId: number;
    }
  | {
      /**
       * The previous audience and presenter windows and their session are retired.
       */
      type: 'deck-closed';

      /**
       * The selection request that initiated the close.
       */
      requestId: string;
    }
  | {
      /**
       * Something failed.
       */
      type: 'error';

      /**
       * The selection request that failed, when the chooser is open.
       */
      requestId?: string;

      /**
       * What failed.
       */
      message: string;
    };

/**
 * Everything the CLI writes to the shell's standard input, one JSON object per line.
 */
export type ShellCommand =
  | {
      /**
       * Open the windows of a plan. Sent once, after the first `displays`.
       */
      type: 'open';

      /**
       * Required for an open that belongs to a chooser selection.
       */
      requestId?: string;

      /**
       * The selected deck's window-state key.
       */
      stateKey?: string;

      /**
       * Where the windows go.
       */
      plan: ShellPlan;

      /**
       * The deck to show. Required when the shell was started without a `url`; refused when the
       * shell already has one.
       */
      target?: ShellTarget;
    }
  | {
      /**
       * Opens the chooser in its own operator window.
       */
      type: 'open-chooser';

      /**
       * The chooser document and preferred display.
       */
      target: ShellChooserTarget;
    }
  | {
      /**
       * Closes the deck windows and clears their session.
       */
      type: 'close-deck';

      /**
       * The identifier of the selection to close.
       */
      requestId: string;
    }
  | {
      /**
       * Report the displays again.
       */
      type: 'list-displays';
    }
  | {
      /**
       * Open the presenter window, or focus it when it is open.
       */
      type: 'open-presenter';

      /**
       * The display to open it on; `undefined` picks the display other than the audience's.
       */
      displayId?: number;
    }
  | {
      /**
       * Make the audience window fullscreen or windowed.
       */
      type: 'set-fullscreen';

      /**
       * Whether to be fullscreen.
       */
      on: boolean;
    }
  | {
      /**
       * Move a window to a display.
       */
      type: 'move-to-display';

      /**
       * Which window.
       */
      window: ShellWindowRole;

      /**
       * The display's id.
       */
      displayId: number;
    }
  | {
      /**
       * Bring the audience window to the front.
       */
      type: 'focus';
    }
  | {
      /**
       * Close every window and exit.
       */
      type: 'quit';
    };

/**
 * The result of reading one line of the protocol.
 */
export type Decoded<Message> =
  | {
      /**
       * The line was a valid message.
       */
      ok: true;

      /**
       * The message.
       */
      message: Message;
    }
  | {
      /**
       * The line was not a valid message.
       */
      ok: false;

      /**
       * Why, in a few words.
       */
      reason: string;
    };

/**
 * Serialises a message as one protocol line, newline included.
 *
 * @param message - A shell event or command.
 */
export function encodeMessage(message: ShellEvent | ShellCommand): string {
  return `${JSON.stringify(message)}\n`;
}

/**
 * Reads one line the shell wrote. Lines that are not JSON, such as Electron's own log output, and
 * messages of an unknown type are reported, never thrown.
 *
 * @param line - One line without its newline.
 */
export function decodeEvent(line: string): Decoded<ShellEvent> {
  const value = parseObject(line);
  if (typeof value === 'string') {
    return { ok: false, reason: value };
  }

  switch (value['type']) {
    case 'displays':
      return Array.isArray(value['displays']) && value['displays'].every(isDisplay)
        ? ok({ type: 'displays', displays: value['displays'] })
        : bad('displays needs a list of displays');
    case 'ready':
      return isReady(value) ? ok(value) : bad('ready needs windows, url, title and hasDeck');
    case 'chooser-ready':
      return isFiniteNumber(value['displayId'])
        ? ok({ type: 'chooser-ready', displayId: value['displayId'] })
        : bad('chooser-ready needs a displayId');
    case 'deck-closed':
      return typeof value['requestId'] === 'string'
        ? ok({ type: 'deck-closed', requestId: value['requestId'] })
        : bad('deck-closed needs a requestId');
    case 'window-opened':
      return isWindowInfo(value['info'])
        ? ok({ type: 'window-opened', info: value['info'] })
        : bad('window-opened needs info');
    case 'window-closed':
      return isRole(value['window'])
        ? ok({ type: 'window-closed', window: value['window'] })
        : bad('window-closed needs a window');
    case 'fullscreen':
      return isRole(value['window']) && typeof value['on'] === 'boolean'
        ? ok({ type: 'fullscreen', window: value['window'], on: value['on'] })
        : bad('fullscreen needs window and on');
    case 'captured':
      return typeof value['path'] === 'string'
        ? ok({ type: 'captured', path: value['path'] })
        : bad('captured needs a path');
    case 'error':
      return typeof value['message'] === 'string'
        ? ok({
            type: 'error',
            message: value['message'],
            ...readRequestId(value),
          })
        : bad('error needs a message');
    default:
      return bad(`unknown event type ${JSON.stringify(value['type'])}`);
  }
}

/**
 * Reads one line the CLI wrote.
 *
 * @param line - One line without its newline.
 */
export function decodeCommand(line: string): Decoded<ShellCommand> {
  const value = parseObject(line);
  if (typeof value === 'string') {
    return { ok: false, reason: value };
  }

  switch (value['type']) {
    case 'open': {
      if (!isPlan(value['plan'])) {
        return bad('open needs a plan');
      }

      if (value['target'] === undefined) {
        return ok({ type: 'open', plan: value['plan'] });
      }

      const target = decodeTarget(value['target']);
      if (typeof target === 'string') {
        return bad(target);
      }

      return ok({
        type: 'open',
        plan: value['plan'],
        target,
        ...readRequestId(value),
        ...(typeof value['stateKey'] === 'string' ? { stateKey: value['stateKey'] } : {}),
      });
    }
    case 'open-chooser': {
      const target = readChooserTarget(value['target']);
      return target === undefined
        ? bad('open-chooser needs a loopback url and display IDs')
        : ok({ type: 'open-chooser', target });
    }
    case 'close-deck':
      return typeof value['requestId'] === 'string'
        ? ok({ type: 'close-deck', requestId: value['requestId'] })
        : bad('close-deck needs a requestId');
    case 'list-displays':
      return ok({ type: 'list-displays' });
    case 'open-presenter':
      if (value['displayId'] === undefined) {
        return ok({ type: 'open-presenter' });
      }

      return isFiniteNumber(value['displayId'])
        ? ok({ type: 'open-presenter', displayId: value['displayId'] })
        : bad('open-presenter takes a numeric displayId');
    case 'set-fullscreen':
      return typeof value['on'] === 'boolean'
        ? ok({ type: 'set-fullscreen', on: value['on'] })
        : bad('set-fullscreen needs on');
    case 'move-to-display':
      return isRole(value['window']) && isFiniteNumber(value['displayId'])
        ? ok({ type: 'move-to-display', window: value['window'], displayId: value['displayId'] })
        : bad('move-to-display needs window and displayId');
    case 'focus':
      return ok({ type: 'focus' });
    case 'quit':
      return ok({ type: 'quit' });
    default:
      return bad(`unknown command type ${JSON.stringify(value['type'])}`);
  }
}

/**
 * Reads the optional selection identifier without including unrecognised fields.
 */
function readRequestId(value: Record<string, unknown>): { requestId?: string } {
  return typeof value['requestId'] === 'string' ? { requestId: value['requestId'] } : {};
}

/**
 * Reads the chooser address and proposed operator placement.
 */
function readChooserTarget(value: unknown): ShellChooserTarget | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const { url, audienceDisplayId, operatorDisplayId } = value;
  if (typeof url !== 'string' || !isLoopbackHttpUrl(url) || !isFiniteNumber(audienceDisplayId)) {
    return undefined;
  }

  if (operatorDisplayId !== undefined && !isFiniteNumber(operatorDisplayId)) {
    return undefined;
  }

  return { url, audienceDisplayId, operatorDisplayId };
}

/**
 * Reads the target of an `open` command, or says why it is not one.
 *
 * @param value - The `target` field.
 */
function decodeTarget(value: unknown): ShellTarget | string {
  if (!isRecord(value)) {
    return 'open target must be an object';
  }

  const { url, title, backgroundColor, agentCode } = value;
  if (typeof url !== 'string' || !URL.canParse(url) || !isLoopbackHttpUrl(url)) {
    return 'open target needs an http or https url on a loopback host';
  }

  if (typeof title !== 'string' || title.length > MAX_TARGET_TITLE) {
    return `open target needs a title of at most ${MAX_TARGET_TITLE} characters`;
  }

  if (typeof backgroundColor !== 'string' || backgroundColor.length > MAX_TARGET_COLOR) {
    return `open target needs a backgroundColor of at most ${MAX_TARGET_COLOR} characters`;
  }

  if (agentCode !== undefined && !isAgentCode(agentCode)) {
    return 'open target agentCode must be 16 to 128 URL-safe characters';
  }

  return { url, title, backgroundColor, ...(agentCode === undefined ? {} : { agentCode }) };
}

/**
 * Parses a line into an object, or says why it is not one.
 *
 * @param line - One line.
 */
function parseObject(line: string): Record<string, unknown> | string {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return 'not JSON';
  }

  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : 'not an object';
}

/**
 * A successful decode.
 *
 * @param message - The message.
 */
function ok<Message>(message: Message): Decoded<Message> {
  return { ok: true, message };
}

/**
 * A failed decode.
 *
 * @param reason - Why.
 */
function bad(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

/**
 * Whether a value is a role.
 *
 * @param value - Anything.
 */
function isRole(value: unknown): value is ShellWindowRole {
  return value === 'audience' || value === 'presenter';
}

/**
 * Whether a value is a rectangle.
 *
 * @param value - Anything.
 */
function isRect(value: unknown): value is ShellRect {
  return (
    typeof value === 'object' &&
    value !== null &&
    ['x', 'y', 'width', 'height'].every((key) =>
      isFiniteNumber((value as Record<string, unknown>)[key]),
    )
  );
}

/**
 * Whether a value is a display.
 *
 * @param value - Anything.
 */
function isDisplay(value: unknown): value is ShellDisplay {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    isFiniteNumber(record['id']) &&
    typeof record['label'] === 'string' &&
    isRect(record['bounds']) &&
    isRect(record['workArea']) &&
    isFiniteNumber(record['scaleFactor']) &&
    typeof record['primary'] === 'boolean'
  );
}

/**
 * Whether a value describes a window.
 *
 * @param value - Anything.
 */
function isWindowInfo(value: unknown): value is ShellWindowInfo {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    isRole(record['window']) && isFiniteNumber(record['displayId']) && isRect(record['bounds'])
  );
}

/**
 * Whether an object is a `ready` event.
 *
 * @param value - A parsed object with a `type` of `ready`.
 */
function isReady(value: Record<string, unknown>): value is Extract<ShellEvent, { type: 'ready' }> {
  return (
    Array.isArray(value['windows']) &&
    value['windows'].every(isWindowInfo) &&
    typeof value['url'] === 'string' &&
    typeof value['title'] === 'string' &&
    typeof value['hasDeck'] === 'boolean' &&
    (value['requestId'] === undefined || typeof value['requestId'] === 'string')
  );
}

/**
 * Whether a value is a window plan.
 *
 * @param value - Anything.
 */
function isPlan(value: unknown): value is ShellPlan {
  if (!isRecord(value)) {
    return false;
  }

  const audience = value['audience'];
  const presenter = value['presenter'];
  return (
    isRecord(audience) &&
    isFiniteNumber(audience['displayId']) &&
    typeof audience['fullscreen'] === 'boolean' &&
    typeof value['kiosk'] === 'boolean' &&
    (presenter === undefined || (isRecord(presenter) && isFiniteNumber(presenter['displayId'])))
  );
}

/**
 * Whether a value is a plain JSON object: not `null`, not an array.
 *
 * @param value - Anything.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether a value is a finite number; `1e999` in JSON parses to `Infinity`, which is not.
 *
 * @param value - Anything.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
