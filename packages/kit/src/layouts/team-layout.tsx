import type { ReactNode } from 'react';

import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';

import type { teamLayoutContract } from '#layouts/team-layout.contract.ts';

import { Portrait } from '#foundation/portrait.tsx';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { enterProps, useEnter } from '#motion/enter.ts';
import '#layouts/team-layout.css';

/**
 * How the people are arranged: one row of portraits, a grid of cards with the name beside the
 * portrait, or a roster in two columns.
 */
type TeamArrangement = 'row' | 'grid' | 'roster';

/**
 * The most people that stand in one row of portraits.
 */
const MAX_ROW = 4;

/**
 * The most people in the grid of three columns.
 */
const MAX_GRID = 6;

/**
 * The entrance order of the first person; the header and context come before.
 */
const FIRST_MEMBER_ORDER = 2;

/**
 * The `team` layout: the shared header and an optional line of context, then the people in the
 * space down to the footnote. Three or four stand in a row of equal columns, each portrait as tall
 * as the region leaves above the name and role; five or six are cards in three columns, the name
 * beside a square portrait; seven or eight are a roster of two columns, a smaller square beside one
 * line each of name and role. Every portrait in a slide has the same shape and crop.
 */
function TeamLayout({ frontmatter, slots }: LayoutProps<typeof teamLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const { members } = frontmatter;
  const arrangement = arrangementOf(members.length);
  const roleType = arrangement === 'row' ? 'kit-type-body' : 'kit-type-small';
  return (
    <Frame
      layout="team"
      variant={{ 'data-count': String(members.length), 'data-arrangement': arrangement }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      {slots.body === undefined ? null : (
        <div className="kit-team-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region className="kit-team-region">
        <ul className="kit-team">
          {members.map((member, index) => (
            <li
              key={index}
              className="kit-team-member"
              {...enterProps(FIRST_MEMBER_ORDER + index, isStatic)}>
              <Portrait
                className="kit-team-portrait"
                name={member.name}
                photo={member.photo}
                focal={member.focal}
                treatment={frontmatter.treatment}
              />
              <div className="kit-team-text">
                <p
                  className="kit-team-name kit-heading kit-type-title"
                  data-fit={arrangement === 'row' ? undefined : 'scaled'}>
                  {smartPunctuation(member.name)}
                </p>
                <p className={`kit-team-role ${roleType}`}>{smartPunctuation(member.role)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * How a team of `count` is arranged.
 *
 * @param count - The number of people.
 */
function arrangementOf(count: number): TeamArrangement {
  if (count <= MAX_ROW) {
    return 'row';
  }

  return count <= MAX_GRID ? 'grid' : 'roster';
}

/**
 * The `team` layout's component.
 */
export const teamLayout = defineLayout<typeof teamLayoutContract>({
  name: 'team',
  component: TeamLayout,
});
