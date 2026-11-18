import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { StatValue } from '#foundation/stat-figure.tsx';
import { useCountUp } from '#motion/use-count-up.ts';

vi.mock('#motion/use-count-up.ts', () => ({ useCountUp: vi.fn() }));

describe('StatValue', () => {
  beforeEach(() => {
    vi.mocked(useCountUp).mockReset();
  });

  it('counts the number by default while preserving the unit', () => {
    const html = renderToStaticMarkup(<StatValue value="10 min" />);
    expect(useCountUp).toHaveBeenCalledWith('10', expect.anything());
    expect(html).toContain('10');
    expect(html).toContain('min');
  });

  it('keeps a fixed timebox out of the count-up while preserving its figure and unit', () => {
    vi.mocked(useCountUp).mockReturnValue('0');
    const html = renderToStaticMarkup(<StatValue value="10 min" countUp={false} />);
    expect(useCountUp).toHaveBeenCalledWith('', expect.anything());
    expect(html).toContain('>10<span');
    expect(html).toContain('min');
    expect(html).not.toContain('kit-count');
  });
});
