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
 * - **allowedZones**  – optional whitelist of zones where the component may be
 *                       placed.  Omitted = allowed everywhere (backwards compat).
 *                       Zones: 'kpi', 'leftRail', 'rightRail', 'main'.
 * - **configSchema**  – JSON-Schema-like description of the `config` object
 * - **defaultConfig** – sensible defaults applied when a component is first added
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComponentCategory = 'fields' | 'layout' | 'related' | 'widgets';

/** Zones referenced by `allowedZones`. 'main' = inside a tab's section. */
export type ComponentZone = 'kpi' | 'leftRail' | 'rightRail' | 'main';

export const ALL_ZONES: readonly ComponentZone[] = ['kpi', 'leftRail', 'rightRail', 'main'];

export interface ComponentDefinition {
  type: string;
  label: string;
  icon: string;
  category: ComponentCategory;
  allowedZones?: readonly ComponentZone[];
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
    allowedZones: ['leftRail', 'rightRail', 'main'],
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
    allowedZones: ['leftRail', 'rightRail', 'main'],
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
    allowedZones: ['leftRail', 'rightRail', 'main'],
    configSchema: {
      limit: { type: 'number', description: 'Max activity items to display' },
      types: {
        type: 'array',
        items: 'string',
        description: 'Activity types to include (e.g. replied, call, edit, note, meeting)',
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

  // ── Layout components ───────────────────────────────────────────────────────
  {
    type: 'blank_space',
    label: 'Blank Space',
    icon: 'square',
    category: 'layout',
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
 * Returns true if a component type is allowed in the given zone.
 * Components that do not declare `allowedZones` are permitted in any zone.
 * Unknown component types return false — caller should separately check
 * `VALID_COMPONENT_TYPES` for a clearer error message.
 */
export function isComponentAllowedInZone(type: string, zone: ComponentZone): boolean {
  const def = getComponentDefinition(type);
  if (!def) return false;
  if (!def.allowedZones) return true;
  return def.allowedZones.includes(zone);
}
