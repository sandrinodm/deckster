import { useStatic, useStep } from '@deckster/engine';
import { useRef, type ReactNode } from 'react';

import type { HighlightInput } from '#code/highlight-spec.ts';

import { CodeFrame } from '#code/code-frame.tsx';
import { CodeLines } from '#code/code-lines.tsx';
import { focusAt, highlightAts, parseHighlight } from '#code/highlight-spec.ts';
import { StepMarks } from '#code/step-marks.tsx';
import { useCodeFit } from '#code/use-code-fit.ts';
import { useHighlightedCode } from '#code/use-highlighted-code.ts';
import { checkComponentProps } from '#components/check-component-props.ts';

/**
 * Props of {@link Code}.
 */
export type CodeProps = {
  /**
   * The source code. In an MDX slide a literal `code` is highlighted at build time; a fenced block
   * is the usual way to write one. In TSX it is highlighted in the browser, which holds the slide's
   * readiness until it is done.
   */
  code?: string;

  /**
   * The source as the tag's child, an alternative to `code`.
   */
  children?: string;

  /**
   * The language id, such as `ts`, `tsx`, `bash` or `json`; plain text when left out.
   */
  lang?: string;

  /**
   * The block highlighted at build time, as JSON. The build writes it; do not set it by hand.
   */
  data?: string;

  /**
   * The file name in the title bar.
   */
  file?: string;

  /**
   * The language label in the title bar; `false` or an empty string hides it. Defaults to the
   * language's name.
   */
  label?: string | false;

  /**
   * Show line numbers.
   */
  lineNumbers?: boolean;

  /**
   * The number of the first line; defaults to 1. Highlights count lines by the numbers shown.
   */
  start?: number;

  /**
   * Lines to focus, by step. A string of steps separated by `|` (`'2-4|7'`), a list with one entry
   * per step, or an object keyed by step number (`{ 1: '2-4', 2: '7' }`). Each step is a deck step:
   * pressing next moves the focus. Lines outside the focus fade back unless `dim` is `false`.
   */
  highlight?: HighlightInput;

  /**
   * The step the first entry of a `highlight` string or list shows at; defaults to 1.
   */
  at?: number;

  /**
   * Whether lines outside the focus fade back; defaults to `true`.
   */
  dim?: boolean;

  /**
   * Treat a leading `+` or `-` on each line as an addition or a removal. Lines can also end with
   * `// [!code ++]` or `// [!code --]`.
   */
  diff?: boolean;

  /**
   * Words to mark wherever they appear in the block.
   */
  words?: readonly string[];
};

/**
 * The empty list of words, kept stable between renders.
 */
const NO_WORDS: readonly string[] = [];

/**
 * A syntax-highlighted block of code in a frame, colored by the brand's code theme of the slide's
 * surface. A block written as a fence or a literal `code` is highlighted when the deck is built, so
 * the browser needs no highlighter for it.
 *
 * `highlight` focuses lines step by step: the lines outside the focus fade back. Lines may be
 * marked as added or removed (`diff`, or `// [!code ++]` and `// [!code --]`), and `words` marks
 * words inside lines. The font steps down within the brand's limits for long lines; beyond that the
 * lines run past the frame and `deck lint` reports the overflow.
 *
 * ```mdx
 * ```ts title="server.ts" {2-3|5} lineNumbers
 * const app = createApp();
 * app.use(cors());
 * app.use(auth());
 *
 * app.listen(3000);
 * ```
 */
export function Code(props: CodeProps): ReactNode {
  checkComponentProps('Code', props);
  const { highlight, at, dim = true, diff = false, words = NO_WORDS, start = 1 } = props;
  const source = props.code ?? props.children;
  const highlighted = useHighlightedCode({
    data: props.data,
    code: source,
    lang: props.lang,
    diff,
    words,
  });
  const steps = parseHighlight(highlight, at);
  const focus = focusAt(steps, useStep());
  const areaRef = useRef<HTMLDivElement | null>(null);
  useCodeFit(areaRef);
  const isStatic = useStatic();
  return (
    <CodeFrame file={props.file} lang={props.lang} label={props.label} kind="code">
      <div
        ref={areaRef}
        className="kit-code-area"
        data-motion={isStatic ? 'off' : 'on'}
        data-focused={focus !== undefined}>
        <pre className="kit-code-pre">
          <code>
            {highlighted === undefined ? null : (
              <CodeLines
                code={highlighted}
                lineNumbers={props.lineNumbers ?? false}
                start={start}
                focus={focus}
                dim={dim}
              />
            )}
          </code>
        </pre>
      </div>
      <StepMarks ats={highlightAts(steps)} />
    </CodeFrame>
  );
}
