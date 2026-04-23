/**
 * Component registry — the single source of truth for all component types
 * available in page layouts.
 *
 * Both the backend (for validation) and the frontend (for the builder palette)
 * reference this registry.  Each entry describes:
 *
 * - **type**          – unique key used in layout JSON (`component.type`)
 * - **label / icon**  – display metadata for the builder palette
 * - **category**      – grouping in the palette sidebar
 * - **allowedZones**  – whitelist of zones where the component may be placed.
 *                       Zones: 'header', 'kpi', 'leftRail', 'main', 'rightRail'.
 * - **configSchema**  – JSON-Schema-like description of the `config` object
 * - **defaultConfig** – sensible defaults applied when a component is first added
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComponentCategory = 'fields' | 'layout' | 'related' | 'widgets';

export type LayoutZone = 'header' | 'kpi' | 'leftRail' | 'main' | 'rightRail';

export const ALL_ZONES: readonly LayoutZone[] = [
  'header',
  'kpi',
  'leftRail',
  'main',
  'rightRail',
];

export interface ComponentDefinition {
  type: string;
  label: string;
  icon: string;
  category: ComponentCategory;
  /**
   * Zones where this component type is allowed.  Enforced by the layout
   * validator on the backend and surfaced to the builder palette so the
   * client can hide components that don't fit the active zone.
   */
  allowedZones: readonly LayoutZone[];
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const COMPONENT_REGISTRY: readonly ComponentDefinition[] = [
  // ── Field components ────────────────────────────────────────────────────────
  {
    type: 'field',
    label: 'Field',
    icon: 'text-cursor',
    category: 'fields',
    allowedZones: ['leftRail', 'main', 'rightRail'],
    configSchema: {
      fieldId: { type: 'string', required: true, description: 'UUID of the field definition' },
      span: { type: 'number', description: 'Number of grid columns to span (default 1)' },
      readOnly: { type: 'boolean', description: 'Render as read-only' },
    },
    defaultConfig: { fieldId: '', span: 1, readOnly: false },
  },

  // ── Related data components ─────────────────────────────────────────────────
  {
    type: 'related_list',
    label: 'Related List',
    icon: 'list',
    category: 'related',
    allowedZones: ['main', 'rightRail'],
    configSchema: {
      relationshipId: { type: 'string', required: true, description: 'UUID of the relationship definition' },
      displayFields: { type: 'array', items: 'string', description: 'Field api_names to show as columns' },
      limit: { type: 'number', description: 'Max rows to display' },
      allowCreate: { type: 'boolean', description: 'Show inline "New" button' },
    },
    defaultConfig: { relationshipId: '', displayFields: [], limit: 5, allowCreate: true },
  },

  // ── Rail palette (issue #518) ───────────────────────────────────────────────
  // Bread-and-butter components for the leftRail / rightRail zones.  Also
  // allowed in the main zone (inside tab sections).
  {
    type: 'identity',
    label: 'Identity',
    icon: 'id-card',
    category: 'widgets',
    allowedZones: ['leftRail', 'main', 'rightRail'],
    configSchema: {
      fields: {
        type: 'array',
        items: 'string',
        description: 'Field api_names to show as label/value rows',
      },
    },
    defaultConfig: { fields: [] },
  },
  {
    type: 'contacts',
    label: 'Contacts',
    icon: 'users',
    category: 'widgets',
    allowedZones: ['leftRail', 'main', 'rightRail'],
    configSchema: {
      relationshipId: {
        type: 'string',
        required: true,
        description: 'UUID of the relationship to the contact object',
      },
      limit: { type: 'number', description: 'Max contacts to display' },
    },
    defaultConfig: { relationshipId: '', limit: 5 },
  },
  {
    type: 'activity',
    label: 'Activity Feed',
    icon: 'activity',
    category: 'widgets',
    allowedZones: ['leftRail', 'main', 'rightRail'],
    configSchema: {
      limit: { type: 'number', description: 'Max activity items to display' },
      types: {
        type: 'array',
        items: 'string',
        description: 'Activity types to include (supported values: opportunity, account, system, user)',
      },
    },
    defaultConfig: { limit: 20, types: [] },
  },

  // ── Widget components ───────────────────────────────────────────────────────
  {
    type: 'activity_timeline',
    label: 'Activity Timeline',
    icon: 'clock',
    category: 'widgets',
    allowedZones: ['main', 'rightRail'],
    configSchema: {
      showFilters: { type: 'boolean', description: 'Show activity type filter controls' },
      limit: { type: 'number', description: 'Number of activities to load initially' },
    },
    defaultConfig: { showFilters: true, limit: 20 },
  },
  {
    type: 'sales_targets',
    label: 'Sales Targets',
    icon: 'target',
    category: 'widgets',
    allowedZones: ['main', 'rightRail'],
    configSchema: {
      showBusinessTarget: { type: 'boolean', description: 'Show business-level target progress bar' },
      showTeamTargets: { type: 'boolean', description: 'Show team-level target progress bars' },
      showUserTargets: { type: 'boolean', description: 'Show user-level target progress bars' },
      enableDrillDown: { type: 'boolean', description: 'Allow drill-down from business → team → user' },
      periodType: { type: 'string', description: 'Default period type: monthly, quarterly, annual' },
    },
    defaultConfig: {
      showBusinessTarget: true,
      showTeamTargets: true,
      showUserTargets: true,
      enableDrillDown: true,
      periodType: 'quarterly',
    },
  },
  {
    type: 'metric',
    label: 'Metric Card',
    icon: 'gauge',
    category: 'widgets',
    allowedZones: ['kpi'],
    configSchema: {
      label: { type: 'string', required: true, description: 'Display label (e.g. "pipeline.open")' },
      source: {
        type: 'object',
        required: true,
        description:
          'Value source — `{ kind: "field", fieldApiName }` or `{ kind: "aggregate", expr }`',
      },
      format: {
        type: 'string',
        description: 'Display format: currency, number, percent, duration',
      },
      target: {
        type: 'object',
        description:
          'Optional target for progress bar — `{ kind: "field", fieldApiName }` or `{ kind: "literal", value }`',
      },
      accent: {
        type: 'string',
        description: 'Visual accent: default, success, warning, danger',
      },
    },
    defaultConfig: {
      label: '',
      source: { kind: 'field', fieldApiName: '' },
      format: 'number',
      accent: 'default',
    },
  },

  // ── Layout components ───────────────────────────────────────────────────────
  {
    type: 'blank_space',
    label: 'Blank Space',
    icon: 'square',
    category: 'layout',
    allowedZones: ['leftRail', 'main', 'rightRail'],
    configSchema: {
      height: { type: 'number', description: 'Height in pixels' },
    },
    defaultConfig: { height: 24 },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Set of all valid component type strings. Used for fast validation.
 */
export const VALID_COMPONENT_TYPES: ReadonlySet<string> = new Set(
  COMPONENT_REGISTRY.map((c) => c.type),
);

/**
 * Returns the component definition for a given type, or undefined if the
 * type is not registered.
 */
export function getComponentDefinition(type: string): ComponentDefinition | undefined {
  return COMPONENT_REGISTRY.find((c) => c.type === type);
}

/**
 * Returns true when the given component type is permitted in the given zone,
 * false when it is not or the type is unknown.
 */
export function isComponentAllowedInZone(type: string, zone: LayoutZone): boolean {
  const def = getComponentDefinition(type);
  if (!def) return false;
  return def.allowedZones.includes(zone);
}
