// ─────────────────────────────────────────────────────────────────────────────
// AI page-editor edit contract
// ─────────────────────────────────────────────────────────────────────────────
//
// Shared between the FE patch applicator and the BE endpoint so they cannot
// drift. Mirrors `docs/page-builder/ai-edit-contract.md` and the FE layout
// shape declared in `apps/web/src/components/layoutTypes.ts`.

import { z } from 'zod';

// ─── Layout shape (mirrors apps/web/src/components/layoutTypes.ts) ──────────
//
// These interfaces describe the in-memory layout used by the page builder.
// They intentionally live here so the reducer below has a single source of
// truth that both the FE and BE can import. They are structurally identical
// to the types declared in `apps/web/src/components/layoutTypes.ts`.

export type AiVisibilityOp =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_empty'
  | 'empty'
  | 'greater_than'
  | 'less_than'
  | 'in'
  | 'not_in';

export interface AiVisibilityCondition {
  field: string;
  op: AiVisibilityOp;
  value?: unknown;
}

export interface AiVisibilityRule {
  operator: 'AND' | 'OR';
  conditions: AiVisibilityCondition[];
}

export interface AiLayoutComponent {
  id: string;
  type: string;
  config: Record<string, unknown>;
  visibility?: AiVisibilityRule | null;
}

export interface AiLayoutSection {
  id: string;
  type?: string;
  label: string;
  columns: number;
  collapsed?: boolean;
  visibility?: AiVisibilityRule | null;
  components: AiLayoutComponent[];
}

export interface AiLayoutTab {
  id: string;
  label: string;
  sections: AiLayoutSection[];
}

export interface AiLayoutZones {
  kpi: AiLayoutComponent[];
  leftRail: AiLayoutSection[];
  rightRail: AiLayoutSection[];
}

export interface AiLayoutHeader {
  primaryField: string;
  secondaryFields: string[];
}

export interface AiPageLayout {
  id: string;
  objectId: string;
  name: string;
  header: AiLayoutHeader;
  zones?: AiLayoutZones;
  tabs: AiLayoutTab[];
}

// ─── Per-request context the BE assembles for the model ────────────────────

export type AiEditFieldType =
  | 'text'
  | 'long_text'
  | 'number'
  | 'currency'
  | 'percent'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'picklist'
  | 'multipicklist'
  | 'reference'
  | 'email'
  | 'phone'
  | 'url';

export interface AiEditContextField {
  apiName: string;
  label: string;
  fieldType: AiEditFieldType | string;
}

export interface AiEditContextRelationship {
  relationshipId: string;
  label: string;
  relationshipType: 'lookup' | 'parent_child';
  relatedObjectApiName: string;
}

export interface AiEditContext {
  layoutId: string;
  objectApiName: string;
  objectLabel: string;
  layout: AiPageLayout;
  fields: AiEditContextField[];
  relationships: AiEditContextRelationship[];
}

// ─── Op union ──────────────────────────────────────────────────────────────

export type AiEditOpKind =
  | 'add_component'
  | 'remove_component'
  | 'move_component'
  | 'update_component_config'
  | 'add_section'
  | 'remove_section'
  | 'replace_section'
  | 'reorder_section';

export interface AiEditComponentInput {
  id?: string;
  type: string;
  config: Record<string, unknown>;
  visibility?: AiVisibilityRule | null;
}

export interface AddComponentOp {
  op: 'add_component';
  id: string;
  target:
    | { kind: 'zone'; zone: 'kpi' }
    | { kind: 'section'; sectionId: string };
  /** 0-based index. Use -1 for "append". */
  position: number;
  component: AiEditComponentInput;
}

export interface RemoveComponentOp {
  op: 'remove_component';
  id: string;
  componentId: string;
}

export interface MoveComponentOp {
  op: 'move_component';
  id: string;
  componentId: string;
  to:
    | { kind: 'zone'; zone: 'kpi'; position: number }
    | { kind: 'section'; sectionId: string; position: number };
}

export interface UpdateComponentConfigOp {
  op: 'update_component_config';
  id: string;
  componentId: string;
  /** Shallow merge into the existing config. Keys set to `null` are deleted. */
  patch: Record<string, unknown>;
}

export type AiSectionType = 'field_section' | 'related_list' | 'widget_section';

export const DEFAULT_SECTION_TYPE: AiSectionType = 'field_section';

export interface AddSectionOp {
  op: 'add_section';
  id: string;
  target:
    | { kind: 'rail'; rail: 'leftRail' | 'rightRail' }
    | { kind: 'tab'; tabId: string };
  position: number;
  section: {
    id?: string;
    /** Defaults to DEFAULT_SECTION_TYPE when omitted. */
    type?: AiSectionType;
    label: string;
    columns: number;
    collapsed?: boolean;
    components: AiEditComponentInput[];
  };
}

export interface RemoveSectionOp {
  op: 'remove_section';
  id: string;
  sectionId: string;
}

export interface ReplaceSectionOp {
  op: 'replace_section';
  id: string;
  sectionId: string;
  section: {
    label?: string;
    type?: AiSectionType;
    columns?: number;
    collapsed?: boolean;
    components: AiEditComponentInput[];
  };
}

export interface ReorderSectionOp {
  op: 'reorder_section';
  id: string;
  sectionId: string;
  /** New 0-based index inside its current rail or tab. */
  position: number;
}

export type AiEditOp =
  | AddComponentOp
  | RemoveComponentOp
  | MoveComponentOp
  | UpdateComponentConfigOp
  | AddSectionOp
  | RemoveSectionOp
  | ReplaceSectionOp
  | ReorderSectionOp;

export interface AiEditResponse {
  /** Short natural-language summary shown above the diff preview. */
  summary: string;
  /** Ordered list of operations to apply. May be empty (no-op). */
  ops: AiEditOp[];
  /**
   * Optional clarifying question. When set, `ops` MUST be empty and the FE
   * renders the question instead of a diff.
   */
  clarification?: string;
}

// ─── Zod schemas ───────────────────────────────────────────────────────────

const NonEmptyString = z.string().min(1);

const VisibilityOpSchema = z.enum([
  'equals',
  'not_equals',
  'contains',
  'not_empty',
  'empty',
  'greater_than',
  'less_than',
  'in',
  'not_in',
]);

export const AiVisibilityConditionSchema = z
  .object({
    field: NonEmptyString,
    op: VisibilityOpSchema,
    value: z.unknown().optional(),
  })
  .strict();

export const AiVisibilityRuleSchema = z
  .object({
    operator: z.enum(['AND', 'OR']),
    conditions: z.array(AiVisibilityConditionSchema),
  })
  .strict();

const ComponentInputSchema = z
  .object({
    id: NonEmptyString.optional(),
    type: NonEmptyString,
    config: z.record(z.string(), z.unknown()),
    visibility: AiVisibilityRuleSchema.nullable().optional(),
  })
  .strict();

const AddComponentTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('zone'), zone: z.literal('kpi') }).strict(),
  z.object({ kind: z.literal('section'), sectionId: NonEmptyString }).strict(),
]);

const MoveComponentTargetSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('zone'),
      zone: z.literal('kpi'),
      position: z.number().int(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('section'),
      sectionId: NonEmptyString,
      position: z.number().int(),
    })
    .strict(),
]);

const AddSectionTargetSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('rail'),
      rail: z.enum(['leftRail', 'rightRail']),
    })
    .strict(),
  z.object({ kind: z.literal('tab'), tabId: NonEmptyString }).strict(),
]);

export const AddComponentOpSchema = z
  .object({
    op: z.literal('add_component'),
    id: NonEmptyString,
    target: AddComponentTargetSchema,
    position: z.number().int(),
    component: ComponentInputSchema,
  })
  .strict();

export const RemoveComponentOpSchema = z
  .object({
    op: z.literal('remove_component'),
    id: NonEmptyString,
    componentId: NonEmptyString,
  })
  .strict();

export const MoveComponentOpSchema = z
  .object({
    op: z.literal('move_component'),
    id: NonEmptyString,
    componentId: NonEmptyString,
    to: MoveComponentTargetSchema,
  })
  .strict();

export const UpdateComponentConfigOpSchema = z
  .object({
    op: z.literal('update_component_config'),
    id: NonEmptyString,
    componentId: NonEmptyString,
    patch: z.record(z.string(), z.unknown()),
  })
  .strict();

const SectionTypeSchema = z.enum([
  'field_section',
  'related_list',
  'widget_section',
]);

export const AddSectionOpSchema = z
  .object({
    op: z.literal('add_section'),
    id: NonEmptyString,
    target: AddSectionTargetSchema,
    position: z.number().int(),
    section: z
      .object({
        id: NonEmptyString.optional(),
        type: SectionTypeSchema.optional(),
        label: NonEmptyString,
        columns: z.number().int().min(1).max(2),
        collapsed: z.boolean().optional(),
        components: z.array(ComponentInputSchema),
      })
      .strict(),
  })
  .strict();

export const RemoveSectionOpSchema = z
  .object({
    op: z.literal('remove_section'),
    id: NonEmptyString,
    sectionId: NonEmptyString,
  })
  .strict();

export const ReplaceSectionOpSchema = z
  .object({
    op: z.literal('replace_section'),
    id: NonEmptyString,
    sectionId: NonEmptyString,
    section: z
      .object({
        label: NonEmptyString.optional(),
        type: SectionTypeSchema.optional(),
        columns: z.number().int().min(1).max(2).optional(),
        collapsed: z.boolean().optional(),
        components: z.array(ComponentInputSchema),
      })
      .strict(),
  })
  .strict();

export const ReorderSectionOpSchema = z
  .object({
    op: z.literal('reorder_section'),
    id: NonEmptyString,
    sectionId: NonEmptyString,
    position: z.number().int(),
  })
  .strict();

export const AiEditOpSchema = z.discriminatedUnion('op', [
  AddComponentOpSchema,
  RemoveComponentOpSchema,
  MoveComponentOpSchema,
  UpdateComponentConfigOpSchema,
  AddSectionOpSchema,
  RemoveSectionOpSchema,
  ReplaceSectionOpSchema,
  ReorderSectionOpSchema,
]);

export const AiEditResponseSchema = z
  .object({
    summary: z.string(),
    ops: z.array(AiEditOpSchema),
    clarification: z.string().optional(),
  })
  .strict()
  .refine(
    (r) => !(r.clarification !== undefined && r.ops.length > 0),
    { message: 'clarification responses must have an empty ops list' },
  );

// Compile-time guard that schemas and TS interfaces stay in sync. If the
// schema starts producing a different shape, these assignments stop type-
// checking — much cheaper than a runtime drift in production.
type _AiEditOpFromSchema = z.infer<typeof AiEditOpSchema>;
type _AiEditResponseFromSchema = z.infer<typeof AiEditResponseSchema>;
const _opShapeCheck = (op: AiEditOp): _AiEditOpFromSchema => op;
const _opShapeCheckBack = (op: _AiEditOpFromSchema): AiEditOp => op;
const _responseShapeCheck = (r: AiEditResponse): _AiEditResponseFromSchema => r;
const _responseShapeCheckBack = (
  r: _AiEditResponseFromSchema,
): AiEditResponse => r;
void _opShapeCheck;
void _opShapeCheckBack;
void _responseShapeCheck;
void _responseShapeCheckBack;

// ─── applyOp reducer ───────────────────────────────────────────────────────
//
// `applyOp` is intentionally pure: it never mutates the input layout, and
// callers can safely accumulate state with `ops.reduce(applyOp, layout)`.
// All reference checks (componentId/sectionId/tabId existence, zone
// compatibility, registry membership) live in a separate validator — this
// reducer trusts that gates 2-4 from the contract have already passed.
// When the reducer encounters a missing reference it throws, so a buggy
// caller fails loudly rather than silently producing a corrupt layout.

const ID_PREFIX_COMPONENT = 'cmp_';
const ID_PREFIX_SECTION = 'sec_';

function generateId(prefix: string): string {
  // Prefer crypto.randomUUID where available (Node 20+, modern browsers).
  // Fall back to Math.random for environments that lack it.
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto && typeof g.crypto.randomUUID === 'function') {
    return prefix + g.crypto.randomUUID();
  }
  return prefix + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function ensureZones(layout: AiPageLayout): AiLayoutZones {
  return (
    layout.zones ?? {
      kpi: [],
      leftRail: [],
      rightRail: [],
    }
  );
}

function materialiseComponent(input: AiEditComponentInput): AiLayoutComponent {
  return {
    id: input.id ?? generateId(ID_PREFIX_COMPONENT),
    type: input.type,
    config: { ...input.config },
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
  };
}

function materialiseSection(
  input: AddSectionOp['section'],
): AiLayoutSection {
  // Default to `field_section` so the post-apply BE validator
  // (validateSection in pageLayoutService) accepts the layout. Without a
  // type it rejects every AI-added section.
  return {
    id: input.id ?? generateId(ID_PREFIX_SECTION),
    type: input.type ?? DEFAULT_SECTION_TYPE,
    label: input.label,
    columns: input.columns,
    ...(input.collapsed !== undefined ? { collapsed: input.collapsed } : {}),
    components: input.components.map(materialiseComponent),
  };
}

function insertAt<T>(arr: readonly T[], position: number, item: T): T[] {
  if (position < 0 || position > arr.length) {
    return [...arr, item];
  }
  const out = arr.slice();
  out.splice(position, 0, item);
  return out;
}

function moveTo<T>(arr: readonly T[], fromIndex: number, position: number): T[] {
  const out = arr.slice();
  const [item] = out.splice(fromIndex, 1);
  const insertAt = position < 0 || position > out.length ? out.length : position;
  out.splice(insertAt, 0, item);
  return out;
}

interface ComponentLocation {
  kind: 'zone' | 'leftRail' | 'rightRail' | 'tab';
  /** Index in zones.kpi for kind='zone'; otherwise the section index. */
  containerIndex: number;
  /** Tab index when kind='tab'. */
  tabIndex?: number;
  componentIndex: number;
}

function findComponent(
  layout: AiPageLayout,
  componentId: string,
): ComponentLocation | null {
  const zones = ensureZones(layout);

  const kpiIdx = zones.kpi.findIndex((c) => c.id === componentId);
  if (kpiIdx !== -1) {
    return { kind: 'zone', containerIndex: kpiIdx, componentIndex: kpiIdx };
  }

  for (const railName of ['leftRail', 'rightRail'] as const) {
    const rail = zones[railName];
    for (let s = 0; s < rail.length; s++) {
      const idx = rail[s].components.findIndex((c) => c.id === componentId);
      if (idx !== -1) {
        return { kind: railName, containerIndex: s, componentIndex: idx };
      }
    }
  }

  for (let t = 0; t < layout.tabs.length; t++) {
    const sections = layout.tabs[t].sections;
    for (let s = 0; s < sections.length; s++) {
      const idx = sections[s].components.findIndex((c) => c.id === componentId);
      if (idx !== -1) {
        return {
          kind: 'tab',
          containerIndex: s,
          tabIndex: t,
          componentIndex: idx,
        };
      }
    }
  }

  return null;
}

interface SectionLocation {
  kind: 'leftRail' | 'rightRail' | 'tab';
  /** Tab index when kind='tab'. */
  tabIndex?: number;
  sectionIndex: number;
}

function findSection(layout: AiPageLayout, sectionId: string): SectionLocation | null {
  const zones = ensureZones(layout);

  for (const railName of ['leftRail', 'rightRail'] as const) {
    const idx = zones[railName].findIndex((s) => s.id === sectionId);
    if (idx !== -1) return { kind: railName, sectionIndex: idx };
  }

  for (let t = 0; t < layout.tabs.length; t++) {
    const idx = layout.tabs[t].sections.findIndex((s) => s.id === sectionId);
    if (idx !== -1) return { kind: 'tab', tabIndex: t, sectionIndex: idx };
  }

  return null;
}

function withZones(layout: AiPageLayout, zones: AiLayoutZones): AiPageLayout {
  return { ...layout, zones };
}

function updateSection(
  layout: AiPageLayout,
  loc: SectionLocation,
  update: (section: AiLayoutSection) => AiLayoutSection,
): AiPageLayout {
  if (loc.kind === 'tab') {
    const tabIndex = loc.tabIndex!;
    const tabs = layout.tabs.slice();
    const sections = tabs[tabIndex].sections.slice();
    sections[loc.sectionIndex] = update(sections[loc.sectionIndex]);
    tabs[tabIndex] = { ...tabs[tabIndex], sections };
    return { ...layout, tabs };
  }

  const zones = ensureZones(layout);
  const rail = zones[loc.kind].slice();
  rail[loc.sectionIndex] = update(rail[loc.sectionIndex]);
  return withZones(layout, { ...zones, [loc.kind]: rail });
}

function removeSectionAt(layout: AiPageLayout, loc: SectionLocation): AiPageLayout {
  if (loc.kind === 'tab') {
    const tabIndex = loc.tabIndex!;
    const tabs = layout.tabs.slice();
    const sections = tabs[tabIndex].sections.slice();
    sections.splice(loc.sectionIndex, 1);
    tabs[tabIndex] = { ...tabs[tabIndex], sections };
    return { ...layout, tabs };
  }

  const zones = ensureZones(layout);
  const rail = zones[loc.kind].slice();
  rail.splice(loc.sectionIndex, 1);
  return withZones(layout, { ...zones, [loc.kind]: rail });
}

function applyAddComponent(
  layout: AiPageLayout,
  op: AddComponentOp,
): AiPageLayout {
  const component = materialiseComponent(op.component);

  if (op.target.kind === 'zone') {
    const zones = ensureZones(layout);
    return withZones(layout, {
      ...zones,
      kpi: insertAt(zones.kpi, op.position, component),
    });
  }

  const sectionLoc = findSection(layout, op.target.sectionId);
  if (!sectionLoc) {
    throw new Error(
      `applyOp(add_component): section "${op.target.sectionId}" not found`,
    );
  }
  return updateSection(layout, sectionLoc, (section) => ({
    ...section,
    components: insertAt(section.components, op.position, component),
  }));
}

function applyRemoveComponent(
  layout: AiPageLayout,
  op: RemoveComponentOp,
): AiPageLayout {
  const loc = findComponent(layout, op.componentId);
  if (!loc) {
    throw new Error(
      `applyOp(remove_component): component "${op.componentId}" not found`,
    );
  }

  if (loc.kind === 'zone') {
    const zones = ensureZones(layout);
    const kpi = zones.kpi.slice();
    kpi.splice(loc.componentIndex, 1);
    return withZones(layout, { ...zones, kpi });
  }

  if (loc.kind === 'tab') {
    return updateSection(
      layout,
      { kind: 'tab', tabIndex: loc.tabIndex, sectionIndex: loc.containerIndex },
      (section) => {
        const components = section.components.slice();
        components.splice(loc.componentIndex, 1);
        return { ...section, components };
      },
    );
  }

  return updateSection(
    layout,
    { kind: loc.kind, sectionIndex: loc.containerIndex },
    (section) => {
      const components = section.components.slice();
      components.splice(loc.componentIndex, 1);
      return { ...section, components };
    },
  );
}

function applyMoveComponent(
  layout: AiPageLayout,
  op: MoveComponentOp,
): AiPageLayout {
  const loc = findComponent(layout, op.componentId);
  if (!loc) {
    throw new Error(
      `applyOp(move_component): component "${op.componentId}" not found`,
    );
  }

  // Pull the component out without mutating the input.
  let component: AiLayoutComponent;
  let intermediate: AiPageLayout;
  if (loc.kind === 'zone') {
    const zones = ensureZones(layout);
    component = zones.kpi[loc.componentIndex];
    const kpi = zones.kpi.slice();
    kpi.splice(loc.componentIndex, 1);
    intermediate = withZones(layout, { ...zones, kpi });
  } else if (loc.kind === 'tab') {
    const sectionLoc: SectionLocation = {
      kind: 'tab',
      tabIndex: loc.tabIndex,
      sectionIndex: loc.containerIndex,
    };
    const section =
      layout.tabs[loc.tabIndex!].sections[loc.containerIndex];
    component = section.components[loc.componentIndex];
    intermediate = updateSection(layout, sectionLoc, (s) => {
      const components = s.components.slice();
      components.splice(loc.componentIndex, 1);
      return { ...s, components };
    });
  } else {
    const railName = loc.kind;
    const sectionLoc: SectionLocation = {
      kind: railName,
      sectionIndex: loc.containerIndex,
    };
    const zones = ensureZones(layout);
    component = zones[railName][loc.containerIndex].components[loc.componentIndex];
    intermediate = updateSection(layout, sectionLoc, (s) => {
      const components = s.components.slice();
      components.splice(loc.componentIndex, 1);
      return { ...s, components };
    });
  }

  // Insert at the new location.
  if (op.to.kind === 'zone') {
    const zones = ensureZones(intermediate);
    return withZones(intermediate, {
      ...zones,
      kpi: insertAt(zones.kpi, op.to.position, component),
    });
  }

  const targetLoc = findSection(intermediate, op.to.sectionId);
  if (!targetLoc) {
    throw new Error(
      `applyOp(move_component): target section "${op.to.sectionId}" not found`,
    );
  }
  return updateSection(intermediate, targetLoc, (section) => ({
    ...section,
    components: insertAt(section.components, op.to.position, component),
  }));
}

function applyUpdateComponentConfig(
  layout: AiPageLayout,
  op: UpdateComponentConfigOp,
): AiPageLayout {
  const loc = findComponent(layout, op.componentId);
  if (!loc) {
    throw new Error(
      `applyOp(update_component_config): component "${op.componentId}" not found`,
    );
  }

  const merge = (existing: AiLayoutComponent): AiLayoutComponent => {
    const config = { ...existing.config };
    for (const [key, value] of Object.entries(op.patch)) {
      if (value === null) {
        delete config[key];
      } else {
        config[key] = value;
      }
    }
    return { ...existing, config };
  };

  if (loc.kind === 'zone') {
    const zones = ensureZones(layout);
    const kpi = zones.kpi.slice();
    kpi[loc.componentIndex] = merge(kpi[loc.componentIndex]);
    return withZones(layout, { ...zones, kpi });
  }

  const sectionLoc: SectionLocation =
    loc.kind === 'tab'
      ? { kind: 'tab', tabIndex: loc.tabIndex, sectionIndex: loc.containerIndex }
      : { kind: loc.kind, sectionIndex: loc.containerIndex };

  return updateSection(layout, sectionLoc, (section) => {
    const components = section.components.slice();
    components[loc.componentIndex] = merge(components[loc.componentIndex]);
    return { ...section, components };
  });
}

function applyAddSection(layout: AiPageLayout, op: AddSectionOp): AiPageLayout {
  const section = materialiseSection(op.section);

  if (op.target.kind === 'rail') {
    const zones = ensureZones(layout);
    return withZones(layout, {
      ...zones,
      [op.target.rail]: insertAt(zones[op.target.rail], op.position, section),
    });
  }

  const tabId = op.target.tabId;
  const tabIndex = layout.tabs.findIndex((t) => t.id === tabId);
  if (tabIndex === -1) {
    throw new Error(`applyOp(add_section): tab "${tabId}" not found`);
  }
  const tabs = layout.tabs.slice();
  tabs[tabIndex] = {
    ...tabs[tabIndex],
    sections: insertAt(tabs[tabIndex].sections, op.position, section),
  };
  return { ...layout, tabs };
}

function applyRemoveSection(
  layout: AiPageLayout,
  op: RemoveSectionOp,
): AiPageLayout {
  const loc = findSection(layout, op.sectionId);
  if (!loc) {
    throw new Error(
      `applyOp(remove_section): section "${op.sectionId}" not found`,
    );
  }
  return removeSectionAt(layout, loc);
}

function applyReplaceSection(
  layout: AiPageLayout,
  op: ReplaceSectionOp,
): AiPageLayout {
  const loc = findSection(layout, op.sectionId);
  if (!loc) {
    throw new Error(
      `applyOp(replace_section): section "${op.sectionId}" not found`,
    );
  }
  return updateSection(layout, loc, (existing) => ({
    ...existing,
    ...(op.section.label !== undefined ? { label: op.section.label } : {}),
    ...(op.section.type !== undefined ? { type: op.section.type } : {}),
    ...(op.section.columns !== undefined ? { columns: op.section.columns } : {}),
    ...(op.section.collapsed !== undefined
      ? { collapsed: op.section.collapsed }
      : {}),
    components: op.section.components.map(materialiseComponent),
  }));
}

function applyReorderSection(
  layout: AiPageLayout,
  op: ReorderSectionOp,
): AiPageLayout {
  const loc = findSection(layout, op.sectionId);
  if (!loc) {
    throw new Error(
      `applyOp(reorder_section): section "${op.sectionId}" not found`,
    );
  }

  if (loc.kind === 'tab') {
    const tabIndex = loc.tabIndex!;
    const tabs = layout.tabs.slice();
    tabs[tabIndex] = {
      ...tabs[tabIndex],
      sections: moveTo(tabs[tabIndex].sections, loc.sectionIndex, op.position),
    };
    return { ...layout, tabs };
  }

  const zones = ensureZones(layout);
  return withZones(layout, {
    ...zones,
    [loc.kind]: moveTo(zones[loc.kind], loc.sectionIndex, op.position),
  });
}

export function applyOp(layout: AiPageLayout, op: AiEditOp): AiPageLayout {
  switch (op.op) {
    case 'add_component':
      return applyAddComponent(layout, op);
    case 'remove_component':
      return applyRemoveComponent(layout, op);
    case 'move_component':
      return applyMoveComponent(layout, op);
    case 'update_component_config':
      return applyUpdateComponentConfig(layout, op);
    case 'add_section':
      return applyAddSection(layout, op);
    case 'remove_section':
      return applyRemoveSection(layout, op);
    case 'replace_section':
      return applyReplaceSection(layout, op);
    case 'reorder_section':
      return applyReorderSection(layout, op);
  }
}
