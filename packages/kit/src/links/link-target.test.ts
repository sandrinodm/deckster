import { describe, expect, it } from 'vite-plus/test';

import {
  displayUrl,
  isExternalLink,
  isSafeHref,
  linkAttributes,
  safeDownloadPath,
  safeHref,
} from '#links/link-target.ts';

describe('isExternalLink', () => {
  it('treats schemes and protocol-relative URLs as leaving the deck', () => {
    expect(isExternalLink('https://example.com')).toBe(true);
    expect(isExternalLink('mailto:a@b.co')).toBe(true);
    expect(isExternalLink('//example.com')).toBe(true);
  });

  it('keeps hashes and relative paths inside the deck', () => {
    expect(isExternalLink('#/3/0')).toBe(false);
    expect(isExternalLink('/docs')).toBe(false);
    expect(isExternalLink('docs/intro')).toBe(false);
  });
});

describe('linkAttributes', () => {
  it('opens external links in a new tab without access to the deck window', () => {
    expect(linkAttributes('https://example.com/x')).toEqual({
      href: 'https://example.com/x',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
  });

  it('leaves internal links alone', () => {
    expect(linkAttributes('#/2/0')).toEqual({ href: '#/2/0' });
  });
});

describe('displayUrl', () => {
  it('drops the scheme, www and trailing slash', () => {
    expect(displayUrl('https://www.example.com/')).toBe('example.com');
    expect(displayUrl('http://example.com/path/to?x=1')).toBe('example.com/path/to?x=1');
    expect(displayUrl('//example.com/a//')).toBe('example.com/a');
  });

  it('returns other destinations as written, without mailto:', () => {
    expect(displayUrl('mailto:team@example.com')).toBe('team@example.com');
    expect(displayUrl('#/3/0')).toBe('#/3/0');
  });
});

describe('isSafeHref', () => {
  it('allows the web, mail, phone, paths and fragments', () => {
    for (const href of [
      'https://a.test',
      'http://a.test',
      'mailto:a@b.test',
      'tel:+1555',
      '/x',
      'x.pdf',
      '#/2/0',
      '//cdn.test/x',
    ]) {
      expect(isSafeHref(href), href).toBe(true);
    }
  });

  it('refuses script and data schemes, whatever their case and spacing', () => {
    for (const href of [
      'javascript:alert(1)',
      ' JavaScript:alert(1)',
      'data:text/html,x',
      'vbscript:x',
    ]) {
      expect(isSafeHref(href), href).toBe(false);
    }
  });
});

/**
 * Destinations that a browser would run as script or load from a scheme a slide may not use, each
 * written the way an attacker hides the scheme from a naive check.
 */
const BYPASSES = [
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  'java\rscript:alert(1)',
  '\u0001javascript:x',
  '\u0000javascript:x',
  ' \u001f javascript:x',
  'javascript:x\u0001',
  'JaVaScRiPt:alert(1)',
  '\tjavascript:alert(1)',
  '\njavascript:alert(1)',
  'j\na\tv\ra script:alert(1)'.replace(' ', ''),
  'vbscript:msgbox(1)',
  'VBScript:x',
  'data:text/html,<script>alert(1)</script>',
  ' data:text/html;base64,PHNjcmlwdD4=',
  'blob:https://a.test/uuid',
  'file:///etc/passwd',
  'FILE:///C:/x',
  'filesystem:https://a.test/x',
  'about:blank',
  'chrome://settings',
  'ms-settings:privacy',
  'https://a.test/\u0001x',
  '',
  ' \t\n',
] as const;

describe('safeHref', () => {
  it('refuses every scheme bypass a browser would follow', () => {
    for (const href of BYPASSES) {
      expect(isSafeHref(href), JSON.stringify(href)).toBe(false);
      expect(safeHref(href), JSON.stringify(href)).toBeUndefined();
    }
  });

  it('returns the destination as the browser reads it: tabs and newlines out, ends trimmed', () => {
    expect(safeHref('  https://a.test/x  ')).toBe('https://a.test/x');
    expect(safeHref('ht\ttps://a.\nte\rst/x')).toBe('https://a.test/x');
    expect(safeHref('\u0001mailto:a@b.test')).toBe('mailto:a@b.test');
    expect(safeHref('TEL:+1555')).toBe('TEL:+1555');
    expect(safeHref('#/2/0')).toBe('#/2/0');
    expect(safeHref('slides/x.pdf')).toBe('slides/x.pdf');
    expect(safeHref('../x.pdf')).toBe('../x.pdf');
    expect(safeHref('/docs')).toBe('/docs');
  });

  it('makes a protocol-relative or backslashed host an explicit https: link', () => {
    expect(safeHref('//cdn.test/x')).toBe('https://cdn.test/x');
    expect(safeHref('\\\\evil.test\\x')).toBe('https://evil.test/x');
    expect(safeHref('/\\evil.test/x')).toBe('https://evil.test/x');
    expect(safeHref('\t//evil.test')).toBe('https://evil.test/');
  });

  it('reads text that only looks like a scheme as a relative path', () => {
    expect(safeHref('javascript&colon;alert(1)')).toBe('javascript&colon;alert(1)');
    expect(safeHref('java&#9;script:x')).toBe('java&#9;script:x');
    expect(safeHref('j\u0430vascript:alert(1)')).toBe('j\u0430vascript:alert(1)');
    expect(safeHref('javascript\uff1aalert(1)')).toBe('javascript\uff1aalert(1)');
  });

  it('marks the normalised destination as external when it leaves the deck', () => {
    expect(linkAttributes(safeHref('ht\ttps://a.test') ?? '')).toEqual({
      href: 'https://a.test',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
  });
});

describe('safeDownloadPath', () => {
  it('keeps relative paths to the built deck', () => {
    expect(safeDownloadPath('talk.pdf')).toBe('talk.pdf');
    expect(safeDownloadPath(' exports/talk.pptx ')).toBe('exports/talk.pptx');
  });

  it('refuses schemes, hosts and absolute paths', () => {
    for (const file of [
      ...BYPASSES,
      'https://a.test/talk.pdf',
      'mailto:a@b.test',
      '//a.test/talk.pdf',
      '\\\\host\\share\\talk.pdf',
      '/talk.pdf',
      '\\talk.pdf',
      '#talk',
    ]) {
      expect(safeDownloadPath(file), JSON.stringify(file)).toBeUndefined();
    }
  });
});
