import {
  RADIUS_NAMES,
  REGION_ALIGNS,
  REGION_ANCHORS,
  ROLE_NAMES,
  SHADOW_NAMES,
  SPACE_NAMES,
  STROKE_NAMES,
  TYPE_STEPS,
} from '@deckster/brand';

import { DEFAULT_STEP_EFFECT, STEP_EFFECTS } from '#motion/step-effects.ts';
import { PLACED_NAMES, PLACED_ZONES, SHAPE_GEOMETRIES } from '#place/resolve-place.ts';

/**
 * One prop of a component, as `deckster components --json` prints it.
 */
export type ComponentPropInfo = {
  /**
   * The TypeScript type, in short.
   */
  type: string;

  /**
   * Whether a slide must set it.
   */
  required: boolean;

  /**
   * The value when left out, or `null` when it has none.
   */
  default: unknown;

  /**
   * What it does, as a sentence.
   */
  description: string;
};

/**
 * What a group of components is for.
 */
export type ComponentKind =
  | 'code'
  | 'media'
  | 'icon'
  | 'link'
  | 'app'
  | 'motion'
  | 'place'
  | 'notes';

/**
 * One MDX component, as `deckster components --json` prints it.
 */
export type ComponentInfo = {
  /**
   * The MDX tag.
   */
  name: string;

  /**
   * What it is for: code, media, icon, link, app, motion, place or notes.
   */
  kind: ComponentKind;

  /**
   * When to reach for it, in one line.
   */
  useWhen: string;

  /**
   * When not to use it, and what to use instead.
   */
  avoid: string;

  /**
   * Its props, by name. A name that is not here is refused with the closest one, at build time in
   * MDX and when the slide renders in TSX; a required prop that is missing is refused too.
   */
  props: Readonly<Record<string, ComponentPropInfo>>;

  /**
   * A minimal MDX example.
   */
  example: string;
};

/**
 * One component as `deckster components --json` prints it: its entry with the names of the shared
 * props it takes, which is none, so the entry has the shape `deckster charts` and `deckster
 * diagrams` give theirs.
 */
export type ComponentCatalogEntry = ComponentInfo & {
  /**
   * The shared props it takes, by name; always empty, as no props are shared between components.
   */
  shared: readonly string[];
};

/**
 * What `deckster components --json` prints.
 */
export type ComponentCatalog = {
  /**
   * The props several components share, described once by name, as in `deckster charts` and `deck
   * diagrams`; empty, since each component lists all of its props.
   */
  shared: Readonly<Record<string, ComponentPropInfo>>;

  /**
   * Every component, in catalog order.
   */
  components: readonly ComponentCatalogEntry[];

  /**
   * How the components behave as a group: props, steps, static mode, files.
   */
  insight: Readonly<Record<string, string>>;
};

/**
 * A prop description: its type, whether it is required, its default and what it does.
 *
 * @param type - The TypeScript type, in short.
 * @param required - Whether a slide must set it.
 * @param fallback - The value when left out, or `null`.
 * @param description - What it does.
 */
function prop<Required extends boolean>(
  type: string,
  required: Required,
  fallback: unknown,
  description: string,
): ComponentPropInfo & { required: Required } {
  return { type, required, default: fallback, description };
}

/**
 * A component's prop descriptions, kept with their literal names and `required` flags, so the
 * catalog test can hold them to each component's props type at compile time.
 *
 * @param described - The descriptions, by prop name.
 */
function props<const Described extends Readonly<Record<string, ComponentPropInfo>>>(
  described: Described,
): Described {
  return described;
}

/**
 * The text a component takes between its tags.
 */
const CHILDREN = (description: string): ComponentPropInfo & { required: false } =>
  prop('ReactNode', false, null, description);

/**
 * The `steps` the highlight string of a code block takes.
 */
const HIGHLIGHT_TYPE = 'string | string[] | Record<number, string>';

/**
 * The `file` prop code blocks share: the name in their title bar.
 */
const FILE_PROP = prop('string', false, null, 'The file name in the title bar.');

/**
 * The `label` prop code blocks share: the language label, which defaults to the language's name.
 */
const LANGUAGE_LABEL_PROP = prop(
  'string | false',
  false,
  'the language name',
  'The language label in the title bar; false hides it.',
);

/**
 * The `variant` prop buttons share: filled, or outlined.
 */
const VARIANT_PROP = prop(
  "'solid' | 'outline'",
  false,
  'solid',
  'Filled with the accent, or a ring.',
);

/**
 * The `fit` prop images and videos share: crop to fill, or show all of it.
 */
const FIT_PROP = prop("'cover' | 'contain'", false, 'cover', 'Crop to fill, or show all of it.');

/**
 * The `focal` prop images and videos share: the point cropping keeps in view.
 */
const FOCAL_PROP = prop(
  'string | [number, number]',
  false,
  'center',
  'The point cropping keeps in view.',
);

/**
 * The `ratio` prop media shares: the frame's width over its height.
 */
const RATIO_PROP = prop('number', false, null, "The frame's width over height.");

/**
 * The `loop` prop videos and animations share: play again from the start when they end.
 */
const LOOP_PROP = prop('boolean', false, false, 'Play again from the start when it ends.');

/**
 * Placement and reveal props shared by `<Place>`, `<Shape>` and `<Text>`.
 */
const PLACEMENT_PROPS = props({
  place: prop(
    PLACED_NAMES.map((name) => `'${name}'`).join(' | '),
    false,
    null,
    'Named anchor position within the zone (mutually exclusive with `cols`/`rows` and `box`).',
  ),
  cols: prop(
    'string',
    false,
    null,
    'Inclusive 1-based column range on the brand grid, such as "9-12" or "4".',
  ),
  rows: prop(
    'string',
    false,
    null,
    'Inclusive 1-based row range on the brand grid, such as "1-2" or "5".',
  ),
  box: prop(
    '[number, number, number, number]',
    false,
    null,
    'Explicit canvas-pixel box [x, y, width, height]; escape hatch for imported templates.',
  ),
  zone: prop(
    PLACED_ZONES.map((zone) => `'${zone}'`).join(' | '),
    false,
    'safe',
    'Slide frame the placement is measured in: safe, canvas, header or footer.',
  ),
  width: prop(
    "number | 'sm' | 'md' | 'lg'",
    false,
    null,
    'Width in grid columns or a named size token (sm=3, md=4, lg=6); content-sized when omitted.',
  ),
  height: prop(
    'number',
    false,
    null,
    'Fixed height in grid rows; follows content up to the zone height when omitted.',
  ),
  inset: prop(
    SPACE_NAMES.map((space) => `'${space}'`).join(' | '),
    false,
    null,
    'Brand spacing token pulling a named placement inward from its zone edge.',
  ),
  name: prop(
    'string',
    false,
    null,
    'Optional name for the element in PowerPoint export and diagnostics.',
  ),
  at: prop(
    'number',
    false,
    null,
    'Step index (1 or more) that reveals this element; animates with the slide entrance when omitted.',
  ),
  effect: prop(
    STEP_EFFECTS.map((effect) => `'${effect}'`).join(' | '),
    false,
    DEFAULT_STEP_EFFECT,
    'Step reveal effect when `at` is set: rise, fade, scale, blur or wipe.',
  ),
});

/**
 * Typography and alignment props shared by `<Shape>` and `<Text>`.
 */
const PLACED_TEXT_PROPS = props({
  type: prop(
    TYPE_STEPS.map((step) => `'${step}'`).join(' | '),
    false,
    'body',
    'Brand type step for text inside the element.',
  ),
  align: prop(
    REGION_ALIGNS.map((align) => `'${align}'`).join(' | '),
    false,
    null,
    'Horizontal text alignment: start, center or end.',
  ),
  anchor: prop(
    REGION_ANCHORS.map((anchor) => `'${anchor}'`).join(' | '),
    false,
    null,
    'Vertical text placement inside the box: start, center or end.',
  ),
  color: prop(
    ROLE_NAMES.map((role) => `'${role}'`).join(' | '),
    false,
    null,
    'Brand color role for text inside the element.',
  ),
});

/**
 * Every MDX component the kit registers, apart from charts (`deckster charts`) and diagrams (`deck
 * diagrams`), with its props.
 */
export const COMPONENT_INFOS = [
  {
    name: 'Code',
    kind: 'code',
    useWhen:
      'A block of code in a slide; a fence (```ts title="a.ts" {2-4|7} lineNumbers diff /word/) is the usual way to write one.',
    avoid:
      'More than 11 lines, or 60 columns beside notes (90 without): cut it or split the slide.',
    props: props({
      code: prop('string', false, null, 'The source; a literal is highlighted at build time.'),
      children: prop('string', false, null, "The source as the tag's child, instead of `code`."),
      lang: prop('string', false, 'text', 'The language id, such as ts, tsx, bash or json.'),
      data: prop(
        'string',
        false,
        null,
        'The block highlighted at build time; the build writes it.',
      ),
      file: FILE_PROP,
      label: LANGUAGE_LABEL_PROP,
      lineNumbers: prop('boolean', false, false, 'Show line numbers.'),
      start: prop('number', false, 1, 'The number of the first line.'),
      highlight: prop(
        HIGHLIGHT_TYPE,
        false,
        null,
        "Lines to focus, by step: '2-4|7', a list, or { 1: '2-4' }. Each entry is " +
          'a step; a step that names no line of the block is reported as ' +
          'code-step-range.',
      ),
      at: prop('number', false, 1, 'The step of the first highlight entry.'),
      dim: prop('boolean', false, true, 'Whether lines outside the focus fade back.'),
      diff: prop(
        'boolean',
        false,
        false,
        'Read a leading + or - as an added or removed line, tinted with the surface diff colors.',
      ),
      words: prop(
        'string[]',
        false,
        null,
        'Words to mark wherever they occur as whole words (`step` does not mark `steps`).',
      ),
    }),
    example:
      '```ts title="server.ts" {2|3-4} lineNumbers\nconst app = createApp();\napp.use(cors());\n```',
  },
  {
    name: 'CodeMove',
    kind: 'code',
    useWhen:
      'Code that changes between versions: tokens glide from each state to the next, one per step.',
    avoid: 'Unrelated snippets; use separate slides. More than four states loses the room.',
    props: props({
      data: prop(
        'string',
        false,
        null,
        'The states highlighted at build time; the build writes it.',
      ),
      steps: prop(
        '(string | { code, lang })[]',
        false,
        null,
        'The states, for TSX slides; highlighted in the browser.',
      ),
      children: CHILDREN('The states: a fence or a <CodeStep> per state.'),
      lang: prop('string', false, null, 'The language of every state that names none.'),
      file: FILE_PROP,
      label: LANGUAGE_LABEL_PROP,
      at: prop('number', false, 1, 'The step at which the second state appears.'),
    }),
    example:
      '<CodeMove file="a.ts">\n\n```ts\nlet a = 1;\n```\n\n```ts\nconst a = 1;\n```\n\n</CodeMove>',
  },
  {
    name: 'CodeStep',
    kind: 'code',
    useWhen: 'One state of a <CodeMove>, when a fence will not do (a different language).',
    avoid: 'Anywhere outside a <CodeMove>.',
    props: props({
      code: prop('string', false, null, 'The code of this state.'),
      children: CHILDREN('The code of this state, as a fence or a string.'),
      lang: prop('string', false, null, "The state's language, when it differs."),
    }),
    example:
      '<CodeMove>\n<CodeStep lang="js">{`a()`}</CodeStep>\n<CodeStep lang="ts">{`a(1)`}</CodeStep>\n</CodeMove>',
  },
  {
    name: 'Terminal',
    kind: 'code',
    useWhen:
      "A shell session typed live: each <Cmd> adds one step (there is no `at` on a <Cmd>): the first is typed at the <Terminal>'s `at`, the next at `at` + 1, and so on, and each command's <Out> lines appear once it is typed. With the default `at={1}` step 0 shows only the prompt and a waiting cursor; `<Out>` written before the first <Cmd> shows from step 0, and `at={0}` types the first command on arrival.",
    avoid: 'Long logs; show the two lines that matter.',
    props: props({
      children: CHILDREN('The session: <Cmd> and <Out> elements in order.'),
      title: prop('string', false, 'Terminal', 'The title in the window bar.'),
      prompt: prop('string', false, '$', 'The prompt before each command.'),
      at: prop(
        'number',
        false,
        1,
        'The step at which the first command is typed; each further <Cmd> is ' +
          'typed one step later. At 1 the terminal arrives showing only the prompt ' +
          'and cursor.',
      ),
    }),
    example:
      '<Terminal title="~/app">\n  <Cmd>pnpm test</Cmd>\n  <Out tone="success">64 passed</Out>\n</Terminal>',
  },
  {
    name: 'Cmd',
    kind: 'code',
    useWhen:
      'A command in a <Terminal>, kept exactly as written: URLs and *stars* stay text. Each one adds a step, in order; it takes no `at` of its own.',
    avoid: 'Anywhere outside a <Terminal>.',
    props: props({
      children: CHILDREN('The command as typed after the prompt.'),
      text: prop(
        'string',
        false,
        null,
        "The command as a string; the build sets it from the tag's text.",
      ),
    }),
    example: '<Cmd>curl -s https://api.example.com/v1/items?limit=100 | jq</Cmd>',
  },
  {
    name: 'Out',
    kind: 'code',
    useWhen: 'A line of output in a <Terminal>, shown once the command before it is typed.',
    avoid: 'Anywhere outside a <Terminal>.',
    props: props({
      children: CHILDREN('The output line.'),
      text: prop(
        'string',
        false,
        null,
        "The line as a string; the build sets it from the tag's text.",
      ),
      tone: prop(
        "'plain' | 'muted' | 'success' | 'warning' | 'error'",
        false,
        'plain',
        'The color of the line; error sets it on the removed-line tint. Another ' +
          'value is a terminal-tone warning.',
      ),
    }),
    example: '<Out tone="muted">built in 1.4 s</Out>',
  },
  {
    name: 'Image',
    kind: 'media',
    useWhen:
      "A photo or picture with the brand's treatment, cropped to its frame; a markdown image alone in its paragraph becomes one.",
    avoid: 'GIFs: the build converts a local GIF to video when ffmpeg is installed.',
    props: props({
      src: prop(
        'string',
        true,
        null,
        'The file, relative to the slide; a missing file is media-missing.',
      ),
      alt: prop('string', true, null, "What the image shows; '' only for decoration."),
      treatment: prop(
        'string',
        false,
        "the slide's treatment, else the brand default",
        "A treatment from the brand's imagery; `plain`, which every brand has, shows the image " +
          'as it is (a screenshot, a map). An unknown name is a treatment-unknown warning.',
      ),
      fit: FIT_PROP,
      focal: FOCAL_PROP,
      ratio: prop(
        'number',
        false,
        null,
        "The frame's width over height. The figure keeps that shape (a media frame fits the " +
          'largest such box), so corners, a tint and a <Morph> hold it.',
      ),
      caption: prop('ReactNode', false, null, 'A caption under the image.'),
    }),
    example: '<Image src="../assets/street.jpg" alt="A street under maple trees" focal="top" />',
  },
  {
    name: 'Video',
    kind: 'media',
    useWhen:
      'Motion: plays on its slide, pauses when the deck leaves, and can be cut into parts by ' +
      'steps. Inside a <Step> it starts from the top when the step reveals it.',
    avoid: 'Sound the room must hear without a caption. Use WebM, not MP4.',
    props: props({
      src: prop('string', true, null, 'The video file (WebM).'),
      poster: prop('string', true, null, 'The still static mode, shots and exports show.'),
      posters: prop(
        'string[]',
        false,
        null,
        'One still per part of a cued video, so static mode and `deckster shot ' +
          '--steps` show each part; without them every step shows `poster`, which ' +
          '`deckster lint` reports as video-cue-posters.',
      ),
      alt: prop('string', true, null, 'What the video shows.'),
      loop: LOOP_PROP,
      muted: prop('boolean', false, true, 'Keep the sound off.'),
      autoPlay: prop('boolean', false, true, 'Start playing when the slide appears.'),
      controls: prop('boolean', false, false, "Show the browser's controls."),
      cues: prop(
        'number[]',
        false,
        null,
        'Times in seconds that cut the video into parts played step by step; ' +
          'stepping back plays a part again from its start.',
      ),
      at: prop('number', false, 1, 'The step of the second cue.'),
      fit: FIT_PROP,
      focal: FOCAL_PROP,
      ratio: RATIO_PROP,
      caption: prop('ReactNode', false, null, 'A caption under the video.'),
    }),
    example:
      '<Video src="../assets/demo.webm" poster="../assets/demo.jpg" alt="The deploy, start to finish" cues={[0, 3, 6]} />',
  },
  {
    name: 'Lottie',
    kind: 'media',
    useWhen:
      'A small vector animation, such as a check mark drawing itself. Inside a <Step> it plays ' +
      'when the step reveals it, so the room sees it draw.',
    avoid: 'Long or busy animations; they pull the eye from the speaker.',
    props: props({
      src: prop('string', true, null, 'The Lottie JSON file.'),
      alt: prop('string', true, null, 'What the animation shows.'),
      loop: LOOP_PROP,
      frame: prop("number | 'first' | 'last'", false, 'last', 'The frame static mode shows.'),
      ratio: RATIO_PROP,
      size: prop("'sm' | 'md' | 'lg' | 'full'", false, 'full', 'How wide the animation is.'),
      role: prop('string', false, null, 'Draw every stroke and fill in this color role.'),
    }),
    example: '<Lottie src="../assets/check.json" alt="A check mark" size="md" role="fg" />',
  },
  {
    name: 'Icon',
    kind: 'icon',
    useWhen: "An icon from the brand's icon set, at the size of the text around it.",
    avoid: 'Names only one set has; use names both brands share.',
    props: props({
      name: prop('string', false, null, "The icon's name in the brand's set, or set:name."),
      icon: prop('ComponentType', false, null, 'An icon component, for TSX slides.'),
      size: prop('string', false, 'body', 'The type step whose size it takes.'),
      role: prop('string', false, 'the text color', 'The color role of the surface.'),
      label: prop('string', false, null, 'A text alternative; without it the icon is decorative.'),
    }),
    example: '<Icon name="rocket" role="accent" />',
  },
  {
    name: 'Button',
    kind: 'link',
    useWhen: 'A call to action that opens a link; external links open in a new tab.',
    avoid: 'Links in running text; write a markdown link instead.',
    props: props({
      href: prop(
        'string',
        true,
        null,
        'Where it goes: http(s), mailto or tel, a path or a #fragment; ' +
          'javascript: and other schemes are refused.',
      ),
      variant: VARIANT_PROP,
      children: prop('ReactNode', true, null, 'The label.'),
    }),
    example: '<Button href="https://example.com/signup">Try it</Button>',
  },
  {
    name: 'LinkCard',
    kind: 'link',
    useWhen: 'A link worth a card: a title, a sentence and the readable URL.',
    avoid: 'More than three on a slide.',
    props: props({
      href: prop('string', true, null, 'Where the card goes; the same schemes as Button.'),
      title: prop('string', true, null, 'What the link is.'),
      description: prop('string', false, null, 'A sentence about it.'),
      icon: prop('ReactNode', false, null, 'An icon or logo at the start of the card.'),
    }),
    example: '<LinkCard href="https://github.com/acme/api" title="The repository" />',
  },
  {
    name: 'Download',
    kind: 'link',
    useWhen:
      "A button that downloads one of the deck's exports, built with `deckster build --with-exports`.",
    avoid: 'Files the build does not write; link to them with Button.',
    props: props({
      file: prop('string', true, null, 'The file, relative to the built deck, such as talk.pdf.'),
      variant: VARIANT_PROP,
      children: prop('ReactNode', true, null, 'The label.'),
    }),
    example: '<Download file="talk.pdf">Download the slides (PDF)</Download>',
  },
  {
    name: 'QR',
    kind: 'link',
    useWhen: 'A link the room should open on their phones.',
    avoid: 'Long URLs; shorten them first.',
    props: props({
      value: prop('string', true, null, 'What the code opens, usually a URL.'),
      size: prop('number', false, 300, 'Width and height on the canvas, in pixels.'),
      caption: prop('boolean', false, true, 'Print the readable URL beneath the code.'),
    }),
    example: '<QR value="https://example.com/slides" />',
  },
  {
    name: 'Live',
    kind: 'app',
    useWhen: 'A small React widget running inline on the slide, such as a counter or a slider.',
    avoid: 'Anything with its own styles or globals; make it a mini app (AppFrame).',
    props: props({
      component: prop('ComponentType', false, null, 'The component to host; or give children.'),
      props: prop('object', false, null, 'The props passed to component.'),
      children: CHILDREN('The widget as JSX, instead of component.'),
      poster: prop(
        'string | ({ step }) => ReactNode',
        false,
        null,
        'What static mode and exports show.',
      ),
      alt: prop('string', false, '', "The poster image's alt text."),
      mount: prop("'adjacent' | 'active'", false, 'adjacent', 'When the widget mounts.'),
      label: prop('string', false, null, 'What the region is called to assistive technology.'),
    }),
    example: '<Live component={Counter} poster="../assets/counter.png" alt="The counter at 3" />',
  },
  {
    name: 'AppFrame',
    kind: 'app',
    useWhen:
      'A mini app (decks/<deck>/apps/<name>/, `deckster new app`) or an external page in a sandboxed frame, with the brand and the steps.',
    avoid: 'An external page without fallback=: the venue Wi-Fi decides whether it shows.',
    props: props({
      app: prop(
        'string',
        false,
        null,
        'The app folder under apps/; a name the deck does not have fails the ' +
          'build (app-missing in lint for a computed name).',
      ),
      src: prop('string', false, null, 'A URL or path to load instead of app.'),
      poster: prop(
        'string | ({ step }) => ReactNode',
        true,
        null,
        'What static mode, exports and offline runs show.',
      ),
      alt: prop('string', false, '', 'What the app shows; the frame title.'),
      fallback: prop(
        'string',
        false,
        null,
        'A recorded video played when the browser is offline, the host does not ' +
          'answer or the app fails; the presenter switches to it and back with the ' +
          'Recording control or the v key.',
      ),
      chrome: prop("'none' | 'browser' | 'window'", false, 'none', "The frame's dressing."),
      title: prop('string', false, 'the app name or host', 'The text in the address or title bar.'),
      steps: prop('number', false, 0, 'The slide steps the app owns in static mode.'),
      mount: prop("'adjacent' | 'active'", false, 'adjacent', 'When the frame loads.'),
      keepAlive: prop('boolean', false, false, 'Keep the app mounted after its slide leaves.'),
      bridge: prop('boolean', false, false, 'Turn the bridge on for an external src.'),
      sandbox: prop('string[]', false, null, "Tokens to add to the iframe's sandbox."),
      allow: prop('string[]', false, null, "Features to add to the iframe's allow."),
      readyTimeout: prop('number', false, 8000, 'Milliseconds to wait for the app to be ready.'),
      onResize: prop('(size) => void', false, null, 'Called with the size an app asks for.'),
    }),
    example:
      '<AppFrame app="agent-demo" poster="../assets/agent.png" alt="An agent run" chrome="window" />',
  },
  {
    name: 'CommandDemo',
    kind: 'app',
    useWhen: 'A keyboard command opens data. Show the workspace, choice and executed result.',
    avoid: 'A live application that needs authenticated state or external data.',
    props: {
      workspace: prop('string', true, null, 'The workspace name shown in the chrome.'),
      context: prop('string', true, null, 'What the workspace shows before opening the palette.'),
      commands: prop(
        'object[]',
        true,
        null,
        'Supply commands with name, result and rows. The first command is the scripted example.',
      ),
      reveal: prop('boolean', false, true, 'Use two deck advances for the palette and result.'),
    },
    example:
      '<CommandDemo workspace="Dispatch" context="Ready" commands={[{name:"List drops",result:"One waiting",rows:[{label:"WQ-214",detail:"Due by 09:35"}]}]} />',
  },
  {
    name: 'GroundedAnswer',
    kind: 'app',
    useWhen: 'An answer cites specific source text, and readers can check the exact passage.',
    avoid: 'An answer without an authored source or an explicit citation.',
    props: {
      question: prop('string', true, null, 'The question submitted to the assistant.'),
      answer: prop('string', true, null, 'The concise answer the evidence supports.'),
      sourceTitle: prop('string', true, null, 'The name of the document or brief.'),
      reference: prop('string', true, null, 'The location of the evidence inside the source.'),
      context: prop('string', true, null, 'Relevant words before the supporting passage.'),
      evidence: prop('string', true, null, 'The exact words that the citation points to.'),
      reveal: prop('boolean', false, true, 'Use two deck advances for the answer and evidence.'),
    },
    example:
      '<GroundedAnswer sourceTitle="Dispatch rules" reference="Guide §3" context="Check each parcel." evidence="The bike limit is 25 kg." question="Will 28 kg fit?" answer="No. It exceeds the limit." />',
  },
  {
    name: 'ReviewDiff',
    kind: 'app',
    useWhen: 'A human reviews one exact change proposed by an assistant.',
    avoid: 'A code patch with many changed lines, which belongs in a diff fence.',
    props: {
      document: prop('string', true, null, 'The file, document or record being reviewed.'),
      before: prop('string', true, null, 'Unchanged words preceding the proposed edit.'),
      original: prop('string', true, null, 'The exact words the assistant proposes removing.'),
      suggestion: prop('string', true, null, 'The exact words the assistant proposes inserting.'),
      after: prop('string', true, null, 'Unchanged text following the proposed edit.'),
      rationale: prop('string', true, null, 'The reason for the suggested change.'),
      reveal: prop(
        'boolean',
        false,
        true,
        'Use two advances to show the proposed edit, then approval.',
      ),
    },
    example:
      '<ReviewDiff document="Draft" before="Arrives " original="soon" suggestion="by 09:35" after="." rationale="Use the committed time." />',
  },
  {
    name: 'RunTrace',
    kind: 'app',
    useWhen: 'An assistant makes two observable tool calls, then stops for a person to act.',
    avoid: 'A technical trace with more than two calls, which belongs in a sequence diagram.',
    props: {
      instruction: prop('string', true, null, 'The task the person gave to the assistant.'),
      calls: prop(
        'object[]',
        true,
        null,
        'Exactly two calls, each with its tool, input and observation.',
      ),
      checkpoint: prop(
        'string',
        true,
        null,
        'The human judgment needed before an external operation.',
      ),
      outcome: prop('string', true, null, 'What the run prepared before that checkpoint.'),
      reveal: prop('boolean', false, true, 'Use three advances for the calls then the checkpoint.'),
    },
    example:
      '<RunTrace instruction="Draft an update." calls={[{tool:"lookup_drop",input:"WQ-214",observation:"Due by 09:35"},{tool:"read_eta",input:"Loop 17",observation:"ETA 09:21"}]} checkpoint="Approval required" outcome="Draft ready." />',
  },
  {
    name: 'Step',
    kind: 'motion',
    useWhen:
      'Segment an explanation: reveal the part the speaker is about to talk about at a later ' +
      'step; it keeps its space while hidden. Give each step of a run you walk through (points, ' +
      'cards) `focus`, so the one just revealed is at full strength and earlier ones recede to ' +
      'the muted color: that signals where to look.',
    avoid:
      'Revealing every bullet one by one by habit, or for experts, who read faster than you ' +
      'reveal: reveal what the speaker builds on. Do not mix effects for variety; keep the ' +
      'default and pick another only when it carries meaning (wipe for a line read left to ' +
      'right, scale for a card that arrives). Charts and diagrams take their own `at`.',
    props: props({
      at: prop(
        'number',
        true,
        null,
        'The step that reveals the children, an integer of 1 or more; a bare <Step> is refused.',
      ),
      effect: prop(
        STEP_EFFECTS.map((effect) => `'${effect}'`).join(' | '),
        false,
        DEFAULT_STEP_EFFECT,
        'How the content comes in: rise (fade and rise), fade, scale (fade in from slightly ' +
          'smaller, growing from the middle of the text or picture, wherever it is aligned), ' +
          'blur (fade in from out of focus) or wipe (uncovered from the start edge across the ' +
          'content, list markers fading in with it). Each acts on the blocks directly inside the ' +
          'step: write the content on its own lines with blank lines inside the <Step>. Words ' +
          'inside a sentence fade, blur or wipe, but cannot rise or scale, which only fade there. ' +
          "Blur keeps the treatment of the kit's <Image>, <Video> and <Lottie>; a raw element " +
          'whose own `style` sets a filter keeps that filter and is not blurred. ' +
          "Durations and easings are the brand's. " +
          'Static mode and exports show the end state, reduced motion turns every effect into a ' +
          'fade, and a PPTX export into a fade on click.',
      ),
      focus: prop(
        'boolean',
        false,
        false,
        "Recede the content to the brand's muted color once a later step of the slide is " +
          'reached, so the latest step stands out. It changes color, never opacity, so receded ' +
          'text keeps its contrast. Static mode and exports show every revealed step at full ' +
          'strength.',
      ),
      children: CHILDREN('The content to reveal.'),
    }),
    example:
      '<Step at={1} focus>\n\n- **Eastgate:** 14 residents\n\n</Step>\n\n' +
      '<Step at={2} focus>\n\n- **Riverside:** 2 residents\n\n</Step>\n\n' +
      '<Step at={3} effect="wipe">\n\nSeven times the shade for each tree.\n\n</Step>',
  },
  {
    name: 'Morph',
    kind: 'motion',
    useWhen:
      'Carry one element across two consecutive slides: the photo that moves from one side to ' +
      'the other, the logo that shrinks into a corner, an icon or a short heading that changes ' +
      'place. Wrap it in a <Morph> with the same id on both slides and it flies to its new place ' +
      'and size instead of cross-fading with the rest.',
    avoid:
      'Morphing everything: one or two elements per move keep the eye on what carries over. ' +
      'Morphs play only between neighbouring slides; give each id once per slide. The box of ' +
      'the wrapped element flies, so a chart or number figure that fills its whole region flies ' +
      'as that region; morph something whose box is its own size. For a reveal within one slide ' +
      'use <Step>.',
    props: props({
      id: prop(
        'string',
        true,
        null,
        'The name shared with the matching <Morph> on the neighbouring slide; unique on the ' +
          'slide. It flies over the brand transition while the slides run their own. Static ' +
          'mode, exports and reduced motion show no morph.',
      ),
      children: CHILDREN(
        'What flies: one element, such as a picture, a logo, an icon or a heading. Only the ' +
          'first element flies; the wrapper itself has no box.',
      ),
    }),
    example: '<Morph id="logo">\n  <Icon name="trees" role="accent" />\n</Morph>',
  },
  {
    name: 'Place',
    kind: 'place',
    useWhen:
      'Position an icon, badge, image, QR code, button, SVG or short Markdown list outside a layout slot (for example a confidential footer mark or a callout beside a chart).',
    avoid:
      'Building a multi-column slide by hand: pick a layout instead. Keep to at most four placed elements per slide and at most 25 words per element.',
    props: props({
      ...PLACEMENT_PROPS,
      children: CHILDREN(
        'Any Markdown block, bullet list or kit component (<Icon>, <Image>, <QR>, <Button>, <Svg>) to place.',
      ),
    }),
    example:
      '<Place place="bottom-left" zone="footer">\n  <Icon name="lock" /> Confidential\n</Place>',
  },
  {
    name: 'Shape',
    kind: 'place',
    useWhen:
      'Draw a token-styled geometric callout, badge, stamp or accent box (rect, square, ellipse, circle, pill, diamond or triangle) with optional fitted text or Markdown lists. Omit placement props to render it inline in normal flow.',
    avoid:
      'Large boxes covering more than 35% of the safe area or replacing a slide layout. Prefer `surface` over raw `fill` so text contrast is checked by the brand.',
    props: props({
      ...PLACEMENT_PROPS,
      shape: prop(
        SHAPE_GEOMETRIES.map((geometry) => `'${geometry}'`).join(' | '),
        false,
        'rect',
        'Geometric shape; `square` and `circle` lock a 1:1 aspect ratio.',
      ),
      surface: prop(
        'string',
        false,
        null,
        'Brand surface (`default`, `inverse`, `accent`, `gradient` or custom) that re-themes fill and text colors with checked contrast.',
      ),
      fill: prop(
        `'none' | ${ROLE_NAMES.map((role) => `'${role}'`).join(' | ')}`,
        false,
        null,
        'Fill color role on the current surface, or `none` for transparent.',
      ),
      border: prop(
        ROLE_NAMES.map((role) => `'${role}'`).join(' | '),
        false,
        null,
        'Border color role on the current surface.',
      ),
      stroke: prop(
        STROKE_NAMES.map((stroke) => `'${stroke}'`).join(' | '),
        false,
        'regular',
        'Border width token when `border` is set.',
      ),
      radius: prop(
        `'none' | ${RADIUS_NAMES.map((radius) => `'${radius}'`).join(' | ')} | 'full'`,
        false,
        'none',
        'Corner radius token; ignored on ellipse, circle, diamond and triangle.',
      ),
      shadow: prop(
        `'none' | ${SHADOW_NAMES.map((shadow) => `'${shadow}'`).join(' | ')}`,
        false,
        'none',
        'Drop shadow token from the active surface.',
      ),
      padding: prop(
        SPACE_NAMES.map((space) => `'${space}'`).join(' | '),
        false,
        'md',
        'Inner spacing token from the brand scale.',
      ),
      ...PLACED_TEXT_PROPS,
      children: CHILDREN('Optional text, Markdown paragraphs or bullet lists inside the shape.'),
    }),
    example:
      '<Shape place="top-right" width={4} surface="accent" radius="md">\n  New in 0.9\n</Shape>',
  },
  {
    name: 'Text',
    kind: 'place',
    useWhen:
      'Place unboxed floating text directly on the slide: footer sources, corner labels, stamps or standalone callout figures without fill or border chrome. Omit placement props to render it inline.',
    avoid:
      'Main slide prose or titles; those belong in the layout slots and frontmatter. Keep placed text brief (25 words or fewer).',
    props: props({
      ...PLACEMENT_PROPS,
      ...PLACED_TEXT_PROPS,
      children: CHILDREN('Text, inline Markdown or short lists to render without box chrome.'),
    }),
    example:
      '<Text place="bottom-right" zone="footer" type="caption" color="muted">\n  Source: Q3 customer survey, n = 412\n</Text>',
  },
  {
    name: 'Notes',
    kind: 'notes',
    useWhen: 'Speaker notes: what the slide proves and what to say. Every slide has them.',
    avoid: 'Text the audience must read; that belongs on the slide.',
    props: props({
      children: CHILDREN('The notes, in markdown.'),
    }),
    example: '<Notes>\nSay what the slide proves in a sentence.\n</Notes>',
  },
] as const satisfies readonly ComponentInfo[];

/**
 * Props every component accepts besides its own: `data-*` attributes (the dev server's source
 * stamps) and `key`.
 */
export function isPassThroughProp(name: string): boolean {
  return name.startsWith('data-') || name === 'key';
}

/**
 * The catalog `deckster components --json` prints.
 */
export function componentCatalog(): ComponentCatalog {
  return {
    shared: {},
    components: COMPONENT_INFOS.map((info) => ({ ...info, shared: [] })),
    insight: {
      props:
        'Each component takes the props its catalog entry lists; another name is ' +
        'refused with the closest one ("`href` is not a prop of Download; did you ' +
        'mean `file`?"), at build time in MDX and when the slide renders in TSX. ' +
        'A missing required prop is refused the same way.',
      files:
        'Paths to images, video, posters and Lottie files are relative to the ' +
        'slide and become imports; a missing one is reported by `deckster lint` as ' +
        'media-missing. A markdown image alone in its paragraph becomes an ' +
        '<Image>.',
      static:
        'Static mode, `deckster shot` and exports never play video or load frames: ' +
        'they show posters, the last state of a CodeMove and the whole terminal ' +
        'session up to the step.',
      steps:
        'Code highlights, CodeMove states, Terminal commands, Video cues and ' +
        'AppFrame steps are deck steps: each press moves one.',
      warnings:
        'What the build warns about reaches `deckster lint` with a rule id: ' +
        'media-missing, media-gif, code-unknown-language, code-step-range, ' +
        'terminal-tone.',
    },
  };
}
