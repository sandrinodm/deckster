import { useSlide } from '@deckster/engine';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyEvent,
  type ReactNode,
} from 'react';

import { AppChrome } from '#apps/app-chrome.tsx';
import { checkComponentProps } from '#components/check-component-props.ts';
import { useDemoPhase } from '#demo/demo-phase.ts';
import { useStillMotion } from '#motion/still-motion.ts';
import '#demo/demo-stories.css';

/**
 * An available local operation and the visible response it produces.
 */
export type DemoCommand = {
  /**
   * The command's visible name.
   */
  name: string;

  /**
   * The headline shown after running the command.
   */
  result: string;

  /**
   * A few records affected by the command, in presentation order.
   */
  rows: readonly { label: string; detail: string }[];
};

/**
 * Authored states of a command palette demo.
 */
export type CommandDemoProps = {
  /**
   * The name in the workspace title bar.
   */
  workspace: string;

  /**
   * The state of the workspace before opening the palette.
   */
  context: string;

  /**
   * Available operations. Put the scripted operation first.
   */
  commands: readonly [DemoCommand, ...DemoCommand[]];

  /**
   * Whether two slide advances expose the palette and executed result.
   */
  reveal?: boolean;
};

/**
 * Opens a local palette with Ctrl/Command+K and shows the data returned by a chosen command.
 */
export function CommandDemo(props: CommandDemoProps): ReactNode {
  checkComponentProps('CommandDemo', props);
  const { reveal = true } = props;
  const phase = useDemoPhase(reveal);
  const still = useStillMotion();
  const { isActive } = useSlide();
  const enabled = isActive && !still;
  return <CommandSession key={String(enabled)} authored={phase} enabled={enabled} {...props} />;
}

/**
 * Props for the transient session that resets when the slide leaves the stage.
 */
type CommandSessionProps = CommandDemoProps & {
  /**
   * The authored deck phase, from 0 through 2.
   */
  authored: number;

  /**
   * Whether this active copy may listen for keyboard commands.
   */
  enabled: boolean;
};

/**
 * States the presenter can reach manually in addition to the authored deck phases.
 */
type CommandView = { page: 'workspace' | 'palette' } | { page: 'result'; selected: number };

/**
 * Handles live palette input independently of the deck's own step navigation.
 */
function CommandSession({
  workspace,
  context,
  commands,
  authored,
  enabled,
}: CommandSessionProps): ReactNode {
  const [choice, setChoice] = useState<CommandView>();
  const [previous, setPrevious] = useState(authored);
  const [focused, setFocused] = useState(0);
  if (previous !== authored) {
    setPrevious(authored);
    if (authored !== 2 || choice?.page !== 'result') {
      setChoice(undefined);
    }
  }

  const root = useRef<HTMLDivElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const headline = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const view = choice ?? authoredView(authored);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    /**
     * Opens or closes the palette without claiming unrelated deck keys.
     */
    const onKey = (event: KeyboardEvent): void => {
      if (!canHandleShortcut(event, root.current)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setChoice({ page: 'palette' });
      } else if (event.key === 'Escape' && view.page === 'palette') {
        event.preventDefault();
        setChoice({ page: 'workspace' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, view.page]);
  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (view.page === 'palette') {
      options.current[0]?.focus();
    } else if (choice?.page === 'result') {
      headline.current?.focus();
    } else if (choice?.page === 'workspace') {
      trigger.current?.focus();
    }
  }, [choice, enabled, view.page]);
  const selected = view.page === 'result' ? (commands[view.selected] ?? commands[0]) : undefined;
  return (
    <div ref={root} className="kit-demo-story kit-command-story">
      <AppChrome chrome="window" label={workspace}>
        <div className="kit-command-workspace" data-command-view={view.page}>
          <div className="kit-command-toolbar">
            <span className="kit-type-label">{workspace}</span>
            {enabled ? (
              <button
                ref={trigger}
                className="kit-demo-control kit-type-small"
                type="button"
                aria-keyshortcuts="Control+K Meta+K"
                aria-expanded={view.page === 'palette'}
                onClick={() => setChoice({ page: 'palette' })}>
                Commands <kbd>⌘ K</kbd>
              </button>
            ) : (
              <span className="kit-type-small">
                Commands <kbd>⌘ K</kbd>
              </span>
            )}
          </div>
          {selected ? (
            <section className="kit-command-result">
              <div className="kit-demo-status kit-type-label">{selected.name} · Complete</div>
              <h2 ref={headline} tabIndex={-1} className="kit-type-headline">
                {selected.result}
              </h2>
              <dl className="kit-command-rows">
                {selected.rows.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.detail}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : (
            <div className="kit-command-context">
              <h2 className="kit-type-headline">{context}</h2>
            </div>
          )}
          {view.page === 'palette' ? (
            <section
              className="kit-command-palette"
              aria-label="Command palette"
              data-surface="inverse">
              <p className="kit-type-label">Command palette</p>
              {commands.map((command, index) => (
                <div
                  key={command.name}
                  data-selected={index === (enabled ? focused : 0) || undefined}>
                  {enabled ? (
                    <button
                      ref={(button) => {
                        options.current[index] = button;
                      }}
                      type="button"
                      onFocus={() => setFocused(index)}
                      onKeyDown={(event) => focusAdjacent(event, options.current, index)}
                      onClick={() => setChoice({ page: 'result', selected: index })}>
                      {command.name}
                      <kbd aria-hidden="true">↵</kbd>
                    </button>
                  ) : (
                    <span>{command.name}</span>
                  )}
                </div>
              ))}
            </section>
          ) : null}
        </div>
      </AppChrome>
    </div>
  );
}

/**
 * Lets the palette use a shell shortcut only when focus is in the active slide or on the page.
 */
function canHandleShortcut(event: KeyboardEvent, root: HTMLElement | null): boolean {
  if (event.defaultPrevented || event.isComposing || root === null) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof Element) || target === root.ownerDocument.body) {
    return true;
  }

  return root.contains(target);
}

/**
 * Moves focus within the command list. Other keys can still reach the deck.
 */
function focusAdjacent(
  event: ReactKeyEvent<HTMLButtonElement>,
  options: readonly (HTMLButtonElement | null)[],
  index: number,
): void {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const direction = event.key === 'ArrowDown' ? 1 : -1;
  const next = (index + direction + options.length) % options.length;
  options[next]?.focus();
}

/**
 * Maps the scripted phases to their initial workspace, overlay and result.
 */
function authoredView(phase: number): CommandView {
  if (phase === 2) {
    return { page: 'result', selected: 0 };
  }

  return { page: phase === 1 ? 'palette' : 'workspace' };
}
