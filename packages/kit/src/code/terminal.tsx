import { useStatic, useStep } from '@deckster/engine';
import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';

import type { TerminalItem, TerminalLine, TerminalTone } from '#code/terminal-script.ts';

import { StepMarks } from '#code/step-marks.tsx';
import { activeCommand, planTerminal, typingMs } from '#code/terminal-script.ts';
import { checkComponentProps } from '#components/check-component-props.ts';

/**
 * Props of {@link Cmd}.
 */
export type CmdProps = {
  /**
   * The command as typed after the prompt.
   */
  children?: ReactNode;

  /**
   * The command as a string. The build sets it from the tag's text in MDX so the text is kept
   * exactly as written.
   */
  text?: string;
};

/**
 * A command in a `<Terminal>`: typed after the prompt at its own step. It renders nothing itself.
 */
export function Cmd(props: CmdProps): ReactNode {
  void props;
  return null;
}

/**
 * Props of {@link Out}.
 */
export type OutProps = {
  /**
   * The output line.
   */
  children?: ReactNode;

  /**
   * The line as a string. The build sets it from the tag's text in MDX so the text is kept exactly
   * as written.
   */
  text?: string;

  /**
   * The color of the line: `plain` (default), `muted`, `success`, `warning` or `error` (the line on
   * the removed-line tint). The build warns about any other value.
   */
  tone?: TerminalTone;
};

/**
 * A line of output in a `<Terminal>`: shown once the command before it has been typed. It renders
 * nothing itself.
 */
export function Out(props: OutProps): ReactNode {
  void props;
  return null;
}

/**
 * Props of {@link Terminal}.
 */
export type TerminalProps = {
  /**
   * The session: `<Cmd>` and `<Out>` elements in order.
   */
  children?: ReactNode;

  /**
   * The title in the window bar, such as the working directory.
   */
  title?: string;

  /**
   * The prompt before each command; defaults to `$`.
   */
  prompt?: string;

  /**
   * The step at which the first command is typed; each further command is typed one step later.
   * Defaults to 1, so the terminal arrives empty with its cursor waiting.
   */
  at?: number;
};

/**
 * The prompt when none is given.
 */
const DEFAULT_PROMPT = '$';

/**
 * Milliseconds between frames of the typing animation.
 */
const FRAME_MS = 16;

/**
 * A terminal window with a typed session. Each `<Cmd>` is typed after the prompt when its step is
 * reached, one step per command, and its `<Out>` lines appear when it is done. Going back a step
 * removes lines with no animation; in static mode the whole session up to the current step shows at
 * once. The window says in `data-code-lines` how many lines the session holds (each `<Cmd>` and
 * `<Out>`, shown or not), which `deckster lint` counts against the layout's `maxLines`.
 *
 * ```mdx
 * <Terminal title="~/larkfield" at={1}>
 *   <Cmd>pnpm deckster build exemplars</Cmd>
 *   <Out>built 16 slides in 1.4 s</Out>
 *   <Cmd>pnpm deckster lint exemplars</Cmd>
 *   <Out tone="success">no problems</Out>
 * </Terminal>
 * ```
 */
export function Terminal(props: TerminalProps): ReactNode {
  checkComponentProps('Terminal', props);
  const { children, title, prompt = DEFAULT_PROMPT, at = 1 } = props;
  const items = sessionItems(children);
  const commands = items.filter((item) => item.kind === 'cmd');
  const ats = commands.map((_, index) => at + index);
  const active = activeCommand(ats, useStep());
  const typed = useTyping(active, commands[active]?.text.length ?? 0);
  const lines = planTerminal(items, active, typed);
  const isStatic = useStatic();
  const cursorIndex = lines.findLastIndex((line) => line.state !== 'hidden');
  return (
    <figure
      className="kit-terminal"
      data-motion={isStatic ? 'off' : 'on'}
      data-code-lines={items.length}
      data-text-block="">
      <figcaption className="kit-terminal-bar">
        <span className="kit-terminal-title">{title ?? 'Terminal'}</span>
      </figcaption>
      <div className="kit-terminal-body">
        {lines.map((line, index) => (
          <TerminalLineView
            // The session is fixed, so the position is the line's identity.
            // oxlint-disable-next-line react/no-array-index-key
            key={index}
            line={line}
            prompt={prompt}
            cursor={index === cursorIndex}
          />
        ))}
        {cursorIndex === -1 ? (
          <div className="kit-terminal-line" data-kind="cmd" data-state="shown">
            <span className="kit-terminal-prompt" aria-hidden="true">
              {prompt}
            </span>
            <span className="kit-terminal-cursor" aria-hidden="true" />
          </div>
        ) : null}
      </div>
      <StepMarks ats={ats} />
    </figure>
  );
}

/**
 * Props of {@link TerminalLineView}.
 */
type TerminalLineViewProps = {
  /**
   * The line to draw.
   */
  line: TerminalLine;

  /**
   * The prompt before a command.
   */
  prompt: string;

  /**
   * Whether the cursor sits after this line.
   */
  cursor: boolean;
};

/**
 * One line of a terminal session: a prompt for a command, its text and, where the session has
 * reached, the cursor.
 */
function TerminalLineView({ line, prompt, cursor }: TerminalLineViewProps): ReactNode {
  return (
    <div
      className="kit-terminal-line"
      data-kind={line.item.kind}
      data-state={line.state}
      data-tone={line.item.tone ?? 'plain'}>
      {line.item.kind === 'cmd' ? (
        <span className="kit-terminal-prompt" aria-hidden="true">
          {prompt}
        </span>
      ) : null}
      <span className="kit-terminal-text">{line.text}</span>
      {cursor ? <span className="kit-terminal-cursor" aria-hidden="true" /> : null}
    </div>
  );
}

/**
 * The session a terminal's children describe.
 *
 * @param children - `<Cmd>` and `<Out>` elements; anything else is ignored.
 */
function sessionItems(children: ReactNode): TerminalItem[] {
  const items: TerminalItem[] = [];
  for (const child of Children.toArray(children)) {
    if (!isValidElement<{ children?: ReactNode; tone?: TerminalTone; text?: string }>(child)) {
      continue;
    }

    const text = child.props.text ?? textOf(child.props.children);
    if (child.type === Cmd || child.type === Out) {
      checkComponentProps(child.type === Cmd ? 'Cmd' : 'Out', child.props);
    }

    if (child.type === Cmd) {
      items.push({ kind: 'cmd', text });
    } else if (child.type === Out) {
      items.push(
        child.props.tone === undefined
          ? { kind: 'out', text }
          : { kind: 'out', text, tone: child.props.tone },
      );
    }
  }

  return items;
}

/**
 * The text of a command or output written as JSX, every nested element included: a TSX slide may
 * wrap part of a command in an element, and the line must keep it.
 *
 * @param node - The children.
 */
export function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((part) => {
      if (typeof part === 'string' || typeof part === 'number') {
        return String(part);
      }

      return isValidElement<{ children?: ReactNode }>(part) ? textOf(part.props.children) : '';
    })
    .join('');
}

/**
 * Types the active command: counts characters up while the deck moves forward onto a new command. A
 * command already reached when the terminal mounts, going back, static mode and reduced motion show
 * complete at once.
 *
 * @param active - The index of the latest reached command.
 * @param length - The active command's length in characters.
 * @returns Characters typed so far; `undefined` when the command is complete.
 */
function useTyping(active: number, length: number): number | undefined {
  const isStatic = useStatic();
  const previous = useRef(active);
  const [progress, setProgress] = useState<{ command: number; chars: number } | undefined>();
  useEffect(() => {
    const advanced = active > previous.current;
    previous.current = active;
    const animates = advanced && !isStatic && length !== 0 && !prefersReducedMotion();
    if (!animates) {
      setProgress(undefined);
      return undefined;
    }

    const total = typingMs(length);
    const started = performance.now();
    setProgress({ command: active, chars: 0 });
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - started;
      if (elapsed >= total) {
        window.clearInterval(timer);
        setProgress(undefined);
        return;
      }

      setProgress({ command: active, chars: Math.floor((elapsed / total) * length) });
    }, FRAME_MS);
    return () => window.clearInterval(timer);
  }, [active, isStatic, length]);
  return progress?.command === active ? progress.chars : undefined;
}

/**
 * Whether the viewer asked for reduced motion.
 */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
