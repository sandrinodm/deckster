import type { ReactNode } from 'react';

import { checkComponentProps } from '#components/check-component-props.ts';
import { safeDownloadPath } from '#links/link-target.ts';

/**
 * Props of {@link Download}.
 */
export type DownloadProps = {
  /**
   * The file, relative to the built deck, such as `exemplars.pdf`: `deckster build --with-exports`
   * writes `<deck>.pdf` and `<deck>.pptx` beside the deck's `index.html`. A relative path works
   * when the deck is hosted under a subpath and when it is opened from `file://`.
   */
  file: string;

  /**
   * `solid` (default) fills the button with the brand accent; `outline` draws it as a ring.
   */
  variant?: 'solid' | 'outline';

  /**
   * The label, such as `Download the slides (PDF)`.
   */
  children: ReactNode;
};

/**
 * A button that downloads one of the deck's exports, styled like `<Button>`. It is interactive, so
 * a click downloads the file and does not move the deck. A deck built without `--with-exports` has
 * no file to download. The file must be a relative path: a scheme (`javascript:`, `https:`), a host
 * or a leading slash is refused.
 *
 * @throws Error naming the file and the fix when it is not a relative path.
 */
export function Download(props: DownloadProps): ReactNode {
  checkComponentProps('Download', props);
  const { variant = 'solid', children } = props;
  const file = safeDownloadPath(props.file);
  if (file === undefined) {
    throw new Error(
      `<Download file=${JSON.stringify(props.file)}> is refused: a download is a file beside ` +
        'the built deck, written as a relative path such as `talk.pdf`.',
    );
  }

  return (
    <a
      className="kit-type-body kit-link-button"
      data-deck-interactive=""
      data-variant={variant}
      data-download=""
      href={file}
      download={file.split('/').at(-1)}>
      {children}
    </a>
  );
}
