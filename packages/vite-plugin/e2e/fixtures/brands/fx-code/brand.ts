import { defineBrand } from '@deckster/brand';

/**
 * A small brand for the plugin's e2e fixtures whose `layouts/` folder holds a code layout.
 */
export default defineBrand({
  name: 'fx-code',
  label: 'Fixture brand with code layouts',
  color: {
    palette: {
      gray: {
        0: '#ffffff',
        50: '#f5f5f6',
        200: '#dddde1',
        300: '#c4c5cc',
        600: '#565863',
        900: '#18191d',
      },
      blue: { 100: '#dde6ff', 300: '#93acff', 600: '#2f4fd8', 800: '#1c2f84' },
      orange: { 300: '#ffc078', 600: '#b45f00' },
      teal: { 700: '#0e7490' },
      red: { 600: '#c8331f' },
    },
    roles: {
      bg: 'gray.0',
      surface: 'gray.50',
      fg: 'gray.900',
      muted: 'gray.600',
      accent: 'blue.600',
      'accent-fg': 'gray.0',
      border: 'gray.200',
      positive: 'teal.700',
      negative: 'red.600',
    },
    surfaces: { default: {} },
    data: {
      categorical: ['blue.600', 'orange.600', 'gray.900'],
      sequential: ['blue.100', 'blue.300', 'blue.600', 'blue.800'],
      diverging: ['orange.600', 'orange.300', 'gray.50', 'blue.300', 'blue.800'],
      context: 'gray.300',
    },
  },
  gradients: {},
  typography: {
    families: {
      display: { family: 'Display', fallback: ['sans-serif'], source: { kind: 'system' } },
      body: { family: 'Body', fallback: ['sans-serif'], source: { kind: 'system' } },
      mono: { family: 'Mono', fallback: ['monospace'], source: { kind: 'system' } },
    },
    scale: {
      display: { family: 'display', size: 140, lineHeight: 1, tracking: -0.03, weight: 700 },
      headline: { family: 'display', size: 80, lineHeight: 1.05, tracking: -0.02, weight: 700 },
      title: { family: 'display', size: 48, lineHeight: 1.1, tracking: -0.01, weight: 600 },
      lead: { family: 'body', size: 38, lineHeight: 1.4, tracking: 0, weight: 400 },
      body: { family: 'body', size: 32, lineHeight: 1.45, tracking: 0, weight: 400 },
      small: { family: 'body', size: 24, lineHeight: 1.45, tracking: 0, weight: 400 },
      caption: { family: 'body', size: 20, lineHeight: 1.4, tracking: 0, weight: 500 },
      label: {
        family: 'body',
        size: 20,
        lineHeight: 1.2,
        tracking: 0.08,
        weight: 600,
        case: 'upper',
      },
      stat: { family: 'display', size: 160, lineHeight: 0.95, tracking: -0.04, weight: 700 },
      quote: { family: 'display', size: 60, lineHeight: 1.2, tracking: -0.01, weight: 500 },
      code: { family: 'mono', size: 26, lineHeight: 1.5, tracking: 0, weight: 400 },
    },
  },
  shape: {
    radius: { sm: 4, md: 8, lg: 16, xl: 24 },
    stroke: { hairline: 1, regular: 2, bold: 4 },
    shadow: { sm: 'none', md: 'none', lg: 'none' },
  },
  spacing: {
    scale: { '2xs': 4, xs: 8, sm: 16, md: 24, lg: 40, xl: 64, '2xl': 96, '3xl': 144 },
    margin: { x: 120, y: 100 },
    grid: { columns: 12, gutter: 32 },
  },
  logo: {
    variants: { primary: { file: 'logos/mark.svg', aspect: 1 } },
    default: 'primary',
    clearSpace: 0.5,
    placement: { corner: 'bottom-left', height: 40 },
  },
  icons: { set: 'lucide', strokeWidth: 1.5 },
  imagery: { treatments: { plain: { type: 'none' } }, default: 'plain' },
  chrome: {
    pageNumber: { show: true, format: '{n}', corner: 'bottom-right' },
    footer: { show: false, text: '', corner: 'top-right' },
    progress: { show: false, edge: 'bottom', thickness: 4 },
    logo: { show: true },
    skipFirst: false,
  },
  motion: {
    easings: { standard: [0.2, 0, 0, 1] },
    durations: { base: 300 },
    transition: { kind: 'fade', duration: 'base', easing: 'standard' },
  },
});
