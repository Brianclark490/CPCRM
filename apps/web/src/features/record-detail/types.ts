export interface ObjectDefinition {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  isSystem: boolean;
}

export interface RecordField {
  apiName: string;
  label: string;
  fieldType: string;
  value: unknown;
  options?: Record<string, unknown>;
}

export interface RelatedRecord {
  id: string;
  name: string;
  fieldValues: Record<string, unknown>;
}

export interface Relationship {
  relationshipId: string;
  label: string;
  reverseLabel?: string;
  relationshipType: string;
  direction: 'source' | 'target';
  relatedObjectApiName: string;
  records: RelatedRecord[];
}

export interface RecordDetail {
  id: string;
  objectId: string;
  name: string;
  fieldValues: Record<string, unknown>;
  ownerId: string;
  ownerName?: string;
  ownerRecordId?: string;
  updatedBy?: string;
  updatedByName?: string;
  updatedByRecordId?: string;
  pipelineId?: string;
  currentStageId?: string;
  createdAt: string;
  updatedAt: string;
  fields: RecordField[];
  relationships: Relationship[];
}

export interface LayoutFieldWithMetadata {
  fieldId: string;
  fieldApiName: string;
  fieldLabel: string;
  fieldType: string;
  fieldRequired: boolean;
  fieldOptions: Record<string, unknown>;
  sortOrder: number;
  section: number;
  sectionLabel?: string;
  width: string;
}

export interface LayoutDefinition {
  id: string;
  objectId: string;
  name: string;
  layoutType: string;
  isDefault: boolean;
  fields: LayoutFieldWithMetadata[];
}

export interface LayoutListItem {
  id: string;
  objectId: string;
  name: string;
  layoutType: string;
  isDefault: boolean;
}

export interface LayoutSection {
  label: string;
  fields: LayoutFieldWithMetadata[];
}
