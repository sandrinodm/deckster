import type { BrandTokens, Hex, SurfaceTokens } from '#resolve/brand-tokens.ts';
import type { CodeToken } from '#schema/theme-schema.ts';

/**
 * One TextMate scope rule in a Shiki theme.
 */
export type ShikiTokenColor = {
  /**
   * The TextMate scopes the rule colors.
   */
  scope: string[];

  /**
   * The text color, and a font style such as `italic` where the token has one.
   */
  settings: { foreground: Hex; fontStyle?: string };
};

/**
 * A Shiki (TextMate) theme, structurally the `ThemeRegistration` that `shiki` accepts, so this
 * package does not depend on Shiki at runtime.
 */
export type ShikiTheme = {
  /**
   * The id code blocks name the theme by.
   */
  name: string;

  /**
   * The name shown to people.
   */
  displayName: string;

  /**
   * Whether the theme is for a light or a dark background.
   */
  type: 'light' | 'dark';

  /**
   * The default text color.
   */
  fg: Hex;

  /**
   * The code background.
   */
  bg: Hex;

  /**
   * Editor colors by VS Code color id, such as `editor.background`.
   */
  colors: Record<string, Hex>;

  /**
   * The scope rules that color the tokens.
   */
  tokenColors: ShikiTokenColor[];
};

/**
 * Which TextMate scopes take which code theme color.
 */
const SCOPES: readonly { token: CodeToken; scope: readonly string[]; fontStyle?: string }[] = [
  { token: 'comment', scope: ['comment', 'punctuation.definition.comment'], fontStyle: 'italic' },
  {
    token: 'keyword',
    scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.control'],
  },
  { token: 'punctuation', scope: ['punctuation', 'meta.brace', 'keyword.operator'] },
  {
    token: 'string',
    scope: ['string', 'string.quoted', 'string.template', 'punctuation.definition.string'],
  },
  {
    token: 'number',
    scope: ['constant.numeric', 'constant.language', 'constant.character', 'support.constant'],
  },
  {
    token: 'function',
    scope: [
      'entity.name.function',
      'support.function',
      'meta.function-call',
      'variable.function',
      'entity.other.attribute-name',
    ],
  },
  {
    token: 'type',
    scope: [
      'entity.name.type',
      'entity.name.class',
      'support.type',
      'support.class',
      'entity.other.inherited-class',
      'entity.name.tag',
    ],
  },
  {
    token: 'foreground',
    scope: ['variable', 'variable.other', 'variable.parameter', 'meta.object-literal.key'],
  },
];

/**
 * Builds the Shiki theme for one surface from its code theme colors. Each surface gets its own
 * theme because code on the inverse surface sits on a different background.
 *
 * @param tokens - Resolved brand tokens.
 * @param surface - A surface of the brand.
 * @returns A theme named `<brand>-<surface>`.
 */
export function shikiTheme(tokens: BrandTokens, surface: SurfaceTokens): ShikiTheme {
  const { code } = surface;
  return {
    name: `${tokens.name}-${surface.name}`,
    displayName: `${tokens.label} (${surface.name})`,
    type: surface.scheme,
    fg: code.foreground,
    bg: code.background,
    colors: {
      'editor.background': code.background,
      'editor.foreground': code.foreground,
      'editor.lineHighlightBackground': code.highlight,
      'editor.selectionBackground': code.highlight,
    },
    tokenColors: SCOPES.map(({ token, scope, fontStyle }) => ({
      scope: [...scope],
      settings:
        fontStyle === undefined
          ? { foreground: code[token] }
          : { foreground: code[token], fontStyle },
    })),
  };
}
