import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { ProviderEvent } from '#protocol/agent-events.ts';
import type { AgentProvider, ParseState } from '#providers/provider-types.ts';

import { makeParseState } from '#providers/provider-types.ts';

/**
 * The folder of the recorded transcripts.
 */
export const TRANSCRIPTS_DIR = path.resolve(import.meta.dirname, '../../fixtures/transcripts');

/**
 * The workspace root the transcripts were recorded in (scrubbed).
 */
export const RECORDED_ROOT = '/workspace';

/**
 * The transcript files of one provider, by name.
 *
 * @param prefix - `claude` or `codex`.
 */
export function transcriptsOf(prefix: 'claude' | 'codex'): string[] {
  return readdirSync(TRANSCRIPTS_DIR)
    .filter((file) => file.startsWith(prefix) && file.endsWith('.jsonl'))
    .filter((file) => !file.endsWith('.input.jsonl'))
    .toSorted();
}

/**
 * The text of a recorded file.
 *
 * @param file - The file name.
 */
export function readTranscript(file: string): string {
  return readFileSync(path.join(TRANSCRIPTS_DIR, file), 'utf8');
}

/**
 * Feeds a transcript to a provider's parser line by line.
 *
 * @param provider - The adapter.
 * @param file - The transcript file name.
 * @param previousCostUsd - The session's cost before the turn.
 */
export function parseTranscript(
  provider: Pick<AgentProvider, 'parseLine'>,
  file: string,
  previousCostUsd = 0,
): { readonly events: ProviderEvent[]; readonly state: ParseState } {
  const state = makeParseState(RECORDED_ROOT, previousCostUsd);
  const events = readTranscript(file)
    .split('\n')
    .flatMap((line) => provider.parseLine(line, state));
  return { events, state };
}

/**
 * Events as short lines for snapshots: consecutive text deltas are counted, not listed.
 *
 * @param events - The events.
 */
export function summarise(events: readonly ProviderEvent[]): string[] {
  const lines: string[] = [];
  let deltas = 0;
  for (const event of events) {
    if (event.type === 'text-delta') {
      deltas += 1;
      continue;
    }

    if (deltas > 0) {
      lines.push(`text-delta x${deltas}`);
      deltas = 0;
    }

    lines.push(describe(event));
  }

  if (deltas > 0) {
    lines.push(`text-delta x${deltas}`);
  }

  return lines;
}

/**
 * One event as a line.
 *
 * @param event - The event.
 */
function describe(event: ProviderEvent): string {
  switch (event.type) {
    case 'session':
      return `session ${event.sessionId}`;
    case 'text':
    case 'reasoning':
      return `${event.type} ${JSON.stringify(event.text.slice(0, 80))}`;
    case 'tool':
      return `tool ${event.status} ${event.name}: ${event.title}${event.path === null ? '' : ` [${event.path}]`}${event.detail === null ? '' : ` (${event.detail.slice(0, 60)})`}`;
    case 'file-change':
      return `file-change ${event.kind} ${event.path}`;
    case 'usage':
      return `usage in=${event.inputTokens} cached=${event.cachedInputTokens} out=${event.outputTokens} cost=${event.costUsd}`;
    case 'notice':
      return `notice ${event.kind} ${event.message.slice(0, 80)}`;
    case 'error':
      return `error ${event.kind} ${event.message.slice(0, 80)}`;
    case 'text-delta':
      return 'text-delta';
  }
}
