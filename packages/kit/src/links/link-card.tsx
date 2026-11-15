import type { ReactNode } from 'react';

import { checkComponentProps } from '#components/check-component-props.ts';
import { assertSafeHref, displayUrl, linkAttributes } from '#links/link-target.ts';

/**
 * Props of {@link LinkCard}.
 */
export type LinkCardProps = {
  /**
   * Where the card goes. External links open in a new tab.
   */
  href: string;

  /**
   * What the link is, as a short title.
   */
  title: string;

  /**
   * A sentence about it; left out when absent.
   */
  description?: string;

  /**
   * An icon or logo shown at the start of the card, such as an `<img>` or an icon component.
   */
  icon?: ReactNode;
};

/**
 * A card for a link: icon, title, description and the URL as people would say it. The whole card is
 * the link, it is interactive so a click opens it without moving the deck, and external links open
 * in a new tab. In an export it stays a plain link with all its text.
 */
export function LinkCard(props: LinkCardProps): ReactNode {
  checkComponentProps('LinkCard', props);
  const { href, title, description, icon } = props;
  return (
    <a
      className="kit-link-card"
      data-deck-interactive=""
      {...linkAttributes(assertSafeHref('LinkCard', href))}>
      {icon === undefined ? null : (
        <span className="kit-link-card-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="kit-link-card-text">
        <span className="kit-type-title kit-link-card-title">{title}</span>
        {description === undefined ? null : (
          <span className="kit-type-small kit-link-card-description">{description}</span>
        )}
        <span className="kit-type-small kit-link-card-url">{displayUrl(href)}</span>
      </span>
    </a>
  );
}
