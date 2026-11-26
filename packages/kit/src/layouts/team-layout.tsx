import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useRef, type ReactNode } from 'react';

import type { TeamMember, teamLayoutContract } from '#layouts/team-layout.contract.ts';

import { MonoMark } from '#foundation/mono-mark.tsx';
import { Portrait } from '#foundation/portrait.tsx';
import {
  enterProps,
  Footnote,
  Frame,
  Region,
  SlideHeader,
  smartPunctuation,
  useEnter,
  useFitLevel,
} from '#layout-parts.ts';
import '#layouts/team-layout.css';

/**
 * How the people are arranged: founders (two to four, with room for an edge and past
 * organisations), one row of portraits, a grid of cards with the name beside the portrait, or a
 * roster in two columns.
 */
type TeamArrangement = 'founders' | 'row' | 'grid' | 'roster';

/**
 * The most people that stand in one row of portraits.
 */
const MAX_ROW = 4;

/**
 * The most people in the grid of three columns.
 */
const MAX_GRID = 6;

/**
 * The most people set as founders, the contract's `MAX_FOUNDERS`.
 */
const MAX_FOUNDERS = 4;

/**
 * The number of people who are set as founders whatever they carry: a row of two would leave each
 * portrait too wide.
 */
const PAIR = 2;

/**
 * How many sizes founders try, largest first, until their lines leave each portrait its least
 * height: as set; with the names a step smaller and every edge at the small size; then with the
 * names smaller still and the marks smaller.
 */
const FOUNDER_LEVELS = 3;

/**
 * The entrance order of the first person; the header and context come before.
 */
const FIRST_MEMBER_ORDER = 2;

/**
 * The `team` layout: the shared header and an optional line of context, then the people in the
 * space down to the footnote. Founders (two, or up to four when one has an edge or past
 * organisations) share rows for the name, the role, the edge and the marks, so each line starts
 * level across the slide: two stand beside portraits of three columns, three or four under
 * portraits as wide as their column. When their lines would leave a portrait less than its least
 * height, the names step down and the edges take the small size. Otherwise three or four stand in a
 * row of equal columns, each portrait as tall as the region leaves above the name and role; five or
 * six are cards in three columns, the name beside a square portrait; seven or eight are a roster of
 * two columns, a smaller square beside one line each of name and role. Every portrait in a slide
 * has the same shape and crop.
 */
function TeamLayout({ frontmatter, slots }: LayoutProps<typeof teamLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const { members } = frontmatter;
  const arrangement = arrangementOf(members);
  const founders = arrangement === 'founders';
  const region = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  // Only founders step down; every other arrangement keeps its single size.
  const { level } = useFitLevel(
    region,
    list,
    founders ? FOUNDER_LEVELS : 1,
    JSON.stringify(members),
    { overflow: true, restartOnFontLoad: true },
  );
  const roleType = arrangement === 'row' ? 'kit-type-body' : 'kit-type-small';
  // Three founders have a third of the slide each for their edge, so it takes the body size at the
  // largest level. Two founders, who sit beside their portraits, and four have a quarter each,
  // where the small size keeps the edge to three lines.
  const edgeType =
    members.length === MAX_ROW - 1 && level === 0 ? 'kit-type-body' : 'kit-type-small';
  const nameScaled = arrangement === 'grid' || arrangement === 'roster' || level > 0;
  return (
    <Frame
      layout="team"
      variant={{
        'data-count': String(members.length),
        'data-arrangement': arrangement,
        'data-level': founders ? String(level) : undefined,
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      {slots.body === undefined ? null : (
        <div className="kit-team-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-team-region">
        <ul ref={list} className="kit-team">
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
                  data-fit={nameScaled ? 'scaled' : undefined}>
                  {smartPunctuation(member.name)}
                </p>
                <p className={`kit-team-role ${roleType}`}>{smartPunctuation(member.role)}</p>
                {founders ? <FounderLines member={member} edgeType={edgeType} /> : null}
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
 * Props of {@link FounderLines}.
 */
type FounderLinesProps = {
  /**
   * The person.
   */
  member: TeamMember;

  /**
   * The type class of the edge: the body size for three founders, else the small size.
   */
  edgeType: string;
};

/**
 * A founder's edge and past organisations, each on its own row of the grid; a person without one
 * keeps the row empty, so the lines of the others stay level.
 */
function FounderLines({ member, edgeType }: FounderLinesProps): ReactNode {
  return (
    <>
      <p className={`kit-team-edge ${edgeType}`}>
        {member.edge === undefined ? null : smartPunctuation(member.edge)}
      </p>
      <div className="kit-team-past">
        {(member.previously ?? []).map((organisation, index) => (
          <MonoMark
            key={index}
            className="kit-team-mark"
            name={organisation.name}
            src={organisation.src}
          />
        ))}
      </div>
    </>
  );
}

/**
 * Whether a team is set as founders: two people, or up to four of whom one has an edge or past
 * organisations.
 *
 * @param members - The people.
 */
function isFounders(members: readonly TeamMember[]): boolean {
  return (
    members.length === PAIR ||
    (members.length <= MAX_FOUNDERS &&
      members.some((member) => member.edge !== undefined || member.previously !== undefined))
  );
}

/**
 * How a team is arranged.
 *
 * @param members - The people.
 */
function arrangementOf(members: readonly TeamMember[]): TeamArrangement {
  if (isFounders(members)) {
    return 'founders';
  }

  if (members.length <= MAX_ROW) {
    return 'row';
  }

  return members.length <= MAX_GRID ? 'grid' : 'roster';
}

/**
 * The `team` layout's component.
 */
export const teamLayout = defineLayout<typeof teamLayoutContract>({
  name: 'team',
  component: TeamLayout,
});
