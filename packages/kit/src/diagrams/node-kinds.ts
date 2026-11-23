/**
 * The shapes a node can be drawn with. Most kinds share the card; a few get a shape that says what
 * they are at a glance, kept restrained so a diagram still reads as one family.
 */
export const NODE_SHAPES = [
  'card',
  'cylinder',
  'pipe',
  'pill',
  'soft',
  'window',
  'device',
  'hexagon',
  'chamfer',
  'stack',
  'double',
  'folded',
  'diamond',
  'dashed',
] as const;

/**
 * One of {@link NODE_SHAPES}.
 */
export type NodeShape = (typeof NODE_SHAPES)[number];

/**
 * What the kit knows about one node kind: its shape, its icon in each icon set the kit maps, and a
 * line for the catalog.
 */
export type NodeKindInfo = {
  /**
   * The shape the node is drawn with.
   */
  shape: NodeShape;

  /**
   * The icon's name by Iconify set; `null` for kinds drawn without an icon.
   */
  icons: Readonly<Record<string, string>> | null;

  /**
   * When to pick this kind, for `deckster diagrams`.
   */
  useWhen: string;
};

/**
 * Every node kind with its shape, icons and catalog line. Icons are named for the two sets the
 * kit's brands use (Lucide and Tabler); a brand with another set falls back to the Lucide name and
 * the build fails with a fix when that set has no such icon.
 */
export const NODE_KINDS = {
  /**
   * The `service` kind.
   */
  service: {
    /**
     * Its shape.
     */
    shape: 'card',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'server', tabler: 'server-2' },
    /**
     * When to pick it.
     */
    useWhen: 'An application service or API you run: orders API, auth service, a backend.',
  },

  /**
   * The `database` kind.
   */
  database: {
    /**
     * Its shape.
     */
    shape: 'cylinder',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'database', tabler: 'database' },
    /**
     * When to pick it.
     */
    useWhen: 'A database or any system of record: Postgres, DynamoDB, a ledger.',
  },

  /**
   * The `queue` kind.
   */
  queue: {
    /**
     * Its shape.
     */
    shape: 'pipe',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'list-ordered', tabler: 'list-numbers' },
    /**
     * When to pick it.
     */
    useWhen: 'A queue, stream or event bus: SQS, Kafka topic, a job queue.',
  },

  /**
   * The `cache` kind.
   */
  cache: {
    /**
     * Its shape.
     */
    shape: 'stack',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'zap', tabler: 'bolt' },
    /**
     * When to pick it.
     */
    useWhen: 'An in-memory cache in front of something slower: Redis, Memcached, an edge cache.',
  },

  /**
   * The `storage` kind.
   */
  storage: {
    /**
     * Its shape.
     */
    shape: 'card',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'archive', tabler: 'bucket' },
    /**
     * When to pick it.
     */
    useWhen: 'Object or file storage: an S3 bucket, a blob store, a file share.',
  },

  /**
   * The `user` kind.
   */
  user: {
    /**
     * Its shape.
     */
    shape: 'pill',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'user', tabler: 'user' },
    /**
     * When to pick it.
     */
    useWhen: 'A person: a customer, an operator, a reviewer. Usually where a journey starts.',
  },

  /**
   * The `client` kind.
   */
  client: {
    /**
     * Its shape.
     */
    shape: 'window',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'app-window', tabler: 'browser' },
    /**
     * When to pick it.
     */
    useWhen: 'A browser or desktop client: the web app, a single-page app, a CLI on a laptop.',
  },

  /**
   * The `mobile` kind.
   */
  mobile: {
    /**
     * Its shape.
     */
    shape: 'device',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'smartphone', tabler: 'device-mobile' },
    /**
     * When to pick it.
     */
    useWhen: 'A mobile app or device.',
  },

  /**
   * The `cloud` kind.
   */
  cloud: {
    /**
     * Its shape.
     */
    shape: 'soft',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'cloud', tabler: 'cloud' },
    /**
     * When to pick it.
     */
    useWhen: 'A managed platform or the internet as a whole: a CDN, a cloud provider, "the web".',
  },

  /**
   * The `external` kind.
   */
  external: {
    /**
     * Its shape.
     */
    shape: 'dashed',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'globe', tabler: 'world' },
    /**
     * When to pick it.
     */
    useWhen:
      'A system outside your boundary that you call or that calls you: Stripe, a partner API.',
  },

  /**
   * The `function` kind.
   */
  function: {
    /**
     * Its shape.
     */
    shape: 'chamfer',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'lambda', tabler: 'lambda' },
    /**
     * When to pick it.
     */
    useWhen: 'A serverless function or a worker that runs on demand: Lambda, a cron job.',
  },

  /**
   * The `gateway` kind.
   */
  gateway: {
    /**
     * Its shape.
     */
    shape: 'hexagon',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'network', tabler: 'network' },
    /**
     * When to pick it.
     */
    useWhen: 'An API gateway, reverse proxy or ingress that routes requests inward.',
  },

  /**
   * The `loadbalancer` kind.
   */
  loadbalancer: {
    /**
     * Its shape.
     */
    shape: 'hexagon',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'split', tabler: 'arrows-split-2' },
    /**
     * When to pick it.
     */
    useWhen: 'A load balancer that spreads traffic over several instances.',
  },

  /**
   * The `agent` kind.
   */
  agent: {
    /**
     * Its shape.
     */
    shape: 'double',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'bot', tabler: 'robot' },
    /**
     * When to pick it.
     */
    useWhen: 'An AI agent: the loop that plans, calls tools and talks to a model.',
  },

  /**
   * The `llm` kind.
   */
  llm: {
    /**
     * Its shape.
     */
    shape: 'double',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'sparkles', tabler: 'sparkles' },
    /**
     * When to pick it.
     */
    useWhen: 'A language model endpoint: the model an agent or a feature calls.',
  },

  /**
   * The `tool` kind.
   */
  tool: {
    /**
     * Its shape.
     */
    shape: 'card',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'wrench', tabler: 'tool' },
    /**
     * When to pick it.
     */
    useWhen: 'A tool an agent can call: search, code execution, a calendar API.',
  },

  /**
   * The `document` kind.
   */
  document: {
    /**
     * Its shape.
     */
    shape: 'folded',
    /**
     * Its icon by icon set.
     */
    icons: { lucide: 'file-text', tabler: 'file-text' },
    /**
     * When to pick it.
     */
    useWhen: 'A document, file, report or prompt: a PDF, a config file, a knowledge base page.',
  },

  /**
   * The `decision` kind.
   */
  decision: {
    /**
     * Its shape.
     */
    shape: 'diamond',
    /**
     * Its icon by icon set.
     */
    icons: null,
    /**
     * When to pick it.
     */
    useWhen: 'A yes/no branch in a process; keep its title to a short question.',
  },

  /**
   * The `node` kind.
   */
  node: {
    /**
     * Its shape.
     */
    shape: 'card',
    /**
     * Its icon by icon set.
     */
    icons: null,
    /**
     * When to pick it.
     */
    useWhen: 'Anything else: give it an `icon` from the brand set, or children of your own.',
  },
} as const satisfies Record<string, NodeKindInfo>;

/**
 * A node kind, such as `service` or `database`.
 */
export type NodeKind = keyof typeof NODE_KINDS;

/**
 * Other names agents reach for, mapped to the kind they mean.
 */
export const NODE_KIND_ALIASES: Readonly<Record<string, NodeKind>> = {
  /**
   * `browser` means `client`.
   */
  browser: 'client',

  /**
   * `web` means `client`.
   */
  web: 'client',

  /**
   * `app` means `client`.
   */
  app: 'client',

  /**
   * `db` means `database`.
   */
  db: 'database',

  /**
   * `stream` means `queue`.
   */
  stream: 'queue',

  /**
   * `bus` means `queue`.
   */
  bus: 'queue',

  /**
   * `lb` means `loadbalancer`.
   */
  lb: 'loadbalancer',

  /**
   * `load-balancer` means `loadbalancer`.
   */
  'load-balancer': 'loadbalancer',

  /**
   * `proxy` means `gateway`.
   */
  proxy: 'gateway',

  /**
   * `lambda` means `function`.
   */
  lambda: 'function',

  /**
   * `worker` means `function`.
   */
  worker: 'function',

  /**
   * `person` means `user`.
   */
  person: 'user',

  /**
   * `model` means `llm`.
   */
  model: 'llm',

  /**
   * `bucket` means `storage`.
   */
  bucket: 'storage',

  /**
   * `file` means `document`.
   */
  file: 'document',

  /**
   * `phone` means `mobile`.
   */
  phone: 'mobile',

  /**
   * `third-party` means `external`.
   */
  'third-party': 'external',

  /**
   * `generic` means `node`.
   */
  generic: 'node',
};

/**
 * Every kind name, aliases excluded, in catalog order.
 */
export const NODE_KIND_NAMES = Object.keys(NODE_KINDS) as NodeKind[];

/**
 * The kind a name means: a kind itself or one of its aliases.
 *
 * @param name - The name as written in `kind`.
 * @returns The kind; `undefined` for a name the kit does not know.
 */
export function resolveNodeKind(name: string): NodeKind | undefined {
  if (Object.hasOwn(NODE_KINDS, name)) {
    return name as NodeKind;
  }

  return Object.hasOwn(NODE_KIND_ALIASES, name) ? NODE_KIND_ALIASES[name] : undefined;
}

/**
 * The icon a kind is drawn with in an icon set.
 *
 * @param kind - The node kind.
 * @param set - The brand's Iconify set, such as `lucide`.
 * @returns The icon name; `undefined` for kinds without an icon.
 */
export function kindIconName(kind: NodeKind, set: string): string | undefined {
  const icons: Readonly<Record<string, string>> | null = NODE_KINDS[kind].icons;
  if (icons === null) {
    return undefined;
  }

  return (Object.hasOwn(icons, set) ? icons[set] : undefined) ?? icons['lucide'];
}
