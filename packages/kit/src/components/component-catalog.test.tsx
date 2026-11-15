import type { NotesProps, StepProps } from '@deckster/engine';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vite-plus/test';

import type { AppFrameProps } from '#apps/app-frame.tsx';
import type { LiveProps } from '#apps/live.tsx';
import type { CodeMoveProps } from '#code/code-move.tsx';
import type { CodeStepProps } from '#code/code-step.tsx';
import type { CodeProps } from '#code/code.tsx';
import type { CmdProps, OutProps, TerminalProps } from '#code/terminal.tsx';
import type { IconProps } from '#icons/icon.tsx';
import type { ButtonProps } from '#links/button.tsx';
import type { DownloadProps } from '#links/download.tsx';
import type { LinkCardProps } from '#links/link-card.tsx';
import type { QRProps } from '#links/qr.tsx';
import type { ImageProps } from '#media/image.tsx';
import type { LottieProps } from '#media/lottie.tsx';
import type { VideoProps } from '#media/video.tsx';

import { CHART_COMPONENTS } from '#charts/chart-components.ts';
import { checkComponentProps, propsProblem } from '#components/check-component-props.ts';
import { COMPONENT_INFOS, componentCatalog } from '#components/component-catalog.ts';
import { DIAGRAM_COMPONENTS } from '#diagrams/diagram-components.ts';
import { Download } from '#links/download.tsx';
import kit from '#runtime.ts';

/**
 * The props the catalog describes for a component, with their literal names and `required` flags.
 */
type Described<Name extends string> = Extract<
  (typeof COMPONENT_INFOS)[number],
  { name: Name }
>['props'];

/**
 * `true` when a catalog entry names exactly the props of a component's props type, and marks
 * exactly the ones the type does not make optional as required; `false` otherwise.
 */
type Agrees<Props, Name extends string> = [keyof Props] extends [keyof Described<Name>]
  ? [keyof Described<Name>] extends [keyof Props]
    ? {
        [Key in keyof Props & keyof Described<Name>]: Described<Name>[Key] extends {
          required: {} extends Pick<Props, Key> ? false : true;
        }
          ? true
          : false;
      }[keyof Props & keyof Described<Name>] extends true
      ? true
      : false
    : false
  : false;

/**
 * Checked by the compiler: each line fails to compile when a component's props type and its catalog
 * entry disagree on a prop's name or on whether it is required.
 */
const AGREE: Record<string, true> = {
  Code: true satisfies Agrees<CodeProps, 'Code'>,
  CodeMove: true satisfies Agrees<CodeMoveProps, 'CodeMove'>,
  CodeStep: true satisfies Agrees<CodeStepProps, 'CodeStep'>,
  Terminal: true satisfies Agrees<TerminalProps, 'Terminal'>,
  Cmd: true satisfies Agrees<CmdProps, 'Cmd'>,
  Out: true satisfies Agrees<OutProps, 'Out'>,
  Image: true satisfies Agrees<ImageProps, 'Image'>,
  Video: true satisfies Agrees<VideoProps, 'Video'>,
  Lottie: true satisfies Agrees<LottieProps, 'Lottie'>,
  Icon: true satisfies Agrees<IconProps, 'Icon'>,
  Button: true satisfies Agrees<ButtonProps, 'Button'>,
  LinkCard: true satisfies Agrees<LinkCardProps, 'LinkCard'>,
  Download: true satisfies Agrees<DownloadProps, 'Download'>,
  QR: true satisfies Agrees<QRProps, 'QR'>,
  Live: true satisfies Agrees<LiveProps, 'Live'>,
  AppFrame: true satisfies Agrees<AppFrameProps, 'AppFrame'>,
  Step: true satisfies Agrees<StepProps, 'Step'>,
  Notes: true satisfies Agrees<NotesProps, 'Notes'>,
};

/**
 * The components the engine passes to every slide itself, which the catalog describes too.
 */
const ENGINE_COMPONENTS = ['Notes'];

describe('the component catalog', () => {
  it('describes every component the kit registers apart from charts and diagrams, and no other', () => {
    const registered = Object.keys(kit.components ?? {}).filter(
      (name) =>
        !(name in CHART_COMPONENTS) && !(name in DIAGRAM_COMPONENTS) && /^[A-Z]/u.test(name),
    );
    expect(Object.keys(kit.components ?? {})).toContain('a');
    expect(COMPONENT_INFOS.map((info) => info.name).toSorted()).toEqual(
      [...registered, ...ENGINE_COMPONENTS].toSorted(),
    );
  });

  it('agrees with every component props type, which the compiler checks for each entry', () => {
    expect(Object.keys(AGREE).toSorted()).toEqual(
      COMPONENT_INFOS.map((info) => info.name).toSorted(),
    );
  });

  it('gives every component a use, an example that uses its tag, and described props', () => {
    for (const info of COMPONENT_INFOS) {
      expect(info.useWhen.length, info.name).toBeGreaterThan(20);
      expect(info.example, info.name).toMatch(info.name === 'Code' ? /^```/u : `<${info.name}`);
      for (const [name, spec] of Object.entries(info.props)) {
        expect(spec.description.length, `${info.name}.${name}`).toBeGreaterThan(5);
      }
    }
  });

  it('prints the components and how they behave', () => {
    const catalog = componentCatalog();
    expect(catalog.components).toEqual(COMPONENT_INFOS.map((info) => ({ ...info, shared: [] })));
    expect(catalog.shared).toEqual({});
    expect(catalog.insight['props']).toContain('closest');
  });
});

describe('checking the props of a component', () => {
  it('names the prop a misspelt or borrowed one most likely means', () => {
    expect(propsProblem({ name: 'Download', given: ['href'], checkRequired: false })).toContain(
      'Did you mean `file`?',
    );
    expect(
      propsProblem({ name: 'Image', given: ['src', 'alt', 'fokal'], checkRequired: true }),
    ).toContain('Did you mean `focal`?');
  });

  it('names a required prop that is left out, and lets data attributes through', () => {
    expect(propsProblem({ name: 'Video', given: ['src', 'alt'], checkRequired: true })).toContain(
      '`poster`',
    );
    expect(
      propsProblem({
        name: 'Image',
        given: ['src', 'alt', 'data-deck-source'],
        checkRequired: true,
      }),
    ).toBeUndefined();
    expect(propsProblem({ name: 'NotAKitComponent', given: ['x'], checkRequired: true })).toBe(
      undefined,
    );
  });

  it('refuses <Download href> with the prop it means, instead of crashing the slide', () => {
    const props = { href: 'talk.pdf', children: 'Slides' } as unknown as Parameters<
      typeof Download
    >[0];
    expect(() => renderToStaticMarkup(<Download {...props} />)).toThrow(
      /`href` is not a prop of <Download>\. Did you mean `file`\?/,
    );
    expect(() => checkComponentProps('Button', { children: 'Go' })).toThrow(/needs `href`/);
  });

  it('refuses a <Step> without at, in MDX and at render, the way the engine does', () => {
    expect(propsProblem({ name: 'Step', given: [], checkRequired: true })).toContain(
      '<Step> needs `at`',
    );
    expect(propsProblem({ name: 'Step', given: ['at'], checkRequired: true })).toBeUndefined();
    expect(() => checkComponentProps('Step', { children: 'Always' })).toThrow(/needs `at`/);
  });
});
