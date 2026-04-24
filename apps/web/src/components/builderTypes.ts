// ─── Builder type system ──────────────────────────────────────────────────────
// Shared types for the drag-and-drop page layout builder.

import type {
  VisibilityRule,
  LayoutComponentConfig,
  HeaderConfig,
} from './layoutTypes.js';

// ─── Component registry (from API) ───────────────────────────────────────────

export type ComponentCategory = 'fields' | 'layout' | 'related' | 'widgets';

export type LayoutZone = 'header' | 'kpi' | 'leftRail' | 'main' | 'rightRail';

export interface ComponentDefinition {
  type: string;
  label: string;
  icon: string;
  category: ComponentCategory;
  /**
   * Zones in which this component is valid. Older API responses may omit
   * this — consumers should treat `undefined` as "no restriction" so the
   * legacy registry keeps working until the API is redeployed.
   */
  allowedZones?: readonly LayoutZone[];
  configSchema: Record<string, ConfigSchemaEntry>;
  defaultConfig: Record<string, unknown>;
}

export interface ConfigSchemaEntry {
  type: string;
  required?: boolean;
  description?: string;
  items?: string;
}

// ─── Builder layout state ─────────────────────────────────────────────────────

export interface BuilderComponent {
  id: string;
  type: string;
  config: LayoutComponentConfig;
  visibility?: VisibilityRule | null;
}

export interface BuilderSection {
  id: string;
  type: string;
  label: string;
  columns: number;
  collapsed?: boolean;
  visibility?: VisibilityRule | null;
  components: BuilderComponent[];
}

export interface BuilderTab {
  id: string;
  label: string;
  sections: BuilderSection[];
}

// KPI is a flat list of components (cards). Rails are vertical stacks of
// sections. Matches the runtime `LayoutZones` / API `PageLayoutZones`.
export interface BuilderZones {
  kpi: BuilderComponent[];
  leftRail: BuilderSection[];
  rightRail: BuilderSection[];
}

export interface BuilderLayout {
  id: string;
  objectId: string;
  name: string;
  header: HeaderConfig;
  zones: BuilderZones;
  tabs: BuilderTab[];
}

// ─── Field & relationship refs ────────────────────────────────────────────────

export interface FieldRef {
  id: string;
  apiName: string;
  label: string;
  fieldType: string;
  required?: boolean;
}

export interface RelationshipRef {
  id: string;
  label: string;
  displayLabel: string;
  apiName: string;
  relationshipType: string;
  targetObjectLabel: string;
}

export interface RelatedFieldRef {
  relationshipId: string;
  relationshipApiName: string;
  relationshipLabel: string;
  relatedObjectApiName: string;
  relatedObjectLabel: string;
  fieldId: string;
  fieldApiName: string;
  fieldLabel: string;
  fieldType: string;
}

// ─── Drag-and-drop item data ──────────────────────────────────────────────────

export interface PaletteDragData {
  origin: 'palette';
  componentType: string;
  defaultConfig: Record<string, unknown>;
}

export interface CanvasComponentDragData {
  origin: 'canvas';
  sectionId: string;
  componentId: string;
}

export interface CanvasSectionDragData {
  origin: 'canvas-section';
  sectionId: string;
}

export interface TabDropTargetData {
  origin: 'tab-drop-target';
  tabId: string;
}

// Drop target for a whole zone (KPI strip or a rail).
export interface ZoneDropTargetData {
  origin: 'zone';
  zone: Exclude<LayoutZone, 'header' | 'main'>;
}

export type DragData =
  | PaletteDragData
  | CanvasComponentDragData
  | CanvasSectionDragData
  | TabDropTargetData
  | ZoneDropTargetData;

// ─── Page layout API shapes ──────────────────────────────────────────────────

export interface PageLayoutListItem {
  id: string;
  objectId: string;
  name: string;
  role: string | null;
  isDefault: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PageLayoutDetail extends PageLayoutListItem {
  layout: BuilderLayout | null;
  publishedLayout: BuilderLayout | null;
}
