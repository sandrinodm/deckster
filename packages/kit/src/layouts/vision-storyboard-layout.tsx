import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { visionStoryboardLayoutContract } from '#layouts/vision-storyboard-layout.contract.ts';

import { smartPunctuation } from '#layout-parts.ts';
import { PatternImage, PatternSlide, usePatternStage } from '#layouts/pattern-slide.tsx';
import '#layouts/vision-storyboard-layout.css';

/**
 * Places the three scenes in reading order, with the image and its moment caption kept together.
 */
function VisionStoryboard({
  frontmatter,
  slots,
}: LayoutProps<typeof visionStoryboardLayoutContract>): ReactNode {
  const { title, eyebrow, scenes, reveal } = frontmatter;
  const stage = usePatternStage(reveal, 2);
  return (
    <PatternSlide
      layout="vision-storyboard"
      eyebrow={eyebrow}
      title={title}
      footnote={slots.footnote}>
      <ol className="kit-storyboard" aria-label="Storyboard scenes">
        {scenes.map(({ image, moment, action, detail }, index) => (
          <li
            key={index}
            className="kit-storyboard-scene"
            data-storyboard-current={index === stage}>
            <figure data-pattern-visible={index <= stage} aria-hidden={index > stage}>
              <div className="kit-storyboard-frame">
                <PatternImage image={image} />
              </div>
              <figcaption>
                <span className="kit-type-label kit-storyboard-moment">
                  {smartPunctuation(moment)}
                </span>
                <h3 className="kit-type-title">{smartPunctuation(action)}</h3>
                <p className="kit-type-small">{smartPunctuation(detail)}</p>
              </figcaption>
            </figure>
          </li>
        ))}
      </ol>
    </PatternSlide>
  );
}

/**
 * The storyboard layout, with one scene on entry or all scenes in its still version.
 */
export const visionStoryboardLayout = defineLayout<typeof visionStoryboardLayoutContract>({
  name: 'vision-storyboard',
  component: VisionStoryboard,
});
