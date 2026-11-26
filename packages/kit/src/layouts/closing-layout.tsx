import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { closingLayoutContract } from '#layouts/closing-layout.contract.ts';

import { ContactList } from '#foundation/contact-list.tsx';
import { BrandLogo, Eyebrow, FittedText, Frame, useEnter } from '#layout-parts.ts';
import { displayUrl } from '#links/link-target.ts';
import { QR } from '#links/qr.tsx';
import '#layouts/closing-layout.css';

/**
 * The most lines the closing title takes before it steps down in size.
 */
const TITLE_MAX_LINES = 2;

/**
 * The logo's height, as a multiple of the brand's chrome logo height: as on the cover.
 */
const LOGO_SCALE = 1.5;

/**
 * The QR code's size on the canvas, quiet zone included: read from the back of a room.
 */
const QR_SIZE_PX = 264;

/**
 * The longest address under the QR code, in characters, set at the small size; a longer one is set
 * at the caption size so it keeps to two lines broken at its slashes and dots.
 */
const QR_SHORT_ADDRESS_CHARS = 24;

/**
 * The number of contacts from which each is set at the caption size, so an address keeps to one
 * line in its third of the row.
 */
const CAPTION_CONTACTS = 3;

/**
 * The `closing` layout, the cover's counterpart: the brand logo on the top line; eyebrow, title and
 * the line under it standing above a rule, beside the QR code in the last three columns; the
 * contacts under the rule on the bottom line.
 */
function ClosingLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof closingLayoutContract>): ReactNode {
  const mainEnter = useEnter(0);
  const qrEnter = useEnter(1);
  const contactsEnter = useEnter(2);
  const hasQr = frontmatter.qr !== undefined;
  const contactCount = frontmatter.contacts?.length ?? 0;
  const hasContacts = contactCount > 0;
  const contactTextType = contactCount >= CAPTION_CONTACTS ? 'caption' : 'small';
  const address = frontmatter.qr === undefined ? '' : displayUrl(frontmatter.qr);
  return (
    <Frame
      layout="closing"
      variant={{
        'data-qr': String(hasQr),
        'data-qr-long': String(address.length > QR_SHORT_ADDRESS_CHARS),
        'data-contacts': String(contactCount),
      }}>
      <div className="kit-closing-logo">
        <BrandLogo scale={LOGO_SCALE} />
      </div>
      <div className="kit-closing-main">
        <div className="kit-closing-message" {...mainEnter}>
          <Eyebrow text={frontmatter.eyebrow} />
          <FittedText
            as="h2"
            className="kit-closing-title kit-heading kit-type-display"
            maxLines={TITLE_MAX_LINES}
            boundary=".kit-closing-main">
            {frontmatter.title}
          </FittedText>
          {slots.body === undefined ? null : (
            <div className="kit-closing-subtitle kit-prose" data-text="lead">
              {slots.body}
            </div>
          )}
        </div>
        {frontmatter.qr === undefined ? null : (
          <div className="kit-closing-qr" {...qrEnter}>
            <QR value={frontmatter.qr} size={QR_SIZE_PX} />
          </div>
        )}
      </div>
      {hasContacts ? (
        <div className="kit-closing-contacts" {...contactsEnter}>
          <ContactList contacts={frontmatter.contacts} textType={contactTextType} />
        </div>
      ) : null}
    </Frame>
  );
}

/**
 * The `closing` layout's component.
 */
export const closingLayout = defineLayout<typeof closingLayoutContract>({
  name: 'closing',
  component: ClosingLayout,
});
