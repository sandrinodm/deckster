import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';

import { ensureImage } from '#verify/docker-image.ts';

/**
 * Builds the verification tools before browser tests start. Docker builds need networking;
 * preparing them first keeps their interface changes out of Chromium's requests during tests.
 */
const prepareImages = Effect.gen(function* () {
  yield* ensureImage('libreoffice');
  yield* ensureImage('ooxml-validator');
});

NodeRuntime.runMain(prepareImages.pipe(Effect.provide(NodeServices.layer)));
