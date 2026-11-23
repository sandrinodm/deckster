import type { CSSProperties, ReactNode } from 'react';

import { useStepAt } from '@deckster/engine';

import type { ChartDrawing, DrawInput } from '#charts/frame/chart-frame.tsx';
import type { Scene, SceneItem, TextItem } from '#charts/frame/scene.ts';

import { ChartStep } from '#charts/frame/chart-step.tsx';

/**
 * The dash of a drawable path. The path is measured as one unit long (`pathLength` 1), so this dash
 * is in those units and covers the whole path.
 */
const DRAWABLE_DASH = '1 1';

/**
 * Custom properties an item sets for its build.
 */
type BuildStyle = CSSProperties & Record<`--${string}`, string | number | undefined>;

/**
 * Props of {@link SceneSvg}.
 */
type SceneSvgProps = {
  /**
   * The scene to draw.
   */
  scene: Scene;

  /**
   * The chart's accessible name.
   */
  name: string;

  /**
   * The id of the chart's text summary.
   */
  summaryId: string;
};

/**
 * Draws a chart's scene as an SVG at the plot's size in canvas pixels (never scaled, so text is set
 * at the brand's sizes): each layer in its own step group, each mark with its build, and the
 * highlight's colors once its step is reached.
 */
export function SceneSvg({ scene, name, summaryId }: SceneSvgProps): ReactNode {
  const highlightState = useStepAt(scene.highlightAt);
  const highlightOn = highlightState !== 'hidden';
  return (
    <svg
      width={scene.width}
      height={scene.height}
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      fill="none"
      // An inline SVG is the chart itself and cannot be an <img>; role="img" with a name and a
      // description is the accessible pattern for it.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="img"
      aria-label={name}
      aria-describedby={summaryId}>
      {scene.layers.map((layer, index) => (
        <ChartStep key={index} at={layer.at} until={layer.until}>
          {layer.items.map((item, position) => (
            <SceneElement key={position} item={item} highlightOn={highlightOn} />
          ))}
        </ChartStep>
      ))}
    </svg>
  );
}

/**
 * A planned chart as the frame draws it: its scene as SVG, with the author's name when set.
 *
 * @param planned - The scene, spec and facts a planner made.
 * @param input - The frame's draw input, for the summary id and the label.
 */
export function drawScene(
  planned: Omit<ChartDrawing, 'plot'> & { scene: Scene },
  input: DrawInput,
): ChartDrawing {
  return {
    plot: (
      <SceneSvg
        scene={planned.scene}
        name={input.label ?? planned.spec.name}
        summaryId={input.summaryId}
      />
    ),
    spec: planned.spec,
    facts: planned.facts,
  };
}

/**
 * Props of {@link SceneElement}.
 */
type SceneElementProps = {
  /**
   * The item.
   */
  item: SceneItem;

  /**
   * Whether the highlight's colors apply.
   */
  highlightOn: boolean;
};

/**
 * One scene item as SVG.
 */
export function SceneElement({ item, highlightOn }: SceneElementProps): ReactNode {
  const build = buildProps(item);
  switch (item.kind) {
    case 'path': {
      const fill = highlightOn ? item.fill : (item.fillBefore ?? item.fill);
      const stroke = highlightOn ? item.stroke : (item.strokeBefore ?? item.stroke);
      return (
        <path
          {...build}
          d={item.d}
          style={{ ...build.style, fill, stroke }}
          fillOpacity={item.fillOpacity}
          strokeWidth={item.strokeWidth}
          strokeDasharray={item.drawable === true ? DRAWABLE_DASH : item.dash}
          strokeLinecap={item.cap ?? 'round'}
          strokeLinejoin="round"
          {...(item.drawable === true ? { pathLength: 1 } : {})}
        />
      );
    }

    case 'circle': {
      const fill = highlightOn ? item.fill : (item.fillBefore ?? item.fill);
      return (
        <circle
          {...build}
          cx={item.cx}
          cy={item.cy}
          r={item.r}
          style={{ ...build.style, fill, stroke: item.ring }}
          strokeWidth={item.ringWidth}
        />
      );
    }

    case 'line': {
      return (
        <line
          {...build}
          x1={item.x1}
          y1={item.y1}
          x2={item.x2}
          y2={item.y2}
          stroke={item.stroke}
          strokeWidth={item.width}
          strokeDasharray={item.dash}
        />
      );
    }

    case 'text': {
      return <SceneText item={item} highlightOn={highlightOn} />;
    }
  }
}

/**
 * Props of {@link SceneText}.
 */
type SceneTextProps = {
  /**
   * The text item.
   */
  item: TextItem;

  /**
   * Whether the highlight's colors apply.
   */
  highlightOn: boolean;
};

/**
 * A text item in its brand type step, one `tspan` per line, at the size the chart laid it out at (a
 * figure scaled to fit its room is smaller than its step). The color is set as both `fill` and
 * `color`, so the lint snapshot reads the color the text is painted in; a text cut short carries
 * its whole text as `data-truncated`, which `deckster lint` reports.
 */
function SceneText({ item, highlightOn }: SceneTextProps): ReactNode {
  const build = buildProps(item);
  const color = highlightOn ? item.color : (item.colorBefore ?? item.color);
  const background = highlightOn ? item.background : (item.backgroundBefore ?? item.background);
  const lineHeight = item.style.size * item.style.lineHeight;
  const className = [
    'kit-chart-text',
    `kit-type-${item.style.step}`,
    item.tabular === true ? 'kit-chart-tabular' : '',
    build.className ?? '',
  ]
    .filter((name) => name !== '')
    .join(' ');
  return (
    <text
      {...build}
      className={className}
      x={item.x}
      y={item.y}
      textAnchor={item.anchor}
      dominantBaseline="central"
      data-truncated={item.cut}
      style={{
        ...build.style,
        fill: color,
        color,
        // The step's class sets the step's size; the layout may have scaled it to fit.
        fontSize: item.style.size,
        fontWeight: item.weight,
        // SVG text paints no background; this tells contrast checks which mark it sits on.
        backgroundColor: background,
      }}>
      {item.lines.length === 1
        ? item.lines[0]
        : item.lines.map((line, index) => (
            <tspan key={index} x={item.x} dy={index === 0 ? 0 : lineHeight}>
              {line}
            </tspan>
          ))}
    </text>
  );
}

/**
 * The attributes that give an item its build, its place in the stagger and the mark class.
 *
 * @param item - The item.
 */
function buildProps(item: SceneItem): {
  'data-anim'?: string;
  'data-lag'?: string;
  className?: string;
  style: BuildStyle;
} {
  return {
    ...(item.anim === undefined ? {} : { 'data-anim': item.anim }),
    ...(item.lag === true ? { 'data-lag': 'marks' } : {}),
    ...(item.mark === true ? { className: 'kit-chart-mark' } : {}),
    style: item.order === undefined ? {} : { '--kit-chart-order': item.order },
  };
}
