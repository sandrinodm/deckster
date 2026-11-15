import { describe, expect, it } from 'vite-plus/test';

import type { ShellCommand } from '#protocol/shell-messages.ts';

import {
  createCommandReader,
  createEventWriter,
  MAX_COMMAND_LINE,
  type WritableLike,
} from '#main/stdio.ts';

type FakeStream = WritableLike & {
  written: string[];
  fail: (error: Error) => void;
  breakWrites: boolean;
  destroy: () => void;
};

function fakeStream(): FakeStream {
  let onError: (error: Error) => void = () => undefined;
  const stream: FakeStream = {
    written: [],
    breakWrites: false,
    destroyed: false,
    write: (chunk, callback) => {
      if (stream.breakWrites) {
        callback?.(new Error('EPIPE'));
        return false;
      }

      stream.written.push(chunk);
      callback?.(null);
      return true;
    },
    on: (_event, listener) => {
      onError = listener;
    },
    fail: (error) => onError(error),
    destroy: () => {
      (stream as { destroyed: boolean }).destroyed = true;
    },
  };
  return stream;
}

describe('the event writer', () => {
  it('writes lines', () => {
    const stream = fakeStream();
    const writer = createEventWriter(stream, () => undefined);
    writer.send({ type: 'window-closed', window: 'audience' });
    expect(stream.written).toEqual(['{"type":"window-closed","window":"audience"}\n']);
  });

  it('treats a stream error such as EPIPE as the parent being gone, once', () => {
    const stream = fakeStream();
    let closed = 0;
    const writer = createEventWriter(stream, () => (closed += 1));
    stream.fail(new Error('write EPIPE'));
    stream.fail(new Error('write EPIPE'));
    expect(closed).toBe(1);
    expect(writer.closed()).toBe(true);
    writer.send({ type: 'error', message: 'late' });
    expect(stream.written).toEqual([]);
  });

  it('treats a failed write as a broken pipe and never throws', () => {
    const stream = fakeStream();
    let closed = 0;
    const writer = createEventWriter(stream, () => (closed += 1));
    stream.breakWrites = true;
    expect(() => writer.send({ type: 'error', message: 'x' })).not.toThrow();
    expect(closed).toBe(1);
  });

  it('drops writes to a destroyed stream', () => {
    const stream = fakeStream();
    const writer = createEventWriter(stream, () => undefined);
    stream.destroy();
    writer.send({ type: 'error', message: 'x' });
    expect(stream.written).toEqual([]);
  });

  it('does not throw when write itself throws', () => {
    const stream = fakeStream();
    stream.write = () => {
      throw new Error('EPIPE');
    };
    let closed = 0;
    const writer = createEventWriter(stream, () => (closed += 1));
    expect(() => writer.send({ type: 'error', message: 'x' })).not.toThrow();
    expect(closed).toBe(1);
  });
});

describe('the command reader', () => {
  it('reassembles lines split across chunks and reports bad ones', () => {
    const commands: ShellCommand[] = [];
    const bad: string[] = [];
    const reader = createCommandReader(
      (command) => commands.push(command),
      (reason) => bad.push(reason),
    );
    reader.push('{"type":"fo');
    reader.push('cus"}\n\nnot json\n{"type":"quit"}\n{"type":"qu');
    expect(commands).toEqual([{ type: 'focus' }, { type: 'quit' }]);
    expect(bad).toEqual(['not JSON']);
  });
});

describe('the command reader under hostile input', () => {
  it('reports a command whose handler throws and keeps reading', () => {
    const bad: string[] = [];
    const seen: string[] = [];
    const reader = createCommandReader(
      (command) => {
        seen.push(command.type);
        if (command.type === 'focus') {
          throw new Error('no window yet');
        }
      },
      (reason) => bad.push(reason),
    );
    expect(() => reader.push('{"type":"focus"}\n{"type":"quit"}\n')).not.toThrow();
    expect(seen).toEqual(['focus', 'quit']);
    expect(bad).toEqual(['focus failed: no window yet']);
  });

  it(`drops a line longer than ${MAX_COMMAND_LINE} characters, reports it once and recovers`, () => {
    const commands: ShellCommand[] = [];
    const bad: string[] = [];
    const reader = createCommandReader(
      (command) => commands.push(command),
      (reason) => bad.push(reason),
    );
    const chunk = 'x'.repeat(64 * 1024);
    for (let index = 0; index < 64; index += 1) {
      reader.push(chunk);
    }

    expect(reader.buffered()).toBeLessThanOrEqual(MAX_COMMAND_LINE);
    reader.push('still the long line\n{"type":"quit"}\n');
    expect(commands).toEqual([{ type: 'quit' }]);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('longer than');
    reader.push(`${'y'.repeat(MAX_COMMAND_LINE + 1)}\n{"type":"focus"}\n`);
    expect(commands).toEqual([{ type: 'quit' }, { type: 'focus' }]);
    expect(bad).toHaveLength(2);
  });
});
