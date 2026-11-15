// @vitest-environment happy-dom
import type { OpenComment, PickedElement } from '@deckster/comments/picker';

import { act, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import type { AgentProblem } from '#protocol/agent-events.ts';

import { keepKeysInPanel } from '#runtime/agent-panel.tsx';
import {
  INITIAL_AGENT_STATE,
  reduceConnection,
  type AgentViewState,
  type TurnView,
} from '#runtime/agent-store.ts';
import { Composer } from '#runtime/composer.tsx';
import { ContextChips } from '#runtime/context-chips.tsx';
import { parseUnifiedDiff } from '#runtime/diff-view.tsx';
import { button, click, pressKey, render, type Rendered } from '#runtime/render.fixture.tsx';
import { StatusBanner } from '#runtime/status.tsx';
import { TurnFooter, type TurnFooterProps } from '#runtime/turn-footer.tsx';

/**
 * The component under test, unmounted after each test.
 */
let mounted: Rendered | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

/**
 * Types text into a controlled text area.
 *
 * @param area - The text area.
 * @param text - The new value.
 */
function typeInto(area: HTMLTextAreaElement, text: string): void {
  act(() => {
    // React tracks the value it last set; the prototype's setter goes around that, as typing does.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    const setter: unknown = Reflect.get(descriptor ?? {}, 'set');
    if (typeof setter === 'function') {
      Reflect.apply(setter, area, [text]);
    }

    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/**
 * The composer with its own draft state, inside an element that keeps keys like the panel does.
 *
 * @param props - What the test watches and whether a turn runs.
 */
function ComposerHarness(props: {
  readonly running?: boolean;
  readonly queued?: number;
  readonly onSubmit: (text: string) => void;
  readonly onStop?: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [shot, setShot] = useState(true);
  return (
    <section onKeyDown={keepKeysInPanel}>
      <Composer
        draft={draft}
        onDraft={setDraft}
        onSubmit={() => {
          props.onSubmit(draft);
          setDraft('');
        }}
        onStop={props.onStop ?? (() => undefined)}
        running={props.running ?? false}
        queued={props.queued ?? 0}
        screenshot={shot}
        onScreenshot={setShot}
        focusTick={0}
        provider="Claude"
      />
    </section>
  );
}

describe('Composer', () => {
  it('sends on Enter, keeps Shift+Enter as a new line, and never lets a key reach the deck', () => {
    const sent: string[] = [];
    const deckKeys: string[] = [];
    /**
     * Stands in for the deck's window key listener.
     *
     * @param event - The key press.
     */
    const onWindowKey = (event: KeyboardEvent) => deckKeys.push(event.key);
    window.addEventListener('keydown', onWindowKey);
    mounted = render(<ComposerHarness onSubmit={(text) => sent.push(text)} />);
    const area = mounted.container.querySelector('textarea');
    if (area === null) {
      throw new Error('no input');
    }

    pressKey(area, 'Enter');
    expect(sent).toEqual([]);
    typeInto(area, 'Shorter title');
    const newline = pressKey(area, 'Enter', { shiftKey: true });
    expect(newline.defaultPrevented).toBe(false);
    for (const key of ['ArrowRight', ' ', 'PageDown', 'a', 's']) {
      pressKey(area, key);
    }

    pressKey(area, 'Enter');
    expect(sent).toEqual(['Shorter title']);
    expect(area.value).toBe('');
    expect(deckKeys).toEqual([]);
    window.removeEventListener('keydown', onWindowKey);
  });

  it('gives the keys back to the deck on Escape', () => {
    mounted = render(<ComposerHarness onSubmit={() => undefined} />);
    const area = mounted.container.querySelector('textarea');
    area?.focus();
    expect(document.activeElement).toBe(area);
    if (area !== null) {
      pressKey(area, 'Escape');
    }

    expect(document.activeElement).not.toBe(area);
  });

  it('turns Send into Stop while a turn runs, and queues text typed meanwhile', () => {
    const sent: string[] = [];
    const stop = vi.fn();
    mounted = render(
      <ComposerHarness running queued={1} onSubmit={(text) => sent.push(text)} onStop={stop} />,
    );
    const { container } = mounted;
    expect(() => button(container, /Send/)).toThrow('No button named');
    click(button(container, /Stop/));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('1 queued');

    const area = container.querySelector('textarea');
    if (area === null) {
      throw new Error('no input');
    }

    typeInto(area, 'Then this');
    click(button(container, /Queue/));
    expect(sent).toEqual(['Then this']);
  });

  it('toggles the screenshot', () => {
    mounted = render(<ComposerHarness onSubmit={() => undefined} />);
    const toggle = button(mounted.container, /Screenshot/);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('ContextChips', () => {
  /**
   * A picked heading.
   */
  const PICKED: PickedElement = {
    element: document.createElement('h1'),
    stamp: 'slides/title.mdx:7:1',
    chrome: false,
    tag: 'h1',
    text: 'Hello, deck',
    label: 'h1 · slides/title.mdx:7',
  };

  /**
   * An open comment.
   */
  const COMMENT: OpenComment = {
    id: 'c-1',
    number: 1,
    text: 'Shorter, please.',
    type: 'fix',
    step: 0,
    location: 'decks/hello/slides/title.mdx:7:1',
  };

  it('shows the slide, the picked element and the comments, and acts on each', () => {
    const onPick = vi.fn();
    const onClear = vi.fn();
    const onToggle = vi.fn();
    mounted = render(
      <ContextChips
        slide={{ number: 1, title: 'Hello, deck', file: 'slides/title.mdx', step: 1, stepCount: 3 }}
        picked={PICKED}
        pickedElsewhere={false}
        picking={false}
        comments={[COMMENT]}
        attached={['c-1']}
        onPick={onPick}
        onClearPicked={onClear}
        onToggleComment={onToggle}
      />,
    );
    const { container } = mounted;
    expect(container.querySelector('[data-kind="slide"]')?.textContent).toBe(
      'Hello, decktitle.mdx · step 1/2',
    );
    expect(container.querySelector('[data-kind="element"]')?.textContent).toContain(
      'h1“Hello, deck”title.mdx:7',
    );
    const comment = container.querySelector('[data-kind="comment"]');
    expect(comment?.getAttribute('aria-pressed')).toBe('true');
    click(comment);
    expect(onToggle).toHaveBeenCalledWith('c-1');
    click(button(container, /Remove the picked element/));
    expect(onClear).toHaveBeenCalled();
    click(button(container, 'Pick another'));
    expect(onPick).toHaveBeenCalled();
  });

  it('says how to cancel while picking', () => {
    mounted = render(
      <ContextChips
        slide={undefined}
        picked={undefined}
        pickedElsewhere={false}
        picking
        comments={[]}
        attached={[]}
        onPick={() => undefined}
        onClearPicked={() => undefined}
        onToggleComment={() => undefined}
      />,
    );
    const pick = button(mounted.container, /Picking/);
    expect(pick.getAttribute('aria-pressed')).toBe('true');
    expect(pick.textContent).toContain('Esc to cancel');
  });
});

describe('TurnFooter', () => {
  /**
   * A finished turn that changed the title slide and linted clean.
   */
  const TURN: TurnView = {
    turn: 4,
    kind: 'user',
    prompt: 'Shorter',
    phase: 'completed',
    position: null,
    slide: { id: 'title', file: 'decks/hello/slides/title.mdx', step: 0 },
    provider: 'claude',
    model: null,
    items: [],
    changedFiles: [{ path: 'decks/hello/slides/title.mdx', kind: 'update' }],
    durationMs: 12_400,
    usage: { inputTokens: 12_000, cachedInputTokens: 9000, outputTokens: 420, costUsd: 0.042 },
    lint: { ok: true, slides: ['title'], errors: 0, warnings: 0, findings: [], autoFix: false },
    autoFixOf: null,
    history: 'applied',
    error: null,
    skipped: [],
    conflicts: [],
    reverted: null,
    at: 0,
  };

  /**
   * Renders the footer with defaults.
   *
   * @param props - What to change.
   */
  function footer(props: Partial<TurnFooterProps> = {}) {
    return (
      <TurnFooter
        turn={TURN}
        deck="hello"
        diff={undefined}
        linting={false}
        busy={false}
        canUndo
        canRedo={false}
        problem={null}
        provider="Claude"
        onDiff={() => undefined}
        onUndo={() => undefined}
        onRedo={() => undefined}
        {...props}
      />
    );
  }

  it('says quietly what the guard ignored, with the paths behind a disclosure', () => {
    mounted = render(
      footer({
        turn: {
          ...TURN,
          reverted: {
            paths: [
              { path: 'decks/hello/deck.config.ts', what: 'changed, put back' },
              { path: 'decks/hello/slides/styles.css', what: 'not content' },
            ],
            copies: '.deck/agent/hello/reverted/4',
          },
        },
      }),
    );
    const details = mounted.container.querySelector('details.da-reverted');
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toBe(
      'Ignored 2 changes outside the slides: deck.config.ts, slides/styles.css',
    );
    expect(details?.textContent).toContain('slides/styles.css not content');
    expect(details?.textContent).toContain('.deck/agent/hello/reverted/4');
  });

  it('says which of the person’s edits it kept over the agent’s', () => {
    mounted = render(footer({ turn: { ...TURN, conflicts: ['decks/hello/slides/title.mdx'] } }));
    const note = mounted.container.querySelector('[data-conflicts]');
    expect(note?.textContent).toContain('Kept your edit of slides/title.mdx');
    expect(note?.textContent).toContain('its change was not applied');
  });

  it('lists the file, a clean lint, duration, tokens and cost, and Undo', () => {
    const onUndo = vi.fn();
    mounted = render(footer({ onUndo }));
    const text = mounted.container.textContent ?? '';
    expect(text).toContain('slides/title.mdx');
    expect(text).toContain('Lint clean');
    expect(text).toContain('12.4 s · 12.0k in · 420 out · $0.042');
    click(button(mounted.container, /Undo/));
    expect(onUndo).toHaveBeenCalled();
  });

  it('disables Undo while a turn runs', () => {
    mounted = render(footer({ busy: true }));
    expect(button(mounted.container, /Undo/).disabled).toBe(true);
  });

  it('shows the journal refusing an undo', () => {
    const conflict: AgentProblem = {
      kind: 'conflict',
      message:
        'decks/hello/slides/title.mdx changed after turn 4, so undoing it would overwrite that change.',
      fix: 'Undo that edit by hand first, or ask the agent to make the change you want.',
    };
    mounted = render(footer({ problem: conflict }));
    expect(mounted.container.querySelector('[data-kind="conflict"]')?.textContent).toContain(
      'changed after turn 4',
    );
  });

  it('opens a file’s diff on click', () => {
    const onDiff = vi.fn();
    mounted = render(footer({ onDiff }));
    click(mounted.container.querySelector('.da-file'));
    expect(onDiff).toHaveBeenCalled();
    expect(mounted.container.textContent).toContain('Loading the diff');
    mounted.rerender(
      footer({
        onDiff,
        diff: {
          state: 'ready',
          files: [
            {
              path: 'decks/hello/slides/title.mdx',
              kind: 'update',
              added: 1,
              removed: 1,
              binary: false,
              truncated: false,
              hunks: [
                {
                  oldStart: 5,
                  oldLines: 1,
                  newStart: 5,
                  newLines: 1,
                  lines: ['-# Hello, deck', '+# Hi'],
                },
              ],
            },
          ],
        },
      }),
    );
    const lines = [...mounted.container.querySelectorAll('.da-diff-line')].map(
      (line) => line.getAttribute('data-sign') ?? ' ',
    );
    expect(lines).toEqual(['-', '+']);
    expect(mounted.container.textContent).toContain('+1−1');
  });

  it('lists lint findings with their rule and fix, and says an auto-fix follows', () => {
    mounted = render(
      footer({
        turn: {
          ...TURN,
          lint: {
            ok: false,
            slides: ['title'],
            errors: 1,
            warnings: 0,
            autoFix: true,
            findings: [
              {
                slide: 'title',
                file: 'decks/hello/slides/title.mdx',
                step: null,
                rule: 'title-length',
                severity: 'error',
                message: 'The title is too long.',
                fix: 'Shorten it.',
              },
            ],
          },
        },
      }),
    );
    const text = mounted.container.textContent ?? '';
    expect(text).toContain('Lint: 1 error');
    expect(text).toContain('auto-fix follows');
    expect(text).toContain('title-length');
    expect(text).toContain('Shorten it.');
  });

  it('says only how a turn ended when it changed nothing', () => {
    mounted = render(
      footer({
        turn: { ...TURN, phase: 'cancelled', changedFiles: [], lint: null, usage: null },
        canUndo: false,
      }),
    );
    expect(mounted.container.textContent).toBe('Stopped · 12.4 s');
  });
});

describe('StatusBanner', () => {
  /**
   * A connected state whose host reports a problem.
   *
   * @param problem - The problem, or null.
   */
  function withProblem(problem: AgentProblem | null): AgentViewState {
    return {
      ...reduceConnection(INITIAL_AGENT_STATE, 'open'),
      status: {
        provider: 'codex',
        model: null,
        deck: 'hello',
        panel: 'right',
        version: '0.167.2',
        ready: problem === null,
        problem,
        running: null,
        queued: 0,
        canUndo: false,
        canRedo: false,
      },
    };
  }

  it('shows connecting, then reconnecting after a drop', () => {
    mounted = render(<StatusBanner view={INITIAL_AGENT_STATE} shownInline={false} />);
    expect(mounted.container.textContent).toContain('Connecting');
    const dropped = reduceConnection(reduceConnection(INITIAL_AGENT_STATE, 'open'), 'connecting');
    mounted.rerender(<StatusBanner view={dropped} shownInline={false} />);
    expect(mounted.container.textContent).toContain('Reconnecting');
  });

  it('names the command to sign in, with a copy button', () => {
    mounted = render(
      <StatusBanner
        view={withProblem({
          kind: 'not-signed-in',
          message: 'Codex is not signed in.',
          fix: 'Run `codex login` in a terminal (or set CODEX_API_KEY), then send the prompt again.',
        })}
        shownInline={false}
      />,
    );
    expect(mounted.container.textContent).toContain('Not signed in to Codex');
    expect(mounted.container.querySelector('.da-command code')?.textContent).toBe('codex login');
    expect(button(mounted.container, 'Copy codex login')).toBeDefined();
  });

  it('keeps MCP tools being unavailable quiet, and says nothing when all is well', () => {
    mounted = render(
      <StatusBanner
        view={withProblem({ kind: 'mcp-unavailable', message: 'No tools.', fix: '' })}
        shownInline={false}
      />,
    );
    expect(mounted.container.querySelector('.da-banner')?.getAttribute('data-tone')).toBe('quiet');
    expect(mounted.container.textContent).toContain('The agent still works');
    mounted.rerender(<StatusBanner view={withProblem(null)} shownInline={false} />);
    expect(mounted.container.textContent).toBe('');
  });

  it('leaves a problem the newest turn already shows to the transcript', () => {
    mounted = render(
      <StatusBanner
        view={withProblem({ kind: 'quota', message: 'Out of credit.', fix: 'Wait.' })}
        shownInline
      />,
    );
    expect(mounted.container.textContent).toBe('');
  });
});

describe('parseUnifiedDiff', () => {
  it('reads hunk headers and lines, and skips file headers', () => {
    expect(parseUnifiedDiff('--- a/x\n+++ b/x\n@@ -3,2 +3,2 @@\n a\n-b\n+c\n')).toEqual([
      { oldStart: 3, oldLines: 2, newStart: 3, newLines: 2, lines: [' a', '-b', '+c'] },
    ]);
  });
});

describe('TurnFooter, with the journal’s file marks', () => {
  /**
   * A finished turn whose files carry every mark.
   */
  const MARKED: TurnView = {
    turn: 5,
    kind: 'user',
    prompt: 'Swap the picture',
    phase: 'completed',
    position: null,
    slide: null,
    provider: 'claude',
    model: null,
    items: [],
    changedFiles: [
      { path: 'decks/hello/assets/huge.mov', kind: 'update', undoable: false },
      { path: 'decks/hello/slides/title.mdx', kind: 'update', concurrentEdit: true },
    ],
    durationMs: 2000,
    usage: null,
    lint: {
      ok: true,
      slides: ['title'],
      errors: 0,
      warnings: 0,
      findings: [],
      autoFix: false,
      existing: [
        {
          slide: 'title',
          file: 'decks/hello/slides/title.mdx',
          step: null,
          rule: 'contrast',
          severity: 'error',
          message: 'The caption is too faint.',
          fix: 'Use the text colour.',
        },
      ],
    },
    autoFixOf: null,
    history: 'applied',
    error: null,
    skipped: [],
    conflicts: [],
    reverted: null,
    at: 0,
  };

  /**
   * The footer of the marked turn.
   *
   * @param turn - What to change in the turn.
   */
  function marked(turn: Partial<TurnView> = {}) {
    return (
      <TurnFooter
        turn={{ ...MARKED, ...turn }}
        deck="hello"
        diff={undefined}
        linting={false}
        busy={false}
        canUndo={turn.history !== 'undone'}
        canRedo={false}
        problem={null}
        provider="Claude"
        onDiff={() => undefined}
        onUndo={() => undefined}
        onRedo={() => undefined}
      />
    );
  }

  it('marks files too large to undo and edited by someone else, and says what undo leaves', () => {
    mounted = render(marked());
    const text = mounted.container.textContent ?? '';
    expect(text).toContain('too large to undo');
    expect(text).toContain('also edited by you during this turn');
    expect(text).toContain('Undo leaves assets/huge.mov as it is: too large to undo.');
    expect(button(mounted.container, /Undo/).title).toContain('except assets/huge.mov');
  });

  it('folds findings that were already there, apart from the turn’s own clean result', () => {
    mounted = render(marked());
    const fold = mounted.container.querySelector('details.da-existing');
    expect(fold?.hasAttribute('open')).toBe(false);
    expect(fold?.querySelector('summary')?.textContent).toContain(
      '1 finding was already there before this turn',
    );
    expect(mounted.container.querySelector('.da-lint[data-state="clean"]')?.textContent).toBe(
      'No new lint findings',
    );
    expect(mounted.container.querySelector('.da-lint[data-state="errors"]')).toBeNull();
  });

  it('names the files an undo could not restore', () => {
    mounted = render(
      marked({
        history: 'undone',
        skipped: [{ path: 'decks/hello/assets/huge.mov', kind: 'update' }],
      }),
    );
    expect(mounted.container.textContent).toContain(
      'Not restored (too large to undo): assets/huge.mov.',
    );
  });
});
