import type { ComponentType, ReactNode, SVGProps } from 'react';

import { checkComponentProps } from '#components/check-component-props.ts';

/**
 * The type steps an icon can be sized by; the icon is as tall as a line of that step's text.
 */
export type IconSize = 'caption' | 'small' | 'body' | 'lead' | 'title' | 'headline';

/**
 * The color roles an icon can take.
 */
export type IconRole = 'fg' | 'heading' | 'muted' | 'accent' | 'positive' | 'negative';

/**
 * Props of {@link Icon}.
 */
export type IconProps = {
  /**
   * The icon's name in the brand's icon set, such as `rocket`; `set:name` picks another installed
   * set. In MDX the name is resolved at build time and an unknown one fails the build with close
   * matches, so only the icons a deck uses ship.
   */
  name?: string;

  /**
   * An icon component, for TSX slides: `import Rocket from '~icons/lucide/rocket'`.
   */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;

  /**
   * The type step whose size the icon takes; defaults to `body`.
   */
  size?: IconSize;

  /**
   * The color role of the slide's surface; defaults to the surrounding text color.
   */
  role?: IconRole;

  /**
   * A text alternative. Without it the icon is decorative and hidden from assistive technology.
   */
  label?: string;
};

/**
 * An icon from the brand's icon set, drawn as inline SVG. It is sized by the type scale, colored by
 * a role of the slide's surface and, in sets drawn with strokes, uses the brand's stroke width.
 *
 * ```mdx
 * <Icon name="shield-check" size="lead" role="accent" /> Signed and verified
 * ```
 *
 * @throws Error naming the fix when neither a build-resolved `name` nor an `icon` is given, which
 *   happens when the name is not a literal in MDX.
 */
export function Icon(props: IconProps): ReactNode {
  checkComponentProps('Icon', props);
  const { name, icon: Svg, size = 'body', role, label } = props;
  if (Svg === undefined) {
    throw new Error(
      `<Icon name=${JSON.stringify(name ?? '')}> was not resolved at build time. Write the name ` +
        'as a literal string in MDX, or pass the icon component yourself with `icon`.',
    );
  }

  return (
    <Svg
      className="kit-icon"
      data-size={size}
      data-role={role}
      aria-hidden={label === undefined ? true : undefined}
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      focusable="false"
    />
  );
}
