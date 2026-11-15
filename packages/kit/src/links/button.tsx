import type { ReactNode } from 'react';

import { checkComponentProps } from '#components/check-component-props.ts';
import { assertSafeHref, linkAttributes } from '#links/link-target.ts';

/**
 * Props of {@link Button}.
 */
export type ButtonProps = {
  /**
   * Where the button goes: an `http:`, `https:`, `mailto:` or `tel:` URL, a path or a `#` fragment;
   * any other scheme (`javascript:`) is refused. External links open in a new tab.
   */
  href: string;

  /**
   * `solid` (default) fills the button with the brand accent; `outline` draws it as a ring.
   */
  variant?: 'solid' | 'outline';

  /**
   * The label.
   */
  children: ReactNode;
};

/**
 * A call-to-action link for slides, in the brand's accent. It is interactive, so a click opens the
 * link and does not move the deck, and external links open in a new tab. In an export it stays a
 * plain link.
 */
export function Button(props: ButtonProps): ReactNode {
  checkComponentProps('Button', props);
  const { href, variant = 'solid', children } = props;
  return (
    <a
      className="kit-type-body kit-link-button"
      data-deck-interactive=""
      data-variant={variant}
      {...linkAttributes(assertSafeHref('Button', href))}>
      {children}
    </a>
  );
}
