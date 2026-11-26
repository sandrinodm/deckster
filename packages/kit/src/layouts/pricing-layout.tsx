import { useBrand } from '@deckster/brand/runtime';
import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useRef, type CSSProperties, type ReactNode } from 'react';

import type { PricingPlanEntry, pricingLayoutContract } from '#layouts/pricing-layout.contract.ts';

import { Badge } from '#foundation/badges.tsx';
import { KitMark } from '#foundation/marks.tsx';
import {
  enterProps,
  Footnote,
  Frame,
  Region,
  SlideHeader,
  smartPunctuation,
  StatValue,
  Step,
  useEnter,
  useFitGroupWidth,
  useFitLevel,
  type EnterProps,
} from '#layout-parts.ts';
import '#layouts/pricing-layout.css';

/**
 * The entrance order of the first plan; the header and the line of context come before.
 */
const FIRST_PLAN_ORDER = 2;

/**
 * The most plans whose features may be set at the body size; four to a row take the small size.
 */
const BODY_TEXT_MOST_PLANS = 3;

/**
 * The prices, which shrink together until the widest fits its column, so the row keeps one size.
 */
const PRICE_SELECTOR = '.kit-plan-value';

/**
 * The surface that lights the recommended plan, unless the slide is on it already.
 */
const ACCENT_SURFACE = 'accent';

/**
 * How a row of plans is grown for the room: `roomy` stretches the plans to the region's height with
 * the price a size up and the features standing on the plan's foot; `snug` stretches them the same
 * way at the usual price size; `none` is a plan as tall as its content.
 */
type PlanGrowth = 'roomy' | 'snug' | 'none';

/**
 * One size of a row of plans.
 */
type PlanLevel = {
  /**
   * The type step of the features.
   */
  text: 'body' | 'small' | 'caption';

  /**
   * How the plans are grown for the room.
   */
  grow: PlanGrowth;

  /**
   * Whether the plans are compact: less padding, a smaller name and price.
   */
  compact: boolean;
};

/**
 * The sizes a row of plans tries after its stretched levels, largest first: the features at the
 * body size, at the small size, then at the small size in compact plans, and last at the caption
 * size, for a full row under a long title.
 */
const PLAN_LEVELS: readonly PlanLevel[] = [
  { text: 'body', grow: 'none', compact: false },
  { text: 'small', grow: 'none', compact: false },
  { text: 'small', grow: 'none', compact: true },
  { text: 'caption', grow: 'none', compact: true },
];

/**
 * The custom properties the stylesheet builds the row's grid from.
 */
type PlansStyle = CSSProperties & {
  /**
   * How many plans the row has.
   */
  '--kit-plan-count': number;
};

/**
 * The `pricing` layout: the shared header (its title kept to one line, stepping down in size rather
 * than taking a second) and an optional line of context, then the plans in one row of equal panels.
 * Each panel stacks the plan's name, its description, its price as the column's hero figure with
 * the period beside it, and its features under a rule, each after a check. The panels share their
 * rows through a subgrid, so names, prices and the first features line up across the row whatever
 * their length, and the prices shrink together until the widest fits its column. The recommended
 * plan sits on the accent surface (the inverse one when the slide is on the accent surface
 * already), with its badge as a tab hanging from its top edge. A row whose content leaves room is
 * stretched to the region's height, with the name, description and price at the top and the
 * features standing on the plan's foot, first with the price a size up; a row that does not fit
 * steps its features down to the small size, then takes compact plans, then the caption size. The
 * level is chosen for the whole content, revealed or not, so it holds from the first step to the
 * last.
 */
function PricingLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof pricingLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const { surface } = useBrand();
  const lit =
    surface.name === ACCENT_SURFACE || surface.name === 'gradient' ? 'inverse' : ACCENT_SURFACE;
  const { plans, reveal } = frontmatter;
  const hasBadge = plans.some((plan) => plan.recommended === true);
  const region = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const ladder = plans.length <= BODY_TEXT_MOST_PLANS ? PLAN_LEVELS : PLAN_LEVELS.slice(1);
  const levels = [...stretchedLevels(ladder), ...ladder];
  // The key holds what changes the room as well as the plans, so a slide that loses its line of
  // context or its footnote while it is open tries the stretched levels again.
  const key = JSON.stringify([
    plans,
    frontmatter.title,
    frontmatter.badge,
    slots.body === undefined,
    slots.footnote === undefined,
  ]);
  useFitGroupWidth(grid, PRICE_SELECTOR);
  const { level } = useFitLevel(region, grid, levels.length, key, {
    height: plansHeight,
    restartOnFontLoad: true,
  });
  const size = levels[level] ?? { text: 'caption', grow: 'none', compact: true };
  const style: PlansStyle = { '--kit-plan-count': plans.length };
  return (
    <Frame
      layout="pricing"
      variant={{
        'data-count': String(plans.length),
        'data-level': String(level),
        'data-grow': size.grow,
        'data-compact': String(size.compact),
        'data-badge': String(hasBadge),
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      {slots.body === undefined ? null : (
        <div className="kit-pricing-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-pricing-region" place="optical">
        <div ref={grid} className="kit-pricing" style={style}>
          {plans.map((plan, index) => {
            const content = (
              <Plan
                key={index}
                plan={plan}
                badge={frontmatter.badge}
                lit={plan.recommended === true ? lit : undefined}
                featureType={`kit-type-${size.text}`}
                enter={enterProps(FIRST_PLAN_ORDER + index, isStatic)}
              />
            );
            return reveal ? (
              <Step key={index} at={index + 1}>
                {content}
              </Step>
            ) : (
              content
            );
          })}
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The stretched levels tried before a ladder, so a row with room fills it with intent instead of
 * floating in it: the price a size up, then at its usual size, both with the features at the
 * ladder's first size. A level fits only when the content leaves each plan a gap above its features
 * (the stylesheet holds it), so a full row skips them.
 *
 * @param ladder - The levels the row would take otherwise.
 */
function stretchedLevels(ladder: readonly PlanLevel[]): PlanLevel[] {
  const text = ladder[0]?.text ?? 'body';
  return [
    { text, grow: 'roomy', compact: false },
    { text, grow: 'snug', compact: false },
  ];
}

/**
 * The height a row of plans needs. A stretched grid is as tall as its region, so its own box does
 * not tell; every plan spans all of the grid's rows, so a plan is as tall as the rows need, more
 * than the region when they do not fit. Offset heights ignore the transforms of an entrance and a
 * step, so neither changes them.
 *
 * @param grid - The plans' grid.
 */
function plansHeight(grid: HTMLElement): number {
  const plans = Array.from(grid.querySelectorAll<HTMLElement>('.kit-plan'));
  return Math.max(0, ...plans.map((plan) => plan.offsetHeight));
}

/**
 * Props of {@link Plan}.
 */
type PlanProps = {
  /**
   * The plan from the frontmatter.
   */
  plan: PricingPlanEntry;

  /**
   * The slide's badge, shown on the recommended plan.
   */
  badge: string;

  /**
   * The surface of the recommended plan; nothing for the others.
   */
  lit: string | undefined;

  /**
   * The type class of the features, from the row's fit level.
   */
  featureType: string;

  /**
   * The plan's place in the slide entrance.
   */
  enter: EnterProps;
};

/**
 * One plan: its name, description, price and period, and features, each on its own row of the row's
 * grid, and the badge on its top edge when it is the recommended plan.
 */
function Plan({ plan, badge, lit, featureType, enter }: PlanProps): ReactNode {
  const recommended = lit !== undefined;
  const descriptionType = featureType === 'kit-type-caption' ? featureType : 'kit-type-small';
  const surface = recommended ? { 'data-surface': lit } : {};
  return (
    <section className="kit-plan" data-recommended={String(recommended)} {...surface} {...enter}>
      {recommended ? <Badge className="kit-plan-badge">{smartPunctuation(badge)}</Badge> : null}
      <h3 className="kit-plan-name kit-heading kit-type-title" data-fit="scaled">
        {smartPunctuation(plan.name)}
      </h3>
      <p className={`kit-plan-description ${descriptionType}`}>
        {smartPunctuation(plan.description)}
      </p>
      <div className="kit-plan-price">
        <StatValue value={plan.price} className="kit-plan-value" />
        {plan.period === undefined ? null : (
          <p className="kit-plan-period kit-type-small">{smartPunctuation(plan.period)}</p>
        )}
      </div>
      <ul className="kit-plan-features">
        {plan.features.map((feature, index) => (
          <li key={index} className={`kit-plan-feature ${featureType}`}>
            <CheckMark />
            <span>{smartPunctuation(feature)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The check before a feature, in the accent: decoration, since the list says what is included.
 */
function CheckMark(): ReactNode {
  return <KitMark kind="check" className="kit-plan-check" />;
}

/**
 * The `pricing` layout's component.
 */
export const pricingLayout = defineLayout<typeof pricingLayoutContract>({
  name: 'pricing',
  component: PricingLayout,
});
