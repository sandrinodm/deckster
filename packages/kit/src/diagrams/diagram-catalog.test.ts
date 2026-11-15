import { describe, expect, it } from 'vite-plus/test';

import { DIAGRAM_CATALOG } from '#diagrams/diagram-catalog.ts';
import { DIAGRAM_COMPONENTS } from '#diagrams/diagram-components.ts';
import { LABEL_MAX_CHARS } from '#diagrams/diagram-limits.ts';
import {
  checkDiagramProps,
  DIAGRAM_COMPONENT_NAMES,
  DIAGRAM_PROPS,
  SHARED_DIAGRAM_PROP_INFO,
} from '#diagrams/diagram-props.ts';
import { DIAGRAM_STATES } from '#diagrams/flow-spec.ts';

describe('DIAGRAM_CATALOG', () => {
  it('lists every component the kit registers, and only those', () => {
    expect(DIAGRAM_CATALOG.components.map((entry) => entry.name).sort()).toEqual(
      Object.keys(DIAGRAM_COMPONENTS).sort(),
    );
    expect([...DIAGRAM_COMPONENT_NAMES].sort()).toEqual(Object.keys(DIAGRAM_COMPONENTS).sort());
  });

  it('documents every prop the validator accepts, shared ones once', () => {
    for (const entry of DIAGRAM_CATALOG.components) {
      const documented = [...entry.shared, ...Object.keys(entry.props)].sort();
      expect(documented).toEqual(Object.keys(DIAGRAM_PROPS[entry.name]).sort());
      for (const name of entry.shared) {
        expect(DIAGRAM_PROPS[entry.name][name]).toEqual(SHARED_DIAGRAM_PROP_INFO[name]);
      }
    }
  });

  it('accepts every documented value and the catalog’s examples’ prop names', () => {
    for (const entry of DIAGRAM_CATALOG.components) {
      for (const [name, info] of Object.entries(DIAGRAM_PROPS[entry.name])) {
        for (const value of info.values ?? []) {
          expect(checkDiagramProps(entry.name, { [name]: value }, { partial: true })).toEqual([]);
        }
      }

      for (const [, name] of entry.example.matchAll(/ ([a-zA-Z]+)=/g)) {
        const tags = [...entry.example.matchAll(/<([A-Z][a-zA-Z]*)/g)].map((match) => match[1]);
        const known = tags.some(
          (tag) =>
            tag !== undefined &&
            tag in DIAGRAM_PROPS &&
            name !== undefined &&
            name in DIAGRAM_PROPS[tag as keyof typeof DIAGRAM_PROPS],
        );
        expect(known, `${entry.name} example uses ${name}`).toBe(true);
      }
    }
  });

  it('writes the states as their literal values and names the synonyms separately', () => {
    expect(DIAGRAM_CATALOG.states).toEqual(DIAGRAM_STATES);
    expect(DIAGRAM_CATALOG.stateSynonyms).toMatchObject({
      highlight: 'highlighted',
      fail: 'error',
    });
    const state = DIAGRAM_CATALOG.components.find((entry) => entry.name === 'State');
    expect(state?.useWhen).toContain('is="highlighted", "error", "success", "muted"');
  });

  it('gives the limits the renderer and the lint rules use', () => {
    expect(DIAGRAM_CATALOG.limits).toMatchObject({
      nodes: 12,
      edges: 16,
      labelChars: LABEL_MAX_CHARS,
      maxNodes: 60,
      maxEdges: 120,
      maxParticles: 24,
    });
    expect(DIAGRAM_CATALOG.longText).toContain('ellipsis');
    expect(DIAGRAM_CATALOG.tsx.import).toContain("from '@deckster/kit/diagrams'");
  });

  it('keeps the edge flow fields and the Flow grid props', () => {
    expect(Object.keys(DIAGRAM_CATALOG.edgeFlow)).toEqual([
      'count',
      'speed',
      'size',
      'role',
      'reverse',
    ]);
    const flow = DIAGRAM_CATALOG.components.find((entry) => entry.name === 'Flow');
    expect(flow?.props).toHaveProperty('cols');
    expect(flow?.props).toHaveProperty('rows');
    expect(flow?.shared).toContain('height');
  });
});
