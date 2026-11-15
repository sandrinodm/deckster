import { titleFromName } from '#scaffold/names.ts';

/**
 * The slide steps the scaffolded app asks the deck for, to show `requestSteps`.
 */
const SCAFFOLD_STEPS = 3;

/**
 * The app's entry module.
 */
const MAIN_SOURCE = [
  "import { createRoot } from 'react-dom/client';",
  '',
  "import { App } from './app.tsx';",
  "import './app.css';",
  '',
  "const root = document.getElementById('root');",
  'if (root === null) {',
  "  throw new Error('index.html has no #root element.');",
  '}',
  '',
  'createRoot(root).render(<App />);',
  '',
].join('\n');

/**
 * The app's error boundary: a render error shows a short message in the app and is reported to the
 * deck. Uncaught errors and rejections outside React reach the deck through the bridge by itself.
 */
const ERROR_BOUNDARY_SOURCE = [
  "import { Component, type ReactNode } from 'react';",
  '',
  '/**',
  ' * Props of {@link ErrorBoundary}.',
  ' */',
  'type ErrorBoundaryProps = {',
  '  /**',
  '   * Tells the deck what went wrong.',
  '   */',
  '  onError: (message: string) => void;',
  '',
  '  /**',
  '   * The app.',
  '   */',
  '  children?: ReactNode;',
  '};',
  '',
  '/**',
  ' * Catches a render error, shows it and reports it to the deck.',
  ' */',
  'export class ErrorBoundary extends Component<ErrorBoundaryProps, { message?: string }> {',
  '  override state: { message?: string } = {};',
  '',
  '  static getDerivedStateFromError(error: unknown): { message: string } {',
  '    return { message: error instanceof Error ? error.message : String(error) };',
  '  }',
  '',
  '  override componentDidCatch(error: unknown): void {',
  '    this.props.onError(error instanceof Error ? error.message : String(error));',
  '  }',
  '',
  '  override render(): ReactNode {',
  '    if (this.state.message === undefined) {',
  '      return this.props.children;',
  '    }',
  '',
  '    return (',
  '      <main className="app" role="alert">',
  '        <h1>The demo stopped</h1>',
  '        <p className="app-error">{this.state.message}</p>',
  '      </main>',
  '    );',
  '  }',
  '}',
  '',
].join('\n');

/**
 * The app's stylesheet: brand variables with fallbacks, so it also looks right when opened alone.
 */
const APP_CSS = [
  ':root {',
  '  color-scheme: light dark;',
  '}',
  '',
  'body {',
  '  margin: 0;',
  '  background: var(--brand-background, Canvas);',
  '  color: var(--brand-color-fg, CanvasText);',
  '  font-family: var(--brand-font-body, system-ui, sans-serif);',
  '}',
  '',
  '.app {',
  '  display: grid;',
  '  gap: var(--brand-space-md, 16px);',
  '  place-content: center;',
  '  min-height: 100vh;',
  '  padding: var(--brand-space-xl, 32px);',
  '}',
  '',
  '.app h1 {',
  '  margin: 0;',
  '  color: var(--brand-color-accent, LinkText);',
  '  font-family: var(--brand-font-display, inherit);',
  '  font-size: var(--brand-type-headline-size, 48px);',
  '}',
  '',
  '.app p {',
  '  margin: 0;',
  '  color: var(--brand-color-muted, GrayText);',
  '  font-size: var(--brand-type-body-size, 24px);',
  '}',
  '',
  ".app[data-active='false'] {",
  '  opacity: 0.6;',
  '}',
  '',
  '.app-error {',
  '  display: -webkit-box;',
  '  overflow: hidden;',
  '  overflow-wrap: anywhere;',
  '  -webkit-box-orient: vertical;',
  '  -webkit-line-clamp: 6;',
  '}',
  '',
].join('\n');

/**
 * The files of a new mini app, by path relative to the app folder. The app is a small React page
 * wired to `@deckster/app-bridge`: it reads the brand tokens the deck sends, owns a few steps of
 * its slide with `requestSteps`, tells the deck when it is ready and pauses while its slide is off
 * screen. The sources are written as the formatter prints them.
 *
 * @param name - The app folder name, in kebab-case.
 */
export function appFiles(name: string): Record<string, string> {
  return {
    'index.html': indexHtml(name),
    'main.tsx': MAIN_SOURCE,
    'app.tsx': appSource(),
    'error-boundary.tsx': ERROR_BOUNDARY_SOURCE,
    'app.css': APP_CSS,
  };
}

/**
 * The app's HTML entry.
 *
 * @param name - The app folder name.
 */
function indexHtml(name: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `    <title>${titleFromName(name)}</title>`,
    '  </head>',
    '  <body>',
    '    <div id="root"></div>',
    '    <script type="module" src="./main.tsx"></script>',
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

/**
 * The app's component.
 */
function appSource(): string {
  return [
    "import { useDeckApp } from '@deckster/app-bridge/react';",
    "import { useEffect } from 'react';",
    '',
    "import { ErrorBoundary } from './error-boundary.tsx';",
    '',
    `const STEPS = ${SCAFFOLD_STEPS};`,
    '',
    '/**',
    " * The app: it asks the deck for its steps, says when the first frame is drawn and shows the brand's",
    ' * accent while its slide is on screen. A render error shows a message and tells the deck, which',
    ' * plays the recording or shows the poster.',
    ' */',
    'export function App() {',
    '  const { error } = useDeckApp();',
    '  return (',
    '    <ErrorBoundary onError={error}>',
    '      <Demo />',
    '    </ErrorBoundary>',
    '  );',
    '}',
    '',
    '/**',
    ' * What the app shows. Replace it with the demo; read `step` to move through it with the deck.',
    ' */',
    'function Demo() {',
    '  const { brand, active, step, ready, requestSteps } = useDeckApp();',
    '  useEffect(() => {',
    '    requestSteps(STEPS);',
    '    ready();',
    '  }, [ready, requestSteps]);',
    '  return (',
    '    <main className="app" data-active={active}>',
    "      <h1>{brand?.label ?? 'Standalone'}</h1>",
    '      <p>',
    "        Step {step} of {STEPS}. The slide is {active ? 'on screen' : 'paused'}.",
    '      </p>',
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n');
}
