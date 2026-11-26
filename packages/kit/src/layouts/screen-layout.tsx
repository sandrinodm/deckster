import { defineLayout, useReadyHold, useStatic, type LayoutProps } from '@deckster/engine';
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react';

import type {
  ScreenCallout,
  ScreenFrame,
  screenLayoutContract,
} from '#layouts/screen-layout.contract.ts';

import { AppChrome } from '#apps/app-chrome.tsx';
import { MEASURE_TOLERANCE_PX } from '#foundation/layout-geometry.ts';
import { useSlideFile } from '#foundation/slide-file.ts';
import {
  enterProps,
  Footnote,
  Frame,
  frontmatterAsset,
  Region,
  SlideHeader,
  smartPunctuation,
  Step,
  useFitLevel,
} from '#layout-parts.ts';
import '#layouts/screen-layout.css';

/**
 * The entrance order of the framed screen; the header enters first, the gutter after it.
 */
const SCREEN_ORDER = 1;

/**
 * The entrance order of the gutter beside the screen.
 */
const ASIDE_ORDER = 2;

/**
 * The proportions a frame assumes until its picture has loaded (and keeps when the file is
 * missing): a laptop or browser screen at 16:10, a phone at 9:19.5.
 */
const FALLBACK_RATIO: Readonly<Record<ScreenFrame, number>> = {
  /**
   * A browser window on a laptop display.
   */
  browser: 16 / 10,

  /**
   * A current phone held upright.
   */
  phone: 9 / 19.5,

  /**
   * A laptop display.
   */
  laptop: 16 / 10,

  /**
   * A desktop screenshot.
   */
  none: 16 / 10,
};

/**
 * The most columns the stage takes beside a gutter: two thirds of the grid, leaving the gutter four
 * columns at the least.
 */
const MAX_STAGE_COLUMNS = 8;

/**
 * The least air, in gaps, between the frame's right edge and the next column line before the gutter
 * is wide enough. Less than this and the stage takes one column more.
 */
const MIN_AIR_GAPS = 2;

/**
 * The type steps the gutter tries, largest first, until the sentence and the callout labels fit
 * beside the screen.
 */
const ASIDE_LEVELS = ['body', 'small'] as const;

/**
 * The custom properties the stylesheet sizes the frame and places a marker by.
 */
type ScreenStyle = CSSProperties & {
  '--kit-screen-ratio'?: number;
  '--kit-screen-span'?: number;
  '--kit-callout-x'?: number;
  '--kit-callout-y'?: number;
};

/**
 * The `screen` layout: the shared header across the top, then one picture shown whole in the frame
 * the slide asks for, as large as the room under the title allows, and a gutter beside it on the
 * grid for the optional sentence and the callout labels. The frame is drawn by the kit around the
 * picture's own proportions, read from the file when it loads, so the browser bar, the phone's
 * bezel or the laptop's lid sit exactly on the picture's edges and a callout's `x` and `y` land on
 * the same point of the interface at any size. The screen stands on the title's left edge and the
 * gutter starts on the first column line past it (at most eight columns in, so the gutter keeps
 * four), its text level with the frame's top, or centred on a phone. With no callouts and no
 * sentence the screen is centred on the slide. Each callout is a numbered marker on the picture and
 * the same number before its label in the gutter, so no text is ever set over the interface; with
 * `reveal` both arrive on the callout's step and recede to the muted role once the next one
 * arrives. The picture takes no brand image treatment: a screenshot shows a product in its own
 * colors, which a duotone or grayscale would misrepresent, so the layout has no `treatment` field.
 */
function ScreenLayout({ frontmatter, slots }: LayoutProps<typeof screenLayoutContract>): ReactNode {
  const { frame, callouts = [], reveal } = frontmatter;
  const isStatic = useStatic();
  const source = frontmatterAsset(frontmatter.src, useSlideFile());
  const { ratio, readLoaded, onLoad, onError } = usePictureRatio(source);
  const hasAside = callouts.length > 0 || slots.body !== undefined;
  const stage = useRef<HTMLDivElement>(null);
  const span = useStageSpan(stage, hasAside);
  const aside = useRef<HTMLDivElement>(null);
  const asideContent = useRef<HTMLDivElement>(null);
  const { level } = useFitLevel(
    aside,
    asideContent,
    ASIDE_LEVELS.length,
    JSON.stringify([frame, callouts, span]),
    { overflow: true, restartOnFontLoad: true },
  );
  const textType = `kit-type-${ASIDE_LEVELS[level] ?? 'small'}`;
  const style: ScreenStyle = { '--kit-screen-ratio': ratio ?? FALLBACK_RATIO[frame] };
  const gridStyle: ScreenStyle = span === undefined ? {} : { '--kit-screen-span': span };
  const legend =
    callouts.length === 0 ? null : (
      <ol className="kit-screen-legend">
        {callouts.map((callout, index) => (
          <li key={index} className="kit-screen-legend-item">
            <Revealed at={index + 1} reveal={reveal}>
              <Label callout={callout} number={index + 1} textType={textType} />
            </Revealed>
          </li>
        ))}
      </ol>
    );
  const display = (
    <div className="kit-screen-display">
      {source === undefined ? null : (
        <img
          className="kit-screen-image"
          ref={readLoaded}
          src={source}
          alt={frontmatter.alt}
          onLoad={onLoad}
          onError={onError}
        />
      )}
      <div className="kit-screen-markers">
        {callouts.map((callout, index) => (
          <Revealed key={index} at={index + 1} reveal={reveal}>
            <Marker callout={callout} number={index + 1} />
          </Revealed>
        ))}
      </div>
    </div>
  );
  return (
    <Frame
      layout="screen"
      variant={{
        'data-frame': frame,
        'data-aside': String(hasAside),
        'data-level': String(level),
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      <Region className="kit-screen-region">
        <div className="kit-screen" style={gridStyle}>
          <div ref={stage} className="kit-screen-stage" {...enterProps(SCREEN_ORDER, isStatic)}>
            <Device frame={frame} address={frontmatter.address} style={style}>
              {display}
            </Device>
          </div>
          {hasAside ? (
            <div ref={aside} className="kit-screen-aside" {...enterProps(ASIDE_ORDER, isStatic)}>
              <div ref={asideContent} className="kit-screen-aside-content">
                <Context textType={textType}>{slots.body}</Context>
                {legend}
              </div>
            </div>
          ) : null}
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * What {@link usePictureRatio} gives the frame: the picture's proportions once known, and the ref
 * and handlers for its `<img>`.
 */
type PictureRatio = {
  /**
   * Width over height of the picture as the file draws it; `undefined` until it has loaded, and
   * when it failed to.
   */
  ratio: number | undefined;

  /**
   * The `<img>` element's ref callback: reads a picture that had already loaded when its element
   * was committed, as one from the cache or a data URL can be, before React listens for its load
   * event.
   */
  readLoaded: (image: HTMLImageElement | null) => void;

  /**
   * Reads the proportions from the picture once it has loaded.
   */
  onLoad: (event: SyntheticEvent<HTMLImageElement>) => void;

  /**
   * Stops waiting for a picture that failed to load.
   */
  onError: () => void;
};

/**
 * What is known of a picture: its proportions, or that they never will be.
 */
type RatioState = {
  /**
   * The file the state is for, so a new file starts again.
   */
  source: string | undefined;

  /**
   * Width over height, once known.
   */
  ratio: number | undefined;

  /**
   * Whether the wait is over: the picture loaded, failed, or has no file.
   */
  settled: boolean;
};

/**
 * The proportions of the picture the frame holds, read from the file's own size, so the frame is
 * drawn around the picture rather than the picture letterboxed in the frame. They are read when the
 * picture loads, or when its element is committed if it has loaded already. It holds the slide's
 * readiness until they are known, so shots, lint and exports see the final frame, and lets go when
 * the picture fails or has no file (the frame then keeps its fallback proportions, and `deckster
 * lint` reports the broken image).
 *
 * @param source - The picture's URL, or nothing when the file was not resolved.
 */
function usePictureRatio(source: string | undefined): PictureRatio {
  const [state, setState] = useState<RatioState>({
    source,
    ratio: undefined,
    settled: source === undefined,
  });
  const current =
    state.source === source ? state : { source, ratio: undefined, settled: source === undefined };
  const settled = current.settled;
  const read = useCallback(
    (image: HTMLImageElement) => {
      const { naturalWidth, naturalHeight } = image;
      const known = naturalWidth > 0 && naturalHeight > 0;
      setState({ source, ratio: known ? naturalWidth / naturalHeight : undefined, settled: true });
    },
    [source],
  );
  const readLoaded = useCallback(
    (image: HTMLImageElement | null) => {
      if (image !== null && image.complete && !settled) {
        read(image);
      }
    },
    [read, settled],
  );
  useReadyHold(!settled);
  return {
    ratio: current.ratio,
    readLoaded,
    onLoad: (event) => {
      read(event.currentTarget);
    },
    onError: () => {
      setState({ source, ratio: undefined, settled: true });
    },
  };
}

/**
 * The columns the stage takes beside a gutter: as many as the framed screen covers, and one more
 * when that leaves less than two gutters of air, so the gutter starts on the first column line past
 * the frame rather than at a fixed column (a screen made short by a two-line title, or a phone,
 * would otherwise leave a band of empty columns before its labels). The stage only ever narrows to
 * what its screen already covers, so the screen keeps its size and one measurement settles it. It
 * measures layout widths and the grid's own tracks, and again whenever the screen changes size.
 *
 * @param stage - The stage, whose first child is the frame and whose parent is the grid.
 * @param hasAside - Whether there is a gutter; without one the stage spans the grid.
 * @returns The span, or `undefined` before it is measured or without a gutter.
 */
function useStageSpan(
  stage: RefObject<HTMLDivElement | null>,
  hasAside: boolean,
): number | undefined {
  const [span, setSpan] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const box = stage.current;
    const device = box?.querySelector<HTMLElement>('.kit-screen-device') ?? null;
    const grid = box?.parentElement ?? null;
    if (!hasAside || box === null || device === null || grid === null) {
      return undefined;
    }

    /**
     * Sets the span to the columns the frame covers at its current size, with the air rule applied,
     * from the grid's first track and gap.
     */
    const measure = (): void => {
      const style = getComputedStyle(grid);
      const column = Number.parseFloat(style.gridTemplateColumns);
      const gap = Number.parseFloat(style.columnGap) || 0;
      if (!(column > 0)) {
        return;
      }

      const width = device.offsetWidth - MEASURE_TOLERANCE_PX;
      let next = Math.ceil((width + gap) / (column + gap));
      const air = next * (column + gap) - width;
      if (air < MIN_AIR_GAPS * gap) {
        next += 1;
      }

      setSpan(Math.min(Math.max(next, 1), MAX_STAGE_COLUMNS));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(device);
    return () => {
      observer.disconnect();
    };
  }, [stage, hasAside]);
  return hasAside ? span : undefined;
}

/**
 * Props of {@link Device}.
 */
type DeviceProps = {
  /**
   * The frame to draw.
   */
  frame: ScreenFrame;

  /**
   * The browser bar's address; an empty bar without one.
   */
  address: string | undefined;

  /**
   * The picture's proportions, which size the frame.
   */
  style: ScreenStyle;

  /**
   * The display: the picture and its markers.
   */
  children: ReactNode;
};

/**
 * The frame around the display, sized by the stylesheet from the room its stage leaves and the
 * picture's proportions. It stands in the brand's default surface whatever the slide's, so a frame
 * is the same object on every slide of a deck: the browser window is the kit's own app chrome (the
 * frame `demo` and `<AppFrame>` draw) in the light or dark the brand's own pages have, and a phone
 * or laptop is the brand's darkest neutral. The hardware is hidden from assistive technology.
 */
function Device({ frame, address, style, children }: DeviceProps): ReactNode {
  return (
    <div className="kit-screen-surface" data-surface="default">
      <div className="kit-screen-device" data-frame={frame} style={style}>
        <Hardware frame={frame} address={address}>
          {children}
        </Hardware>
      </div>
    </div>
  );
}

/**
 * Props of {@link Hardware}.
 */
type HardwareProps = {
  /**
   * The frame to draw.
   */
  frame: ScreenFrame;

  /**
   * The browser bar's address.
   */
  address: string | undefined;

  /**
   * The display.
   */
  children: ReactNode;
};

/**
 * What a frame draws around the display: the app chrome's browser window, a laptop's lid and base,
 * or nothing of its own (a phone's bezel is the device's padding).
 */
function Hardware({ frame, address, children }: HardwareProps): ReactNode {
  if (frame === 'browser') {
    return (
      <AppChrome chrome="browser" label={address ?? ''}>
        {children}
      </AppChrome>
    );
  }

  if (frame === 'laptop') {
    return (
      <>
        <div className="kit-screen-lid">
          <span className="kit-screen-camera" aria-hidden="true" data-decorative="" />
          {children}
        </div>
        <div className="kit-screen-base" aria-hidden="true" data-decorative="">
          <span className="kit-screen-notch" />
        </div>
      </>
    );
  }

  return children;
}

/**
 * Props of {@link Revealed}.
 */
type RevealedProps = {
  /**
   * The callout's step.
   */
  at: number;

  /**
   * Whether the callouts arrive one per step.
   */
  reveal: boolean;

  /**
   * The marker or the label.
   */
  children: ReactNode;
};

/**
 * A callout's marker or label, in a step that recedes once the next callout arrives when the slide
 * reveals its callouts, else as it is.
 */
function Revealed({ at, reveal, children }: RevealedProps): ReactNode {
  if (!reveal) {
    return children;
  }

  return (
    <Step at={at} effect="scale" focus>
      {children}
    </Step>
  );
}

/**
 * Props of {@link Marker}.
 */
type MarkerProps = {
  /**
   * The callout.
   */
  callout: ScreenCallout;

  /**
   * Its number, from 1.
   */
  number: number;
};

/**
 * A callout's numbered marker on the picture, centred on its point and kept inside the picture's
 * edges. It repeats the number of a label in the gutter, so it is hidden from assistive
 * technology.
 */
function Marker({ callout, number }: MarkerProps): ReactNode {
  const style: ScreenStyle = { '--kit-callout-x': callout.x, '--kit-callout-y': callout.y };
  return (
    <span className="kit-screen-marker" style={style} aria-hidden="true" data-decorative="">
      <span className="kit-screen-badge kit-numeric">{number}</span>
    </span>
  );
}

/**
 * Props of {@link Label}.
 */
type LabelProps = {
  /**
   * The callout.
   */
  callout: ScreenCallout;

  /**
   * Its number, from 1.
   */
  number: number;

  /**
   * The type class of the label, from the gutter's fit level.
   */
  textType: string;
};

/**
 * A callout's label in the gutter, after the number its marker shows. The list it stands in gives
 * assistive technology the order, so the number is decoration there too.
 */
function Label({ callout, number, textType }: LabelProps): ReactNode {
  return (
    <div className="kit-screen-callout">
      <span className={`kit-screen-mark ${textType}`}>
        <span className="kit-screen-badge-surface" data-surface="default">
          <span className="kit-screen-badge kit-numeric" aria-hidden="true" data-decorative="">
            {number}
          </span>
        </span>
      </span>
      <p className={`kit-screen-label ${textType}`}>{smartPunctuation(callout.label)}</p>
    </div>
  );
}

/**
 * Props of {@link Context}.
 */
type ContextProps = {
  /**
   * The type class of the sentence, from the gutter's fit level.
   */
  textType: string;

  /**
   * The body slot; nothing when the slide has none.
   */
  children?: ReactNode;
};

/**
 * The optional sentence at the top of the gutter.
 */
function Context({ textType, children }: ContextProps): ReactNode {
  if (children === undefined) {
    return null;
  }

  return <div className={`kit-screen-context kit-prose ${textType}`}>{children}</div>;
}

/**
 * The `screen` layout's component.
 */
export const screenLayout = defineLayout<typeof screenLayoutContract>({
  name: 'screen',
  component: ScreenLayout,
});
