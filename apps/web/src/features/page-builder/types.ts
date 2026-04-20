import type { FieldRef } from '../../components/builderTypes.js';

export interface ObjectDefinitionDetail {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  description?: string;
  icon?: string;
  isSystem: boolean;
  fields: FieldRef[];
}

export interface RelationshipApiItem {
  id: string;
  sourceObjectId: string;
  targetObjectId: string;
  relationshipType: string;
  apiName: string;
  label: string;
  reverseLabel?: string;
  required: boolean;
  targetObjectLabel: string;
  targetObjectPluralLabel: string;
  targetObjectApiName: string;
  sourceObjectApiName: string;
  sourceObjectLabel: string;
  sourceObjectPluralLabel: string;
}

export interface RelatedObjectFields {
  id: string;
  apiName: string;
  label: string;
  fields: FieldRef[];
}
