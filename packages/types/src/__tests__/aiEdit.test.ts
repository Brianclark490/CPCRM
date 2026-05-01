import { describe, expect, it } from 'vitest';
import {
  AddComponentOpSchema,
  AddSectionOpSchema,
  AiEditResponseSchema,
  AiPageLayout,
  applyOp,
  MoveComponentOpSchema,
  RemoveComponentOpSchema,
  RemoveSectionOpSchema,
  ReorderSectionOpSchema,
  ReplaceSectionOpSchema,
  UpdateComponentConfigOpSchema,
} from '../aiEdit.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function baseLayout(): AiPageLayout {
  return {
    id: 'lay_1',
    objectId: 'obj_opp',
    name: 'Default',
    header: { primaryField: 'name', secondaryFields: ['stage'] },
    zones: {
      kpi: [
        {
          id: 'cmp_kpi_1',
          type: 'metric',
          config: { label: 'Amount', fieldApiName: 'amount' },
        },
      ],
      leftRail: [
        {
          id: 'sec_opps',
          label: 'Opportunities',
          columns: 1,
          components: [
            {
              id: 'cmp_field_name',
              type: 'field',
              config: { fieldApiName: 'name' },
            },
            {
              id: 'cmp_field_amount',
              type: 'field',
              config: { fieldApiName: 'amount' },
            },
          ],
        },
      ],
      rightRail: [],
    },
    tabs: [
      {
        id: 'tab_main',
        label: 'About',
        sections: [
          {
            id: 'sec_about',
            label: 'About',
            columns: 2,
            components: [
              {
                id: 'cmp_notes',
                type: 'field',
                config: { fieldApiName: 'notes' },
              },
            ],
          },
        ],
      },
    ],
  };
}

// ─── Reducer ───────────────────────────────────────────────────────────────

describe('applyOp', () => {
  it('does not mutate the input layout', () => {
    const layout = baseLayout();
    const snapshot = JSON.stringify(layout);
    applyOp(layout, {
      op: 'remove_component',
      id: 'op_1',
      componentId: 'cmp_kpi_1',
    });
    expect(JSON.stringify(layout)).toBe(snapshot);
  });

  describe('add_component', () => {
    it('appends a KPI when position is -1', () => {
      const layout = baseLayout();
      const result = applyOp(layout, {
        op: 'add_component',
        id: 'op_1',
        target: { kind: 'zone', zone: 'kpi' },
        position: -1,
        component: {
          id: 'cmp_kpi_2',
          type: 'metric',
          config: { label: 'Stage' },
        },
      });
      expect(result.zones!.kpi.map((c) => c.id)).toEqual([
        'cmp_kpi_1',
        'cmp_kpi_2',
      ]);
    });

    it('inserts at a positional index inside a section', () => {
      const layout = baseLayout();
      const result = applyOp(layout, {
        op: 'add_component',
        id: 'op_1',
        target: { kind: 'section', sectionId: 'sec_opps' },
        position: 1,
        component: {
          id: 'cmp_field_stage',
          type: 'field',
          config: { fieldApiName: 'stage' },
        },
      });
      expect(result.zones!.leftRail[0].components.map((c) => c.id)).toEqual([
        'cmp_field_name',
        'cmp_field_stage',
        'cmp_field_amount',
      ]);
    });

    it('generates a component id when none is supplied', () => {
      const layout = baseLayout();
      const result = applyOp(layout, {
        op: 'add_component',
        id: 'op_1',
        target: { kind: 'zone', zone: 'kpi' },
        position: -1,
        component: { type: 'metric', config: {} },
      });
      const added = result.zones!.kpi[1];
      expect(added.id).toMatch(/^cmp_/);
      expect(added.id).not.toBe('');
    });

    it('throws when the target section does not exist', () => {
      const layout = baseLayout();
      expect(() =>
        applyOp(layout, {
          op: 'add_component',
          id: 'op_1',
          target: { kind: 'section', sectionId: 'sec_missing' },
          position: 0,
          component: { type: 'field', config: {} },
        }),
      ).toThrow(/sec_missing/);
    });
  });

  describe('remove_component', () => {
    it('removes a component from the KPI strip', () => {
      const layout = baseLayout();
      const result = applyOp(layout, {
        op: 'remove_component',
        id: 'op_1',
        componentId: 'cmp_kpi_1',
      });
      expect(result.zones!.kpi).toEqual([]);
    });

    it('removes a component from a tab section', () => {
      const layout = baseLayout();
      const result = applyOp(layout, {
        op: 'remove_component',
        id: 'op_1',
        componentId: 'cmp_notes',
      });
      expect(result.tabs[0].sections[0].components).toEqual([]);
    });

    it('throws when the component does not exist', () => {
      expect(() =>
        applyOp(baseLayout(), {
          op: 'remove_component',
          id: 'op_1',
          componentId: 'cmp_ghost',
        }),
      ).toThrow(/cmp_ghost/);
    });
  });

  describe('move_component', () => {
    it('moves a component from a tab section into a rail section', () => {
      const layout = baseLayout();
      const result = applyOp(layout, {
        op: 'move_component',
        id: 'op_1',
        componentId: 'cmp_notes',
        to: { kind: 'section', sectionId: 'sec_opps', position: -1 },
      });
      expect(result.tabs[0].sections[0].components).toEqual([]);
      expect(
        result.zones!.leftRail[0].components.map((c) => c.id),
      ).toEqual(['cmp_field_name', 'cmp_field_amount', 'cmp_notes']);
    });

    it('moves a component into the KPI strip at a specific position', () => {
      const layout = baseLayout();
      const result = applyOp(layout, {
        op: 'move_component',
        id: 'op_1',
        componentId: 'cmp_field_amount',
        to: { kind: 'zone', zone: 'kpi', position: 0 },
      });
      expect(result.zones!.kpi.map((c) => c.id)).toEqual([
        'cmp_field_amount',
        'cmp_kpi_1',
      ]);
      expect(result.zones!.leftRail[0].components.map((c) => c.id)).toEqual([
        'cmp_field_name',
      ]);
    });

    it('throws when the target section is missing', () => {
      expect(() =>
        applyOp(baseLayout(), {
          op: 'move_component',
          id: 'op_1',
          componentId: 'cmp_field_name',
          to: { kind: 'section', sectionId: 'sec_missing', position: 0 },
        }),
      ).toThrow(/sec_missing/);
    });
  });

  describe('update_component_config', () => {
    it('shallow-merges the patch into the existing config', () => {
      const layout = baseLayout();
      const result = applyOp(layout, {
        op: 'update_component_config',
        id: 'op_1',
        componentId: 'cmp_kpi_1',
        patch: { label: 'Total amount', accent: 'success' },
      });
      expect(result.zones!.kpi[0].config).toEqual({
        label: 'Total amount',
        fieldApiName: 'amount',
        accent: 'success',
      });
    });

    it('deletes a key when the patch value is null', () => {
      const layout = baseLayout();
      const result = applyOp(layout, {
        op: 'update_component_config',
        id: 'op_1',
        componentId: 'cmp_kpi_1',
        patch: { fieldApiName: null },
      });
      expect(result.zones!.kpi[0].config).toEqual({ label: 'Amount' });
    });
  });

  describe('add_section', () => {
    it('appends a section to a rail', () => {
      const layout = baseLayout();
      const result = applyOp(layout, {
        op: 'add_section',
        id: 'op_1',
        target: { kind: 'rail', rail: 'rightRail' },
        position: -1,
        section: {
          id: 'sec_recent_calls',
          label: 'Recent Calls',
          columns: 1,
          components: [
            {
              id: 'cmp_rc',
              type: 'related_list',
              config: { relationshipId: 'rel_recent_calls' },
            },
          ],
        },
      });
      expect(result.zones!.rightRail.map((s) => s.id)).toEqual([
        'sec_recent_calls',
      ]);
      expect(result.zones!.rightRail[0].components[0].id).toBe('cmp_rc');
    });

    it('inserts a section into a tab at a specific position', () => {
      const layout = baseLayout();
      const result = applyOp(layout, {
        op: 'add_section',
        id: 'op_1',
        target: { kind: 'tab', tabId: 'tab_main' },
        position: 0,
        section: {
          id: 'sec_top',
          label: 'Top',
          columns: 1,
          components: [],
        },
      });
      expect(result.tabs[0].sections.map((s) => s.id)).toEqual([
        'sec_top',
        'sec_about',
      ]);
    });

    it('throws when the tab id is unknown', () => {
      expect(() =>
        applyOp(baseLayout(), {
          op: 'add_section',
          id: 'op_1',
          target: { kind: 'tab', tabId: 'tab_missing' },
          position: 0,
          section: { label: 'X', columns: 1, components: [] },
        }),
      ).toThrow(/tab_missing/);
    });

    it('defaults the section type to field_section when omitted', () => {
      const result = applyOp(baseLayout(), {
        op: 'add_section',
        id: 'op_1',
        target: { kind: 'rail', rail: 'rightRail' },
        position: -1,
        section: { label: 'New', columns: 1, components: [] },
      });
      expect(result.zones!.rightRail[0].type).toBe('field_section');
    });

    it('honours an explicit section type', () => {
      const result = applyOp(baseLayout(), {
        op: 'add_section',
        id: 'op_1',
        target: { kind: 'rail', rail: 'rightRail' },
        position: -1,
        section: {
          type: 'related_list',
          label: 'Calls',
          columns: 1,
          components: [
            {
              type: 'related_list',
              config: { relationshipId: 'rel_recent_calls' },
            },
          ],
        },
      });
      expect(result.zones!.rightRail[0].type).toBe('related_list');
    });
  });

  describe('remove_section', () => {
    it('removes a rail section', () => {
      const layout = baseLayout();
      const result = applyOp(layout, {
        op: 'remove_section',
        id: 'op_1',
        sectionId: 'sec_opps',
      });
      expect(result.zones!.leftRail).toEqual([]);
    });

    it('removes a tab section', () => {
      const layout = baseLayout();
      const result = applyOp(layout, {
        op: 'remove_section',
        id: 'op_1',
        sectionId: 'sec_about',
      });
      expect(result.tabs[0].sections).toEqual([]);
    });
  });

  describe('replace_section', () => {
    it('replaces components and preserves untouched metadata', () => {
      const layout = baseLayout();
      const result = applyOp(layout, {
        op: 'replace_section',
        id: 'op_1',
        sectionId: 'sec_opps',
        section: {
          label: 'Recent Calls',
          components: [
            {
              type: 'related_list',
              config: { relationshipId: 'rel_recent_calls', limit: 5 },
            },
          ],
        },
      });
      const replaced = result.zones!.leftRail[0];
      expect(replaced.label).toBe('Recent Calls');
      expect(replaced.columns).toBe(1);
      expect(replaced.components).toHaveLength(1);
      expect(replaced.components[0].type).toBe('related_list');
    });

    it('honours an explicit section type override', () => {
      const layout = baseLayout();
      const result = applyOp(layout, {
        op: 'replace_section',
        id: 'op_1',
        sectionId: 'sec_opps',
        section: {
          type: 'related_list',
          components: [
            {
              type: 'related_list',
              config: { relationshipId: 'rel_recent_calls' },
            },
          ],
        },
      });
      expect(result.zones!.leftRail[0].type).toBe('related_list');
    });
  });

  describe('reorder_section', () => {
    it('reorders rail sections within their rail', () => {
      const layout = baseLayout();
      layout.zones!.leftRail.push({
        id: 'sec_extra',
        label: 'Extra',
        columns: 1,
        components: [],
      });
      const result = applyOp(layout, {
        op: 'reorder_section',
        id: 'op_1',
        sectionId: 'sec_extra',
        position: 0,
      });
      expect(result.zones!.leftRail.map((s) => s.id)).toEqual([
        'sec_extra',
        'sec_opps',
      ]);
    });

    it('reorders sections inside a tab', () => {
      const layout = baseLayout();
      layout.tabs[0].sections.push({
        id: 'sec_more',
        label: 'More',
        columns: 1,
        components: [],
      });
      const result = applyOp(layout, {
        op: 'reorder_section',
        id: 'op_1',
        sectionId: 'sec_more',
        position: 0,
      });
      expect(result.tabs[0].sections.map((s) => s.id)).toEqual([
        'sec_more',
        'sec_about',
      ]);
    });
  });

  it('round-trips worked example 1 (replace section)', () => {
    const layout = baseLayout();
    const response = AiEditResponseSchema.parse({
      summary: 'Replaces the Opportunities section with a Recent Calls list.',
      ops: [
        {
          op: 'replace_section',
          id: 'op_1',
          sectionId: 'sec_opps',
          section: {
            label: 'Recent Calls',
            components: [
              {
                type: 'related_list',
                config: {
                  relationshipId: 'rel_recent_calls',
                  displayFields: ['name', 'called_at', 'outcome'],
                  limit: 5,
                  allowCreate: true,
                },
              },
            ],
          },
        },
      ],
    });
    const result = response.ops.reduce(applyOp, layout);
    expect(result.zones!.leftRail[0].label).toBe('Recent Calls');
    expect(result.zones!.leftRail[0].components[0].type).toBe('related_list');
  });

  it('round-trips worked example 2 (KPI add)', () => {
    const layout = baseLayout();
    const response = AiEditResponseSchema.parse({
      summary: "Adds a 'Days since last call' metric.",
      ops: [
        {
          op: 'add_component',
          id: 'op_1',
          target: { kind: 'zone', zone: 'kpi' },
          position: -1,
          component: {
            type: 'metric',
            config: {
              label: 'Days since last call',
              source: { kind: 'field', fieldApiName: 'last_call_at' },
              format: 'duration',
            },
          },
        },
      ],
    });
    const result = response.ops.reduce(applyOp, layout);
    expect(result.zones!.kpi).toHaveLength(2);
    expect(result.zones!.kpi[1].config.label).toBe('Days since last call');
  });

  it('round-trips worked example 3 (move + add)', () => {
    const layout = baseLayout();
    const response = AiEditResponseSchema.parse({
      summary: 'Moves notes and adds an activity feed.',
      ops: [
        {
          op: 'move_component',
          id: 'op_1',
          componentId: 'cmp_notes',
          to: { kind: 'section', sectionId: 'sec_opps', position: -1 },
        },
        {
          op: 'add_component',
          id: 'op_2',
          target: { kind: 'section', sectionId: 'sec_opps' },
          position: -1,
          component: {
            type: 'activity',
            config: { limit: 10, types: ['opportunity', 'system'] },
          },
        },
      ],
    });
    const result = response.ops.reduce(applyOp, layout);
    const railIds = result.zones!.leftRail[0].components.map((c) => c.id);
    expect(railIds[0]).toBe('cmp_field_name');
    expect(railIds[1]).toBe('cmp_field_amount');
    expect(railIds[2]).toBe('cmp_notes');
    expect(result.zones!.leftRail[0].components[3].type).toBe('activity');
    expect(result.tabs[0].sections[0].components).toEqual([]);
  });
});

// ─── Schemas ───────────────────────────────────────────────────────────────

describe('AiEditResponseSchema', () => {
  it('accepts an empty op list with a clarification', () => {
    const parsed = AiEditResponseSchema.parse({
      summary: 'Need more info.',
      ops: [],
      clarification: 'Which section did you mean?',
    });
    expect(parsed.clarification).toBe('Which section did you mean?');
  });

  it('rejects a clarification combined with non-empty ops', () => {
    expect(
      AiEditResponseSchema.safeParse({
        summary: 'x',
        ops: [
          {
            op: 'remove_component',
            id: 'op_1',
            componentId: 'cmp_x',
          },
        ],
        clarification: 'mixed',
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown op kind', () => {
    expect(
      AiEditResponseSchema.safeParse({
        summary: 'x',
        ops: [{ op: 'mutate_everything', id: 'op_1' }],
      }).success,
    ).toBe(false);
  });
});

describe('per-op schema rejections', () => {
  it('rejects add_component with an empty component type', () => {
    expect(
      AddComponentOpSchema.safeParse({
        op: 'add_component',
        id: 'op_1',
        target: { kind: 'zone', zone: 'kpi' },
        position: 0,
        component: { type: '', config: {} },
      }).success,
    ).toBe(false);
  });

  it('rejects add_component with a non-kpi zone target', () => {
    expect(
      AddComponentOpSchema.safeParse({
        op: 'add_component',
        id: 'op_1',
        target: { kind: 'zone', zone: 'leftRail' },
        position: 0,
        component: { type: 'metric', config: {} },
      }).success,
    ).toBe(false);
  });

  it('rejects remove_component with a missing componentId', () => {
    expect(
      RemoveComponentOpSchema.safeParse({
        op: 'remove_component',
        id: 'op_1',
      }).success,
    ).toBe(false);
  });

  it('rejects move_component without a position on the target', () => {
    expect(
      MoveComponentOpSchema.safeParse({
        op: 'move_component',
        id: 'op_1',
        componentId: 'cmp_x',
        to: { kind: 'zone', zone: 'kpi' },
      }).success,
    ).toBe(false);
  });

  it('rejects update_component_config without a patch', () => {
    expect(
      UpdateComponentConfigOpSchema.safeParse({
        op: 'update_component_config',
        id: 'op_1',
        componentId: 'cmp_x',
      }).success,
    ).toBe(false);
  });

  it('rejects add_section with columns outside the 1-2 range', () => {
    expect(
      AddSectionOpSchema.safeParse({
        op: 'add_section',
        id: 'op_1',
        target: { kind: 'rail', rail: 'leftRail' },
        position: 0,
        section: { label: 'X', columns: 3, components: [] },
      }).success,
    ).toBe(false);
  });

  it('rejects add_section with an unknown section type', () => {
    expect(
      AddSectionOpSchema.safeParse({
        op: 'add_section',
        id: 'op_1',
        target: { kind: 'rail', rail: 'leftRail' },
        position: 0,
        section: {
          type: 'mystery_section',
          label: 'X',
          columns: 1,
          components: [],
        },
      }).success,
    ).toBe(false);
  });

  it('rejects remove_section without a sectionId', () => {
    expect(
      RemoveSectionOpSchema.safeParse({
        op: 'remove_section',
        id: 'op_1',
      }).success,
    ).toBe(false);
  });

  it('rejects replace_section without a components array', () => {
    expect(
      ReplaceSectionOpSchema.safeParse({
        op: 'replace_section',
        id: 'op_1',
        sectionId: 'sec_x',
        section: { label: 'X' },
      }).success,
    ).toBe(false);
  });

  it('rejects reorder_section with a non-integer position', () => {
    expect(
      ReorderSectionOpSchema.safeParse({
        op: 'reorder_section',
        id: 'op_1',
        sectionId: 'sec_x',
        position: 1.5,
      }).success,
    ).toBe(false);
  });
});
