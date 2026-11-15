import { defineDeck } from '@deckster/engine/config';

/**
 * The data deck: a support team's review of a year-long redesign, told with every chart and number
 * component in the kit. Each slide states its takeaway in the title and proves it with one figure:
 * the right form for the message, one highlight, direct labels. Lumen and its numbers are
 * fictional.
 */
export default defineDeck({
  title: 'Support, rebuilt',
  brand: 'default',
  duration: '20m',
  slides: [
    'cover',
    'scorecard',
    'redesign-effect',
    'go-live',
    'top-reasons',
    'wrong-chart',
    'right-chart',
    'billing-backlog',
    'channel-mix',
    'self-serve',
    'help-funnel',
    'response-time',
    'weekly-load',
    'speed-satisfaction',
    'cost-bridge',
    'first-reply',
    'deflection-goal',
    'plan-choice',
  ],
});
