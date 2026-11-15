/**
 * `pnpm --filter @deckster/agent verify:claude`: one real edit turn and one resumed turn with
 * Claude against a temporary copy of the hello deck. It spends a little of the signed-in account's
 * quota, so it is not part of `pnpm ready`.
 */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';

import { claudeProvider } from '#providers/index.ts';

import { verifyProvider } from './verify-provider.ts';

NodeRuntime.runMain(
  verifyProvider(claudeProvider).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
