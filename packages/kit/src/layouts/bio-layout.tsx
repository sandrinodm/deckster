import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { bioLayoutContract } from '#layouts/bio-layout.contract.ts';

import { ContactList } from '#foundation/contact-list.tsx';
import { Portrait } from '#foundation/portrait.tsx';
import { Eyebrow, FittedText, Frame, smartPunctuation, useEnter } from '#layout-parts.ts';
import '#layouts/bio-layout.css';

/**
 * The most lines the name takes before it steps down in size.
 */
const NAME_MAX_LINES = 2;

/**
 * The `bio` layout: the portrait fills the first five columns from the top line to the bottom line;
 * beside it, from the seventh column, the eyebrow and the name on the title line, the role under
 * it, the facts below the title gap and the contacts standing on the bottom line.
 */
function BioLayout({ frontmatter, slots }: LayoutProps<typeof bioLayoutContract>): ReactNode {
  const portraitEnter = useEnter(0);
  const headerEnter = useEnter(0);
  const bodyEnter = useEnter(1);
  const contactsEnter = useEnter(2);
  return (
    <Frame layout="bio">
      <div className="kit-bio-portrait-cell" {...portraitEnter}>
        <Portrait
          className="kit-bio-portrait"
          name={frontmatter.name}
          photo={frontmatter.photo}
          focal={frontmatter.focal}
          treatment={frontmatter.treatment}
        />
      </div>
      <div className="kit-bio-text">
        <header className="kit-header" {...headerEnter}>
          <Eyebrow text={frontmatter.eyebrow} reserve />
          <FittedText
            as="h2"
            className="kit-bio-name kit-heading kit-type-headline"
            maxLines={NAME_MAX_LINES}>
            {frontmatter.name}
          </FittedText>
        </header>
        {frontmatter.role === undefined ? null : (
          <p className="kit-bio-role kit-type-body">{smartPunctuation(frontmatter.role)}</p>
        )}
        {slots.body === undefined ? null : (
          <div className="kit-bio-body kit-prose kit-body" data-text="body" {...bodyEnter}>
            {slots.body}
          </div>
        )}
        <div className="kit-bio-contacts" {...contactsEnter}>
          <ContactList contacts={frontmatter.contacts} className="kit-contacts-stacked" />
        </div>
      </div>
    </Frame>
  );
}

/**
 * The `bio` layout's component.
 */
export const bioLayout = defineLayout<typeof bioLayoutContract>({
  name: 'bio',
  component: BioLayout,
});
