import LucideAppWindow from '~icons/lucide/app-window';
import LucideArchive from '~icons/lucide/archive';
import LucideBot from '~icons/lucide/bot';
import LucideCloud from '~icons/lucide/cloud';
import LucideDatabase from '~icons/lucide/database';
import LucideFileText from '~icons/lucide/file-text';
import LucideGlobe from '~icons/lucide/globe';
import LucideLambda from '~icons/lucide/lambda';
import LucideListOrdered from '~icons/lucide/list-ordered';
import LucideNetwork from '~icons/lucide/network';
import LucideServer from '~icons/lucide/server';
import LucideSmartphone from '~icons/lucide/smartphone';
import LucideSparkles from '~icons/lucide/sparkles';
import LucideSplit from '~icons/lucide/split';
import LucideUser from '~icons/lucide/user';
import LucideWrench from '~icons/lucide/wrench';
import LucideZap from '~icons/lucide/zap';
import TablerArrowsSplit2 from '~icons/tabler/arrows-split-2';
import TablerBolt from '~icons/tabler/bolt';
import TablerBrowser from '~icons/tabler/browser';
import TablerBucket from '~icons/tabler/bucket';
import TablerCloud from '~icons/tabler/cloud';
import TablerDatabase from '~icons/tabler/database';
import TablerDeviceMobile from '~icons/tabler/device-mobile';
import TablerFileText from '~icons/tabler/file-text';
import TablerLambda from '~icons/tabler/lambda';
import TablerListNumbers from '~icons/tabler/list-numbers';
import TablerNetwork from '~icons/tabler/network';
import TablerRobot from '~icons/tabler/robot';
import TablerServer2 from '~icons/tabler/server-2';
import TablerSparkles from '~icons/tabler/sparkles';
import TablerTool from '~icons/tabler/tool';
import TablerUser from '~icons/tabler/user';
import TablerWorld from '~icons/tabler/world';

import type { IconComponent } from '#diagrams/flow-parts.tsx';
import type { NodeKind } from '#diagrams/node-kinds.ts';

/**
 * The kinds' icons in the Lucide set, for TSX slides (MDX slides import only the icons they use at
 * build time). This module is a lazy chunk that loads only when a TSX diagram needs a kind's icon.
 */
const LUCIDE: Readonly<Partial<Record<NodeKind, IconComponent>>> = {
  /**
   * `kind="service"`.
   */
  service: LucideServer,

  /**
   * `kind="database"`.
   */
  database: LucideDatabase,

  /**
   * `kind="queue"`.
   */
  queue: LucideListOrdered,

  /**
   * `kind="cache"`.
   */
  cache: LucideZap,

  /**
   * `kind="storage"`.
   */
  storage: LucideArchive,

  /**
   * `kind="user"`.
   */
  user: LucideUser,

  /**
   * `kind="client"`.
   */
  client: LucideAppWindow,

  /**
   * `kind="mobile"`.
   */
  mobile: LucideSmartphone,

  /**
   * `kind="cloud"`.
   */
  cloud: LucideCloud,

  /**
   * `kind="external"`.
   */
  external: LucideGlobe,

  /**
   * `kind="function"`.
   */
  function: LucideLambda,

  /**
   * `kind="gateway"`.
   */
  gateway: LucideNetwork,

  /**
   * `kind="loadbalancer"`.
   */
  loadbalancer: LucideSplit,

  /**
   * `kind="agent"`.
   */
  agent: LucideBot,

  /**
   * `kind="llm"`.
   */
  llm: LucideSparkles,

  /**
   * `kind="tool"`.
   */
  tool: LucideWrench,

  /**
   * `kind="document"`.
   */
  document: LucideFileText,
};

/**
 * The kinds' icons in the Tabler set.
 */
const TABLER: Readonly<Partial<Record<NodeKind, IconComponent>>> = {
  /**
   * `kind="service"`.
   */
  service: TablerServer2,

  /**
   * `kind="database"`.
   */
  database: TablerDatabase,

  /**
   * `kind="queue"`.
   */
  queue: TablerListNumbers,

  /**
   * `kind="cache"`.
   */
  cache: TablerBolt,

  /**
   * `kind="storage"`.
   */
  storage: TablerBucket,

  /**
   * `kind="user"`.
   */
  user: TablerUser,

  /**
   * `kind="client"`.
   */
  client: TablerBrowser,

  /**
   * `kind="mobile"`.
   */
  mobile: TablerDeviceMobile,

  /**
   * `kind="cloud"`.
   */
  cloud: TablerCloud,

  /**
   * `kind="external"`.
   */
  external: TablerWorld,

  /**
   * `kind="function"`.
   */
  function: TablerLambda,

  /**
   * `kind="gateway"`.
   */
  gateway: TablerNetwork,

  /**
   * `kind="loadbalancer"`.
   */
  loadbalancer: TablerArrowsSplit2,

  /**
   * `kind="agent"`.
   */
  agent: TablerRobot,

  /**
   * `kind="llm"`.
   */
  llm: TablerSparkles,

  /**
   * `kind="tool"`.
   */
  tool: TablerTool,

  /**
   * `kind="document"`.
   */
  document: TablerFileText,
};

/**
 * The kinds' icons by icon set; a brand with another set gets Lucide's.
 */
export const KIND_ICON_SETS: Readonly<
  Record<string, Readonly<Partial<Record<NodeKind, IconComponent>>>>
> = {
  /**
   * Lucide.
   */
  lucide: LUCIDE,

  /**
   * Tabler.
   */
  tabler: TABLER,
};
