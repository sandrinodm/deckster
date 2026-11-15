import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { testDisplay } from '#present/fake-shell.fixture.ts';
import { describeDisplays, planWindows, type PlanFlags } from '#present/window-plan.ts';

const ONE = [testDisplay(10, true)];
const TWO = [testDisplay(10, true), testDisplay(20, false)];
const THREE = [testDisplay(10, true), testDisplay(20, false), testDisplay(30, false)];
const THREE_PRIMARY_MIDDLE = [
  testDisplay(10, false),
  testDisplay(20, true),
  testDisplay(30, false),
];

/**
 * Flags with everything off, overridden per test.
 */
function flags(overrides: Partial<PlanFlags> = {}): PlanFlags {
  return {
    fullscreen: false,
    kiosk: false,
    display: undefined,
    presenter: false,
    presenterDisplay: undefined,
    ...overrides,
  };
}

describe('planWindows', () => {
  it.effect('puts a plain run on the primary display, windowed', () =>
    Effect.gen(function* () {
      const result = yield* planWindows(flags(), THREE_PRIMARY_MIDDLE);
      expect(result.plan).toEqual({
        audience: { displayId: 20, fullscreen: false },
        kiosk: false,
      });
      expect(result.audienceIndex).toBe(1);
      expect(result.presenterIndex).toBeUndefined();
      expect(result.notes).toEqual([]);
    }),
  );

  it.effect('with one display: presenter shares it and fullscreen is dropped with a note', () =>
    Effect.gen(function* () {
      const result = yield* planWindows(flags({ presenter: true, fullscreen: true }), ONE);
      expect(result.plan.audience).toEqual({ displayId: 10, fullscreen: false });
      expect(result.plan.presenter).toEqual({ displayId: 10 });
      expect(result.notes.join(' ')).toContain('Only one display');
      expect(result.notes.join(' ')).toContain('fullscreen would cover');
    }),
  );

  it.effect('with two displays: presenter on the primary, audience on the other', () =>
    Effect.gen(function* () {
      const result = yield* planWindows(flags({ presenter: true, fullscreen: true }), TWO);
      expect(result.plan.audience).toEqual({ displayId: 20, fullscreen: true });
      expect(result.plan.presenter).toEqual({ displayId: 10 });
      expect(result.audienceIndex).toBe(1);
      expect(result.presenterIndex).toBe(0);
      expect(result.notes).toEqual([]);
    }),
  );

  it.effect('with three displays: explicit choices win and the rest follows', () =>
    Effect.gen(function* () {
      const both = yield* planWindows(
        flags({ presenter: true, display: 2, presenterDisplay: 1 }),
        THREE,
      );
      expect([both.audienceIndex, both.presenterIndex]).toEqual([2, 1]);
      const onlyDisplay = yield* planWindows(flags({ presenter: true, display: 2 }), THREE);
      expect([onlyDisplay.audienceIndex, onlyDisplay.presenterIndex]).toEqual([2, 0]);
      const onlyPresenter = yield* planWindows(
        flags({ presenter: true, presenterDisplay: 0 }),
        THREE,
      );
      expect([onlyPresenter.audienceIndex, onlyPresenter.presenterIndex]).toEqual([1, 0]);
      const defaults = yield* planWindows(flags({ presenter: true }), THREE);
      expect([defaults.audienceIndex, defaults.presenterIndex]).toEqual([1, 0]);
    }),
  );

  it.effect('treats --presenter <n> as asking for the presenter window', () =>
    Effect.gen(function* () {
      const result = yield* planWindows(flags({ presenterDisplay: 1 }), TWO);
      expect(result.presenterIndex).toBe(1);
      expect(result.audienceIndex).toBe(0);
    }),
  );

  it.effect('keeps both windows on one display when the author names the same one twice', () =>
    Effect.gen(function* () {
      const result = yield* planWindows(
        flags({ presenter: true, display: 1, presenterDisplay: 1, fullscreen: true }),
        TWO,
      );
      expect(result.plan.audience).toEqual({ displayId: 20, fullscreen: false });
      expect(result.plan.presenter).toEqual({ displayId: 20 });
      expect(result.notes.join(' ')).toContain('same display');
    }),
  );

  it.effect('makes --kiosk fullscreen and carries it to the plan', () =>
    Effect.gen(function* () {
      const result = yield* planWindows(flags({ kiosk: true }), TWO);
      expect(result.plan).toEqual({ audience: { displayId: 10, fullscreen: true }, kiosk: true });
    }),
  );

  it.effect('fails for a display index that does not exist, listing the displays', () =>
    Effect.gen(function* () {
      const audience = yield* Effect.flip(planWindows(flags({ display: 5 }), TWO));
      expect(audience.message).toContain('--display 5 does not exist');
      expect(audience.message).toContain('0: Display 10 1920x1080 @2x (primary)');
      const presenter = yield* Effect.flip(planWindows(flags({ presenterDisplay: 2 }), TWO));
      expect(presenter.message).toContain('--presenter 2 does not exist');
    }),
  );

  it.effect('fails without any display', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(planWindows(flags(), []));
      expect(error.message).toContain('No display is connected');
    }),
  );
});

describe('describeDisplays', () => {
  it('numbers the displays and marks the primary', () => {
    expect(describeDisplays(THREE)).toBe(
      '0: Display 10 1920x1080 @2x (primary); 1: Display 20 1920x1080 @2x; 2: Display 30 1920x1080 @2x',
    );
  });
});
