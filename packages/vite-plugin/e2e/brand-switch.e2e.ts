import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';

import type { SlideLook } from './support/slide-look.ts';

import { useBrandServers } from './support/brand-servers.ts';
import { BRANDS, brandUrl, type Brand } from './support/brands.ts';
import { test } from './support/page-problems.ts';
import { readSlide } from './support/slide-look.ts';

/**
 * The hello deck's slides and the surface each one names in its frontmatter.
 */
const SLIDE_SURFACES = [
  { id: 'title', surface: 'gradient' },
  { id: 'steps', surface: 'default' },
  { id: 'live-counter', surface: 'accent' },
  { id: 'closing', surface: 'inverse' },
] as const;

useBrandServers();

describe('switching the hello deck between brands', () => {
  test('restyles every slide with no slide edits', async (fixtures) => {
    for (const [index, slide] of SLIDE_SURFACES.entries()) {
      const looks = {} as Record<Brand, SlideLook>;
      for (const brand of BRANDS) {
        looks[brand] = await readSlide(fixtures, brandUrl(brand), index);
        expect(looks[brand].brand).toBe(brand);
        expect(looks[brand].surface).toBe(slide.surface);
      }

      const { default: neutral, nocturne } = looks;
      expect(nocturne.background, `${slide.id} background`).not.toBe(neutral.background);
      expect(nocturne.headingFont, `${slide.id} heading font`).not.toBe(neutral.headingFont);
      expect(nocturne.headingSize, `${slide.id} heading size`).not.toBe(neutral.headingSize);
      expect(nocturne.paddingLeft, `${slide.id} margin`).not.toBe(neutral.paddingLeft);
      expect(nocturne.ruleRadius, `${slide.id} radius`).not.toBe(neutral.ruleRadius);
      expect(nocturne.ruleColor, `${slide.id} accent`).not.toBe(neutral.ruleColor);
    }
  });

  test('applies each brand’s type, margins and fonts', async (fixtures) => {
    const { browser } = fixtures;
    const neutral = await readSlide(fixtures, brandUrl('default'), 1);
    expect(neutral.headingFont).toContain('Bricolage Grotesque');
    expect(neutral.headingSize).toBe('80px');
    expect(neutral.paddingLeft).toBe('128px');
    expect(neutral.background).toBe('rgb(252, 252, 253)');
    expect(await browser.evaluate(() => document.fonts.check('80px "Bricolage Grotesque"'))).toBe(
      true,
    );

    const nocturne = await readSlide(fixtures, brandUrl('nocturne'), 1);
    expect(nocturne.headingFont).toContain('Fraunces');
    expect(nocturne.headingSize).toBe('84px');
    expect(nocturne.paddingLeft).toBe('160px');
    expect(nocturne.ruleRadius).toBe('0px');
    expect(nocturne.background).toBe('rgb(11, 9, 17)');
    expect(await browser.evaluate(() => document.fonts.check('84px "Fraunces"'))).toBe(true);
  });

  test('remaps the roles on each surface within one brand', async (fixtures) => {
    const looks: SlideLook[] = [];
    for (const index of SLIDE_SURFACES.keys()) {
      looks.push(await readSlide(fixtures, brandUrl('default'), index));
    }

    const backgrounds = new Set(looks.map((look) => look.background));
    const headings = new Set(looks.map((look) => look.headingColor));
    expect(backgrounds.size).toBe(SLIDE_SURFACES.length);
    expect(headings.size).toBeGreaterThan(1);
    expect(looks[0]?.background).toContain('linear-gradient');
    expect(looks[3]?.headingColor).toBe('rgb(244, 245, 248)');
  });
});
