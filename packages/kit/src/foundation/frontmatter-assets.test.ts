import { describe, expect, it } from 'vite-plus/test';

import {
  frontmatterAsset,
  frontmatterAssetKey,
  registerFrontmatterAssets,
} from '#foundation/frontmatter-assets.ts';

describe('frontmatterAsset', () => {
  it('finds the file of the slide a relative path is written in', () => {
    registerFrontmatterAssets({
      [frontmatterAssetKey('./photo.png', 'slides/a/intro.mdx')]: '/a/photo.png',
    });
    registerFrontmatterAssets({
      [frontmatterAssetKey('./photo.png', 'slides/b/team.mdx')]: '/b/photo.png',
    });
    expect(frontmatterAsset('./photo.png', 'slides/a/intro.mdx')).toBe('/a/photo.png');
    expect(frontmatterAsset('./photo.png', 'slides/b/team.mdx')).toBe('/b/photo.png');
  });

  it('still finds a file registered for every slide, and passes direct sources through', () => {
    registerFrontmatterAssets({ [frontmatterAssetKey('assets/x.png')]: '/x.png' });
    expect(frontmatterAsset('assets/x.png', 'slides/a/intro.mdx')).toBe('/x.png');
    expect(frontmatterAsset('https://example.com/y.png')).toBe('https://example.com/y.png');
    expect(frontmatterAsset('./missing.png', 'slides/a/intro.mdx')).toBeUndefined();
  });
});
