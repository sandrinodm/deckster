import type { ReactNode } from 'react';

import { langLabel } from '#code/lang-label.ts';

/**
 * Props of {@link CodeFrame}.
 */
type CodeFrameProps = {
  /**
   * The file name for the title bar.
   */
  file: string | undefined;

  /**
   * The language id, which gives the label unless `label` says otherwise.
   */
  lang: string | undefined;

  /**
   * Text for the label, or `false` or an empty string to leave it out. Defaults to the language's
   * name.
   */
  label: string | false | undefined;

  /**
   * Set on the frame as `data-kind` so styles can tell blocks from terminals and animations.
   */
  kind: 'code' | 'move';

  /**
   * The code area's content.
   */
  children: ReactNode;
};

/**
 * The label to show: the author's text, none when they turned it off, or the language's name.
 *
 * @param label - The `label` prop.
 * @param lang - The language id.
 */
function labelText(
  label: string | false | undefined,
  lang: string | undefined,
): string | undefined {
  if (label === undefined) {
    return langLabel(lang);
  }

  return label === false || label === '' ? undefined : label;
}

/**
 * The frame around a block of code: the code background of the surface, a rounded outline, and an
 * optional title bar with the file name on the left and the language on the right. Without a file
 * name or a label there is no bar.
 */
export function CodeFrame({ file, lang, label, kind, children }: CodeFrameProps): ReactNode {
  const shownLabel = labelText(label, lang);
  const hasBar = file !== undefined || shownLabel !== undefined;
  return (
    <figure className="kit-code" data-kind={kind} data-bar={hasBar} data-text-block="">
      {hasBar ? <CodeBar file={file} label={shownLabel} /> : null}
      {children}
    </figure>
  );
}

/**
 * Props of {@link CodeBar}.
 */
type CodeBarProps = {
  /**
   * The file name, on the left; `undefined` leaves it out.
   */
  file: string | undefined;

  /**
   * The label, on the right; `undefined` leaves it out.
   */
  label: string | undefined;
};

/**
 * The title bar of a code frame.
 */
function CodeBar({ file, label }: CodeBarProps): ReactNode {
  return (
    <figcaption className="kit-code-bar">
      <span className="kit-code-file">{file}</span>
      {label === undefined ? null : <span className="kit-code-lang kit-type-label">{label}</span>}
    </figcaption>
  );
}
