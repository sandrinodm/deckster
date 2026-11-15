import type { ReactNode } from 'react';

import { linkAttributes, safeHref } from '#links/link-target.ts';

/**
 * Props of {@link Link}.
 */
export type LinkProps = {
  /**
   * The destination, from a markdown link `[text](href)`.
   */
  href?: string;

  /**
   * The link text.
   */
  children?: ReactNode;
};

/**
 * What a markdown link in a slide becomes: a link in the brand's link style (the accent,
 * underlined) that opens outside sites in a new tab, so the deck stays open, and that is marked
 * interactive, so a click follows it instead of moving the deck. A destination with an unsafe
 * scheme (`javascript:`, `data:`, however it is hidden with tabs or control characters) is drawn as
 * plain text; a safe one is rendered as the browser reads it.
 */
export function Link({ href, children }: LinkProps): ReactNode {
  const safe = href === undefined ? undefined : safeHref(href);
  if (safe === undefined) {
    return (
      <span className="kit-link" data-refused-link="">
        {children}
      </span>
    );
  }

  return (
    <a className="kit-link" data-deck-interactive="" {...linkAttributes(safe)}>
      {children}
    </a>
  );
}
