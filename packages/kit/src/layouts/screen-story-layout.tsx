import { defineLayout, useStepAt, type LayoutProps } from '@deckster/engine';
import { useState, type CSSProperties, type ReactNode } from 'react';

import type {
  StoryScreen,
  StorySpotlight,
  screenStoryLayoutContract,
} from '#layouts/screen-story-layout.contract.ts';

import { AppChrome } from '#apps/app-chrome.tsx';
import { frontmatterAsset } from '#foundation/frontmatter-assets.ts';
import { useSlideFile } from '#foundation/slide-file.ts';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { Step } from '#motion/step.tsx';
import { useStillMotion } from '#motion/still-motion.ts';
import '#layouts/screen-story-layout.css';

/**
 * The complete viewport expressed as a percentage.
 */
const FULL_VIEWPORT_PERCENT = 100;

/**
 * A screenshot whose URL has been resolved from the authored slide.
 */
type Resolved = Omit<StoryScreen, 'src'> & {
  /**
   * The screenshot URL, or undefined if the local asset could not be resolved.
   */
  src: string | undefined;
};

/**
 * Shared inputs to the four screen-story treatments.
 */
type Story = {
  /**
   * Screen images and labels, given in story order.
   */
  screens: readonly Resolved[];

  /**
   * Cosmetic label in the reconstructed browser chrome.
   */
  address: string;

  /**
   * Screenshot width divided by height, used to register exact viewports.
   */
  ratio: number;

  /**
   * Whether the presentation exposes secondary views on deck steps.
   */
  reveal: boolean;
};

/**
 * Positions a normalized focus rectangle and its magnified copy from the same coordinates.
 */
type SpotlightStyle = CSSProperties & Record<`--kit-story-${string}`, string | number>;

/**
 * Resolves the slide's local screenshots into a single product story.
 */
function ScreenStoryLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof screenStoryLayoutContract>): ReactNode {
  const slideFile = useSlideFile();
  const { pattern, address = '', ratio, reveal, spotlight, eyebrow, title } = frontmatter;
  const screens = frontmatter.screens.map((screen) => ({
    ...screen,
    src: frontmatterAsset(screen.src, slideFile),
  }));
  const story = { screens, address, ratio, reveal };
  return (
    <Frame layout="screen-story" variant={{ 'data-pattern': pattern }}>
      <SlideHeader eyebrow={eyebrow} title={title} />
      <Region className="kit-story-region">
        <ScreenStory pattern={pattern} story={story} spotlight={spotlight} />
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The runtime layout for spotlight, wipe, handoff and filmstrip.
 */
export const screenStoryLayout = defineLayout<typeof screenStoryLayoutContract>({
  name: 'screen-story',
  component: ScreenStoryLayout,
});

/**
 * Renders the composition named by the slide's validated pattern.
 */
function ScreenStory({
  pattern,
  story,
  spotlight,
}: {
  pattern: LayoutProps<typeof screenStoryLayoutContract>['frontmatter']['pattern'];
  story: Story;
  spotlight: StorySpotlight | undefined;
}): ReactNode {
  switch (pattern) {
    case 'spotlight':
      return spotlight === undefined ? null : <Spotlight story={story} target={spotlight} />;
    case 'wipe':
      return <Wipe {...story} />;
    case 'handoff':
      return <Handoff {...story} />;
    case 'filmstrip':
      return <Filmstrip {...story} />;
  }
}

/**
 * Constrains the crop and overview to coordinate systems with identical aspect ratios.
 */
function Spotlight({ story, target }: { story: Story; target: StorySpotlight }): ReactNode {
  const {
    screens: [screen],
    address,
    ratio,
    reveal,
  } = story;
  if (screen === undefined) {
    return null;
  }

  const { x, y, width, height } = target;
  const fractionalWidth = width / FULL_VIEWPORT_PERCENT;
  const fractionalHeight = height / FULL_VIEWPORT_PERCENT;
  const style: SpotlightStyle = {
    '--kit-story-ratio': ratio,
    '--kit-story-crop-ratio': (ratio * width) / height,
    '--kit-story-x': `${x}%`,
    '--kit-story-y': `${y}%`,
    '--kit-story-width': `${width}%`,
    '--kit-story-height': `${height}%`,
    '--kit-story-crop-size': `${FULL_VIEWPORT_PERCENT / fractionalWidth}%`,
    '--kit-story-crop-image-height': `${FULL_VIEWPORT_PERCENT / fractionalHeight}%`,
    '--kit-story-crop-x': `${-x / fractionalWidth}%`,
    '--kit-story-crop-y': `${-y / fractionalHeight}%`,
  };
  return (
    <div className="kit-story-spotlight" style={style}>
      <Browser address={address}>
        <Picture screen={screen} />
        <Reveal at={1} reveal={reveal}>
          <span className="kit-story-target" aria-hidden="true" data-decorative="" />
        </Reveal>
      </Browser>
      <Reveal at={1} reveal={reveal}>
        <figure className="kit-story-closeup">
          <figcaption className="kit-story-caption">
            <span className="kit-type-label">Magnified detail</span>
            <Caption screen={screen} />
          </figcaption>
          <div className="kit-story-crop">
            <div className="kit-story-crop-art">
              <Picture screen={screen} crop />
            </div>
          </div>
        </figure>
      </Reveal>
    </div>
  );
}

/**
 * Holds the two versions at the same origin while advancing or reversing a wipe.
 */
function Wipe({ screens: [before, after], address, ratio, reveal }: Story): ReactNode {
  const finished = useStepAt(reveal ? 1 : undefined) !== 'hidden';
  const still = useStillMotion();
  const [previous, setPrevious] = useState(finished);
  const [scrubbed, setScrubbed] = useState<number>();
  if (previous !== finished) {
    setPrevious(finished);
    setScrubbed(undefined);
  }

  if (before === undefined || after === undefined) {
    return null;
  }

  const style: SpotlightStyle = { '--kit-story-ratio': ratio };
  if (still && finished) {
    return (
      <div className="kit-story-wipe-pair" style={style}>
        {[before, after].map((screen) => (
          <figure key={screen.label} className="kit-story-screen">
            <Browser address={address}>
              <Picture screen={screen} />
            </Browser>
            <figcaption className="kit-story-caption">
              <Caption screen={screen} />
            </figcaption>
          </figure>
        ))}
      </div>
    );
  }

  const percent = scrubbed ?? (finished ? FULL_VIEWPORT_PERCENT : 0);
  const progress: SpotlightStyle = {
    ...style,
    '--kit-story-wipe': `${percent}%`,
    '--kit-story-wipe-inset': `${FULL_VIEWPORT_PERCENT - percent}%`,
  };
  return (
    <figure
      className="kit-story-wipe"
      style={progress}
      data-still={still || scrubbed !== undefined}>
      <Browser address={address}>
        <div className="kit-story-under" aria-hidden={percent === FULL_VIEWPORT_PERCENT}>
          <Picture screen={before} />
        </div>
        <div className="kit-story-over" aria-hidden={percent === 0}>
          <Picture screen={after} />
        </div>
        {!still && percent > 0 && percent < FULL_VIEWPORT_PERCENT ? (
          <span className="kit-story-divider" aria-hidden="true" data-decorative="" />
        ) : null}
      </Browser>
      {!still ? (
        <label className="kit-story-scrubber kit-type-small">
          <span>Compare versions</span>
          <input
            type="range"
            min={0}
            max={FULL_VIEWPORT_PERCENT}
            value={percent}
            aria-valuetext={`${percent}% revised viewport`}
            onChange={(event) => setScrubbed(event.currentTarget.valueAsNumber)}
          />
          <span aria-hidden="true">{percent}%</span>
        </label>
      ) : null}
      <figcaption className="kit-story-caption">
        <Caption screen={percent === FULL_VIEWPORT_PERCENT ? after : before} />
      </figcaption>
    </figure>
  );
}

/**
 * Pairs an action in the sender's screen with the state it creates on a second device.
 */
function Handoff({ screens: [sender, receiver], address, ratio, reveal }: Story): ReactNode {
  if (sender === undefined || receiver === undefined) {
    return null;
  }

  const style: SpotlightStyle = { '--kit-story-ratio': ratio };
  return (
    <div className="kit-story-handoff" style={style}>
      <figure className="kit-story-screen">
        <Browser address={address}>
          <Picture screen={sender} />
        </Browser>
        <figcaption className="kit-story-caption">
          <Caption screen={sender} />
        </figcaption>
      </figure>
      <Reveal at={1} reveal={reveal}>
        <span className="kit-story-transfer" aria-hidden="true">
          →
        </span>
      </Reveal>
      <Reveal at={1} reveal={reveal}>
        <figure className="kit-story-screen">
          <div className="kit-story-phone">
            <Picture screen={receiver} />
          </div>
          <figcaption className="kit-story-caption">
            <Caption screen={receiver} />
          </figcaption>
        </figure>
      </Reveal>
    </div>
  );
}

/**
 * Preserves a chronological strip while advancing one action at a time.
 */
function Filmstrip({ screens, reveal }: Story): ReactNode {
  return (
    <ol className="kit-story-film">
      {screens.map((screen, index) => (
        <li key={index}>
          <Reveal at={index} reveal={reveal && index > 0}>
            <figure className="kit-story-film-frame">
              <div className="kit-story-phone">
                <Picture screen={screen} />
              </div>
              <figcaption className="kit-story-caption">
                <span className="kit-story-beat kit-type-label">{index + 1}</span>
                <Caption screen={screen} />
              </figcaption>
            </figure>
          </Reveal>
        </li>
      ))}
    </ol>
  );
}

/**
 * Shows a view on cue, reserving its geometry between clicks.
 */
function Reveal({
  at,
  reveal,
  children,
}: {
  at: number;
  reveal: boolean;
  children: ReactNode;
}): ReactNode {
  return reveal ? (
    <Step at={at} effect="fade">
      {children}
    </Step>
  ) : (
    children
  );
}

/**
 * Gives the screenshot a recognizable browser viewport with an unchanged aspect ratio.
 */
function Browser({ address, children }: { address: string; children: ReactNode }): ReactNode {
  return (
    <div className="kit-story-browser">
      <AppChrome chrome="browser" label={address}>
        <div className="kit-story-viewport">{children}</div>
      </AppChrome>
    </div>
  );
}

/**
 * Draws the resolved screenshot; the magnification describes its own region once.
 */
function Picture({ screen, crop = false }: { screen: Resolved; crop?: boolean }): ReactNode {
  if (screen.src === undefined) {
    return null;
  }

  return (
    <img
      src={screen.src}
      alt={crop ? `Magnified detail. ${screen.alt}` : screen.alt}
      data-decorative={crop ? '' : undefined}
    />
  );
}

/**
 * Names the action or version with a short optional explanation.
 */
function Caption({ screen }: { screen: Resolved }): ReactNode {
  return (
    <>
      <strong className="kit-type-lead">{smartPunctuation(screen.label)}</strong>
      {screen.detail === undefined ? null : (
        <span className="kit-type-small">{smartPunctuation(screen.detail)}</span>
      )}
    </>
  );
}
