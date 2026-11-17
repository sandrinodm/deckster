import type { ReactNode } from 'react';

import { getBrand, useBrand, type BrandView } from '@deckster/brand/runtime';

/**
 * Props of {@link BrandLogo}.
 */
type BrandLogoProps = {
  /**
   * The logo height as a multiple of the brand's chrome logo height; 1 is the chrome size.
   */
  scale?: number;

  /**
   * Draw the variant the brand shows on a dark surface, for a logo over a dark scrim on a photo,
   * whatever the slide's surface; the slide's own variant when the brand has no dark surface.
   */
  onDark?: boolean;
};

/**
 * The brand's logo in the variant the slide's surface asks for, at a multiple of its chrome height.
 * Its width is reserved from the logo's aspect, so the layout does not move when it loads. A brand
 * that hides its logo (`chrome.logo.show: false`) or has none draws nothing, in every mode.
 */
export function BrandLogo({ scale = 1, onDark = false }: BrandLogoProps): ReactNode {
  const view = useBrand();
  const { brand, logo } = onDark ? darkView(view) : view;
  if (!logo.shown) {
    return null;
  }

  const height = Math.round(logo.height * scale);
  return (
    <img
      className="kit-logo"
      src={logo.url}
      alt={brand.label}
      width={Math.round(height * logo.aspect)}
      height={height}
    />
  );
}

/**
 * The brand as seen from a dark surface: the slide's own when it is dark, else the brand's first
 * dark surface, else the slide's own.
 *
 * @param view - The brand as the slide's surface sees it.
 */
function darkView(view: BrandView): BrandView {
  if (view.surface.scheme === 'dark') {
    return view;
  }

  const dark = Object.entries(view.brand.surfaces).find(([, surface]) => surface.scheme === 'dark');
  if (dark === undefined) {
    return view;
  }

  const [darkSurface] = dark;
  return getBrand(darkSurface);
}
