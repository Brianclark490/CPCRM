export interface FieldDefinition {
  id: string;
  objectId: string;
  apiName: string;
  label: string;
  fieldType: string;
  description?: string;
  required: boolean;
  defaultValue?: string;
  options: Record<string, unknown>;
  sortOrder: number;
  isSystem: boolean;
}

export interface RelationshipDefinition {
  id: string;
  sourceObjectId: string;
  targetObjectId: string;
  relationshipType: string;
  apiName: string;
  label: string;
  reverseLabel?: string;
  required: boolean;
  createdAt: string;
  sourceObjectLabel: string;
  sourceObjectPluralLabel: string;
  targetObjectLabel: string;
  targetObjectPluralLabel: string;
}

export interface ObjectDefinitionListItem {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  isSystem: boolean;
}

export interface RelationshipForm {
  targetObjectId: string;
  relationshipType: string;
  label: string;
  reverseLabel: string;
  required: boolean;
}

export interface ObjectDefinitionDetail {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  description?: string;
  icon?: string;
  isSystem: boolean;
  fields: FieldDefinition[];
  relationships: unknown[];
  layouts: unknown[];
}

export interface FieldForm {
  label: string;
  apiName: string;
  fieldType: string;
  description: string;
  required: boolean;
  defaultValue: string;
  choices: string[];
  min: string;
  max: string;
  precision: string;
  maxLength: string;
  expression: string;
  outputType: string;
}

export interface ApiError {
  error: string;
}

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

export type TabName = 'fields' | 'relationships' | 'page_layout';
