import { defineLayout, type LayoutProps } from '@deckster/engine';
import { useRef, type CSSProperties, type ReactNode } from 'react';

import type { AskFund, AskMilestone, askLayoutContract } from '#layouts/ask-layout.contract.ts';

import {
  Frame,
  SlideHeader,
  smartPunctuation,
  StatValue,
  Step,
  useEnter,
  useFitGroupWidth,
  useFitLevel,
} from '#layout-parts.ts';
import '#layouts/ask-layout.css';

/**
 * The most lines the title takes in the panel before it steps down in size.
 */
const TITLE_MAX_LINES = 3;

/**
 * Selects the amount, which steps down to the panel's width.
 */
const AMOUNT_SELECTOR = '.kit-ask-amount';

/**
 * The step the amount comes in on with `reveal`, first of the steps that bring the content in.
 */
const AMOUNT_STEP = 1;

/**
 * The step the first milestone comes in on with `reveal`; each later milestone takes the next step,
 * and the use of funds the one after the last.
 */
const FIRST_MILESTONE_STEP = 2;

/**
 * The sizes the plan beside the panel tries, largest first, until it fits between the title line
 * and the bottom line: the type steps of the milestones and of the sentence over them at each
 * level. The stylesheet closes the room between milestones as the level rises, most at the last
 * two.
 */
const PLAN_LEVELS = [
  { text: 'lead', context: 'lead' },
  { text: 'body', context: 'lead' },
  { text: 'small', context: 'body' },
  { text: 'small', context: 'body' },
  { text: 'small', context: 'small' },
] as const;

/**
 * How the use of funds labels its allocations: each under its own segment, as wide as the segment,
 * or, when a label's longest word or its share is wider than its segment or it takes more than two
 * lines, in equal columns in the bar's order.
 */
const FUNDS_LEVELS = ['segments', 'equal'] as const;

/**
 * The share of the bar an allocation's segment and label take, as a CSS percentage.
 */
type ShareStyle = CSSProperties & { '--kit-ask-share': string };

/**
 * The `ask` layout: an accent panel down the left of the slide, from the top, left and bottom edges
 * to the seam (the middle of the gutter after the fifth column), holding the shared header at the
 * top and the label and amount standing on the bottom line; and beside it, in the last six columns
 * from the title line down, the sentence of context, the numbered milestones with their dates on
 * the right, and the use of funds standing on the bottom line, so the plan's foot and the amount's
 * share a line. The amount steps down to the panel's width; the plan steps down until it fits. A
 * slide on the accent surface sets the panel on the inverse surface instead, so it still reads as a
 * panel. With `reveal`, the amount comes in on step 1, each milestone on the next, and the use of
 * funds last.
 */
function AskLayout({ frontmatter, slots }: LayoutProps<typeof askLayoutContract>): ReactNode {
  const { milestones, funds, reveal } = frontmatter;
  const lead = useRef<HTMLDivElement>(null);
  const plan = useRef<HTMLDivElement>(null);
  const contextEnter = useEnter(1);
  useFitGroupWidth(lead, AMOUNT_SELECTOR);
  const { level } = useFitLevel(
    plan,
    plan,
    PLAN_LEVELS.length,
    JSON.stringify([milestones, funds]),
    {
      overflow: true,
    },
  );
  const size = PLAN_LEVELS[level] ?? { text: 'small', context: 'small' };
  const panelSurface = frontmatter.surface === 'accent' ? 'inverse' : 'accent';
  /**
   * The content as it shows: on step `at` with `reveal`, else at once.
   *
   * @param at - The step that brings it in.
   * @param content - What comes in.
   */
  function step(at: number, content: ReactNode): ReactNode {
    return reveal ? (
      <Step key={at} at={at}>
        {content}
      </Step>
    ) : (
      content
    );
  }

  return (
    <Frame
      layout="ask"
      variant={{ 'data-level': String(level) }}
      bleed={
        <div
          className="kit-ask-panel"
          data-surface={panelSurface}
          aria-hidden="true"
          data-decorative=""
        />
      }>
      <div className="kit-ask">
        <div ref={lead} className="kit-ask-lead" data-surface={panelSurface}>
          <SlideHeader
            eyebrow={frontmatter.eyebrow}
            title={frontmatter.title}
            maxLines={TITLE_MAX_LINES}
          />
          {step(
            AMOUNT_STEP,
            <Amount key="amount" amount={frontmatter.amount} label={frontmatter.label} />,
          )}
        </div>
        <div ref={plan} className="kit-ask-plan">
          {slots.body === undefined ? null : (
            <div className={`kit-ask-context kit-prose kit-type-${size.context}`} {...contextEnter}>
              {slots.body}
            </div>
          )}
          <ol className="kit-ask-milestones">
            {milestones.map((milestone, index) =>
              step(
                index + FIRST_MILESTONE_STEP,
                <MilestoneRow
                  key={index}
                  milestone={milestone}
                  index={index}
                  textType={`kit-type-${size.text}`}
                />,
              ),
            )}
          </ol>
          {funds === undefined
            ? null
            : step(milestones.length + FIRST_MILESTONE_STEP, <Funds key="funds" funds={funds} />)}
        </div>
      </div>
    </Frame>
  );
}

/**
 * Props of {@link Amount}.
 */
type AmountProps = {
  /**
   * The amount as the slide writes it.
   */
  amount: string | number;

  /**
   * The few words over it, if any.
   */
  label: string | undefined;
};

/**
 * The amount on the panel's foot: its label in the label style, and the figure at the stat size or
 * larger, stepped down to the panel's width.
 */
function Amount({ amount, label }: AmountProps): ReactNode {
  return (
    <div className="kit-ask-figure" data-fit="scaled">
      {label === undefined ? null : (
        <p className="kit-ask-label kit-type-label">{smartPunctuation(label)}</p>
      )}
      <StatValue value={amount} className="kit-ask-amount" />
    </div>
  );
}

/**
 * Props of {@link MilestoneRow}.
 */
type MilestoneRowProps = {
  /**
   * The milestone from the frontmatter.
   */
  milestone: AskMilestone;

  /**
   * Its place in `milestones:`, 0 for the first.
   */
  index: number;

  /**
   * The type class of its text, from the fit level of the milestones.
   */
  textType: string;
};

/**
 * One milestone on the list's shared columns: its number, its text and its date, set right so the
 * dates align.
 */
function MilestoneRow({ milestone, index, textType }: MilestoneRowProps): ReactNode {
  return (
    <li className="kit-ask-milestone">
      <span className="kit-ask-number kit-type-label kit-numeric" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>
      <p className={`kit-ask-text ${textType}`}>{smartPunctuation(milestone.text)}</p>
      <p className="kit-ask-date kit-type-label kit-numeric">
        {smartPunctuation(String(milestone.by))}
      </p>
    </li>
  );
}

/**
 * Props of {@link Funds}.
 */
type FundsProps = {
  /**
   * The allocations from the frontmatter.
   */
  funds: readonly AskFund[];
};

/**
 * The use of funds: one thin bar of segments as long as their shares, with a gap between each, and
 * under it each allocation's share and label. The labels stand under their own segments when every
 * label fits its segment's width in two lines, else in equal columns in the bar's order.
 */
function Funds({ funds }: FundsProps): ReactNode {
  const list = useRef<HTMLUListElement>(null);
  const { level } = useFitLevel(list, list, FUNDS_LEVELS.length, JSON.stringify(funds), {
    overflow: true,
  });
  const placement = FUNDS_LEVELS[level] ?? 'equal';
  // Equal columns are as narrow as a fifth of the plan, so their labels take the caption size.
  const labelType = placement === 'equal' ? 'kit-type-caption' : 'kit-type-small';
  return (
    <div className="kit-ask-funds">
      <div className="kit-ask-bar" aria-hidden="true" data-decorative="">
        {funds.map((fund, index) => (
          <span key={index} className="kit-ask-segment" style={shareStyle(fund)} />
        ))}
      </div>
      <ul ref={list} className="kit-ask-allocations" data-placement={placement}>
        {funds.map((fund, index) => (
          <li key={index} className="kit-ask-allocation" style={shareStyle(fund)}>
            <span className="kit-ask-share kit-type-title kit-numeric">{`${fund.share}%`}</span>
            <span className={`kit-ask-fund ${labelType}`}>{smartPunctuation(fund.label)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The width an allocation's segment, and its label under it, take of the bar.
 *
 * @param fund - The allocation.
 */
function shareStyle(fund: AskFund): ShareStyle {
  return { '--kit-ask-share': `${fund.share}%` };
}

/**
 * The `ask` layout's component. The panel covers the left edge, so the chrome moves off it.
 */
export const askLayout = defineLayout<typeof askLayoutContract>({
  name: 'ask',
  component: AskLayout,
  bleed: () => ['left'],
});
