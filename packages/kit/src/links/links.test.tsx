import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vite-plus/test';

import { Button } from '#links/button.tsx';
import { Download } from '#links/download.tsx';
import { LinkCard } from '#links/link-card.tsx';
import { Link } from '#links/link.tsx';

describe('Button', () => {
  it('is interactive and opens an external link in a new tab', () => {
    const html = renderToStaticMarkup(<Button href="https://example.com/x">Open</Button>);
    expect(html).toContain('data-deck-interactive=""');
    expect(html).toContain('href="https://example.com/x"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('>Open<');
  });

  it('keeps a link inside the deck in the same tab', () => {
    const html = renderToStaticMarkup(<Button href="#/3/0">Jump</Button>);
    expect(html).not.toContain('target=');
  });

  it('refuses a javascript: or data: destination', () => {
    expect(() => renderToStaticMarkup(<Button href="javascript:alert(1)">Go</Button>)).toThrow(
      /is refused: a slide may link only to http:, https:, mailto: or tel:/,
    );
    expect(() =>
      renderToStaticMarkup(<LinkCard href="data:text/html,<b>x</b>" title="x" />),
    ).toThrow(/refused/);
  });
});

describe('Link', () => {
  it('opens an outside site in a new tab and takes the click from the deck', () => {
    const html = renderToStaticMarkup(<Link href="https://example.com">Example</Link>);
    expect(html).toContain('class="kit-link"');
    expect(html).toContain('data-deck-interactive=""');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('keeps a #fragment in the deck, and draws an unsafe destination as plain text', () => {
    expect(renderToStaticMarkup(<Link href="#/2/0">Back</Link>)).not.toContain('target=');
    const refused = renderToStaticMarkup(<Link href="javascript:alert(1)">Click</Link>);
    expect(refused).not.toContain('href=');
    expect(refused).toContain('data-refused-link');
  });
});

describe('LinkCard', () => {
  it('shows the title, the description and the readable URL, and is interactive', () => {
    const html = renderToStaticMarkup(
      <LinkCard
        href="https://www.example.com/repo/"
        title="The repository"
        description="Source."
        icon={<b>G</b>}
      />,
    );
    expect(html).toContain('data-deck-interactive=""');
    expect(html).toContain('The repository');
    expect(html).toContain('Source.');
    expect(html).toContain('>example.com/repo<');
    expect(html).toContain('<b>G</b>');
    expect(html).toContain('target="_blank"');
  });

  it('leaves out the icon and description when there are none', () => {
    const html = renderToStaticMarkup(<LinkCard href="https://example.com" title="Docs" />);
    expect(html).not.toContain('kit-link-card-icon');
    expect(html).not.toContain('kit-link-card-description');
  });
});

describe('Download', () => {
  it('refuses a file that is not a relative path', () => {
    expect(() => renderToStaticMarkup(<Download file="javascript:alert(1)">Get</Download>)).toThrow(
      /is refused/,
    );
    expect(() => renderToStaticMarkup(<Download file={'java\tscript:x'}>Get</Download>)).toThrow(
      /is refused/,
    );
    expect(() =>
      renderToStaticMarkup(<Download file="https://a.test/x.pdf">Get</Download>),
    ).toThrow(/is refused/);
  });

  it('downloads a relative file under its own name', () => {
    const html = renderToStaticMarkup(<Download file="exports/talk.pdf">Get</Download>);
    expect(html).toContain('href="exports/talk.pdf"');
    expect(html).toContain('download="talk.pdf"');
  });
});

describe('links render what was checked', () => {
  it('renders the normalised destination, not the raw string', () => {
    const button = renderToStaticMarkup(<Button href={'ht\ttps://a.test/x'}>Go</Button>);
    expect(button).toContain('href="https://a.test/x"');
    const link = renderToStaticMarkup(<Link href={' //cdn.test/x'}>Go</Link>);
    expect(link).toContain('href="https://cdn.test/x"');
  });

  it('draws a tab-split javascript: link as plain text', () => {
    const refused = renderToStaticMarkup(<Link href={'java\tscript:alert(1)'}>Click</Link>);
    expect(refused).not.toContain('href=');
    expect(() => renderToStaticMarkup(<Button href={'\u0001javascript:x'}>Go</Button>)).toThrow(
      /refused/,
    );
  });
});
