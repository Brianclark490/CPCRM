// ─── Page Layout type system ──────────────────────────────────────────────────
// These interfaces describe the metadata-driven page layout structure.
// A PageLayout defines how a record detail page renders: header, tabs, sections,
// and individual components (fields, related lists, widgets).

export interface VisibilityCondition {
  field: string;
  op:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_empty'
    | 'empty'
    | 'greater_than'
    | 'less_than'
    | 'in'
    | 'not_in';
  value?: unknown;
}

export interface VisibilityRule {
  operator: 'AND' | 'OR';
  conditions: VisibilityCondition[];
}

export interface LayoutComponentConfig {
  fieldApiName?: string;
  relationshipId?: string;
  span?: number;
  [key: string]: unknown;
}

export interface LayoutComponentDef {
  id: string;
  type: string;
  config: LayoutComponentConfig;
  visibility?: VisibilityRule | null;
}

export interface LayoutSectionDef {
  id: string;
  label: string;
  columns: number;
  collapsed?: boolean;
  visibility?: VisibilityRule | null;
  components: LayoutComponentDef[];
}

export interface LayoutTab {
  id: string;
  label: string;
  sections: LayoutSectionDef[];
}

export interface HeaderConfig {
  primaryField: string;
  secondaryFields: string[];
}

export interface PageLayout {
  id: string;
  objectId: string;
  name: string;
  header: HeaderConfig;
  tabs: LayoutTab[];
}

export interface FieldDefinitionRef {
  id?: string;
  apiName: string;
  label: string;
  fieldType: string;
  required?: boolean;
  options?: Record<string, unknown>;
}

export interface ObjectDefinitionRef {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  isSystem: boolean;
}

export interface RelatedRecordRef {
  id: string;
  name: string;
  fieldValues: Record<string, unknown>;
}

export interface RelationshipRef {
  relationshipId: string;
  label: string;
  reverseLabel?: string;
  relationshipType: string;
  direction: 'source' | 'target';
  relatedObjectApiName: string;
  records: RelatedRecordRef[];
}

export interface RecordData {
  id: string;
  objectId: string;
  name: string;
  fieldValues: Record<string, unknown>;
  ownerId: string;
  ownerName?: string;
  updatedBy?: string;
  updatedByName?: string;
  createdAt: string;
  updatedAt: string;
  fields: FieldDefinitionRef[];
  relationships: RelationshipRef[];
}

export interface ComponentRendererProps {
  component: LayoutComponentDef;
  record: RecordData;
  fields: FieldDefinitionRef[];
  objectDef: ObjectDefinitionRef | null;
}
