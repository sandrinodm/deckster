import type { ReactNode } from 'react';

import { useBrand } from '@deckster/brand/runtime';

/**
 * Props of {@link BrandLogo}.
 */
type BrandLogoProps = {
  /**
   * The logo height as a multiple of the brand's chrome logo height; 1 is the chrome size.
   */
  scale?: number;
};

/**
 * The brand's logo in the variant the slide's surface asks for, at a multiple of its chrome height.
 * Its width is reserved from the logo's aspect, so the layout does not move when it loads. A brand
 * that hides its logo (`chrome.logo.show: false`) or has none draws nothing, in every mode.
 */
export function BrandLogo({ scale = 1 }: BrandLogoProps): ReactNode {
  const { brand, logo } = useBrand();
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
