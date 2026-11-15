import { describe, expect, it } from 'vite-plus/test';

import { DOCKER_MISSING, DOCKER_STOPPED, dockerStatusOf } from '#verify/docker-image.ts';

describe('dockerStatusOf', () => {
  it('tells a missing program from a daemon that does not answer', () => {
    expect(dockerStatusOf(null)).toEqual({ kind: 'missing', why: DOCKER_MISSING });
    expect(dockerStatusOf({ code: 0, stdout: '28.1.1\n', stderr: '' })).toEqual({
      kind: 'ready',
    });
    expect(
      dockerStatusOf({
        code: 1,
        stdout: '',
        stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock.\nmore',
      }),
    ).toEqual({
      kind: 'stopped',
      why: `${DOCKER_STOPPED}: Cannot connect to the Docker daemon at unix:///var/run/docker.sock.`,
    });
  });
});
