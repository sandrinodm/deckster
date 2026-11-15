import { describe, expect, it } from 'vite-plus/test';

import { renderGallery, type GalleryEntry } from '#site/render-gallery.ts';

/**
 * A gallery entry with defaults.
 *
 * @param overrides - Fields that differ.
 */
function entry(overrides: Partial<GalleryEntry> = {}): GalleryEntry {
  return {
    id: 'hello',
    title: 'Hello <deck>',
    brand: 'default',
    brandLabel: 'Default',
    slides: 4,
    thumbnail: true,
    pdf: false,
    pptx: false,
    ...overrides,
  };
}

describe('renderGallery', () => {
  it('links the deck and its thumbnail relatively and escapes the title', () => {
    const html = renderGallery([entry()]);
    expect(html).toContain('<a href="hello/">Hello &lt;deck&gt;</a>');
    expect(html).toContain('src="hello/thumbnail.png"');
    expect(html).toContain(
      'hello &middot; <span title="brands/default">Default</span> &middot; 4 slides',
    );
    expect(html).not.toContain('PDF');
  });

  it('links the exports only when they exist, and leaves out a missing thumbnail', () => {
    const html = renderGallery([entry({ pdf: true, pptx: true, thumbnail: false, slides: 1 })]);
    expect(html).toContain('<a href="hello/hello.pdf">PDF</a>');
    expect(html).toContain('<a href="hello/hello.pptx">PPTX</a>');
    expect(html).not.toContain('<img');
    expect(html).toContain('1 slide');
  });

  it("shows the brand's own name, not its folder name", () => {
    const html = renderGallery([entry({ brand: 'nocturne', brandLabel: 'Nocturne & Co' })]);
    expect(html).toContain('<span title="brands/nocturne">Nocturne &amp; Co</span>');
  });

  it('says so when no deck was built', () => {
    expect(renderGallery([])).toContain('No decks were built.');
  });
});
