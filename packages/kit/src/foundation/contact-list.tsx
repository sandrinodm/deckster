import type { ReactNode } from 'react';

import type { ContactEntry } from '#layouts/layout-fields.ts';

import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { Link } from '#links/link.tsx';
import '#foundation/contact-list.css';

/**
 * Props of {@link ContactList}.
 */
type ContactListProps = {
  /**
   * The contacts, in order.
   */
  contacts: readonly ContactEntry[] | undefined;

  /**
   * Extra classes for the list, for the layout's arrangement.
   */
  className?: string;

  /**
   * The type step of the addresses: `small` (the default), or `caption` where several share a row.
   */
  textType?: 'small' | 'caption';
};

/**
 * Ways to reach someone or follow up: each a label in the brand's label style over the address or
 * URL, which is a link when the contact has an `href`. Nothing renders for none.
 */
export function ContactList({
  contacts,
  className,
  textType = 'small',
}: ContactListProps): ReactNode {
  if (contacts === undefined || contacts.length === 0) {
    return null;
  }

  return (
    <ul className={className === undefined ? 'kit-contacts' : `kit-contacts ${className}`}>
      {contacts.map((contact, index) => (
        <li key={index} className="kit-contact">
          <span className="kit-contact-label kit-type-label">
            {smartPunctuation(contact.label)}
          </span>
          <span className={`kit-contact-text kit-type-${textType}`}>
            {contact.href === undefined ? (
              contact.text
            ) : (
              <Link href={contact.href}>{contact.text}</Link>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
