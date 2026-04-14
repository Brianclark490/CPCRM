/**
 * Kysely Database Schema Types
 *
 * Generated manually from migrations 001-025.
 * In production, these would be generated with kysely-codegen from a live database.
 */

import type { ColumnType } from 'kysely';

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

// Enums
export type TenantStatus = 'active' | 'suspended' | 'inactive';
export type TenantRole = 'owner' | 'admin' | 'member';

export interface Tenants {
  id: Generated<string>;
  name: string;
  slug: string;
  status: TenantStatus;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface Organisations {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface TenantMemberships {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  organisation_id: string | null;
  role: TenantRole;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface ObjectDefinitions {
  id: Generated<string>;
  tenant_id: string;
  api_name: string;
  label: string;
  plural_label: string;
  is_system: boolean;
  icon: string | null;
  name_field_id: string | null;
  name_template: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface FieldDefinitions {
  id: Generated<string>;
  object_id: string;
  tenant_id: string;
  api_name: string;
  label: string;
  field_type: string;
  required: boolean;
  options: ColumnType<Record<string, unknown>, string, string>;
  sort_order: number;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface Records {
  id: Generated<string>;
  object_id: string;
  tenant_id: string;
  name: string;
  field_values: ColumnType<Record<string, unknown>, string, string>;
  owner_id: string;
  owner_record_id: string | null;
  updated_by: string | null;
  updated_by_record_id: string | null;
  pipeline_id: string | null;
  current_stage_id: string | null;
  stage_entered_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface RecordRelationships {
  id: Generated<string>;
  relationship_id: string;
  source_record_id: string;
  target_record_id: string;
  created_at: Generated<Timestamp>;
}

export interface RelationshipDefinitions {
  id: Generated<string>;
  tenant_id: string;
  source_object_id: string;
  target_object_id: string;
  api_name: string;
  label: string;
  reverse_label: string | null;
  relationship_type: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface PipelineDefinitions {
  id: Generated<string>;
  tenant_id: string;
  object_id: string;
  name: string;
  api_name: string;
  description: string | null;
  is_default: boolean;
  is_system: boolean;
  owner_id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface StageDefinitions {
  id: Generated<string>;
  tenant_id: string;
  pipeline_id: string;
  name: string;
  api_name: string;
  sort_order: number;
  stage_type: string;
  colour: string;
  default_probability: number | null;
  expected_days: number | null;
  description: string | null;
  created_at: Generated<Timestamp>;
}

export interface StageGates {
  id: Generated<string>;
  stage_id: string;
  field_id: string;
  gate_type: string;
  gate_value: string | null;
  error_message: string | null;
}

export interface StageHistory {
  id: Generated<string>;
  tenant_id: string;
  record_id: string;
  pipeline_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  changed_by: string;
  changed_at: Generated<Timestamp>;
  days_in_previous_stage: number | null;
}

export interface LayoutDefinitions {
  id: Generated<string>;
  tenant_id: string;
  object_id: string;
  layout_type: string;
  name: string;
  is_default: boolean;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface LayoutFields {
  id: Generated<string>;
  layout_id: string;
  field_id: string;
  sort_order: number;
  is_visible: boolean;
  is_required: boolean | null;
  created_at: Generated<Timestamp>;
}

export interface PageLayouts {
  id: Generated<string>;
  tenant_id: string;
  object_id: string;
  name: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface PageLayoutVersions {
  id: Generated<string>;
  page_layout_id: string;
  version_number: number;
  layout_json: ColumnType<Record<string, unknown>, string, string>;
  status: string;
  published_at: Timestamp | null;
  created_by: string;
  created_at: Generated<Timestamp>;
}

export interface ObjectPermissions {
  id: Generated<string>;
  tenant_id: string;
  object_id: string;
  role_name: string;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface Teams {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface TeamMembers {
  id: Generated<string>;
  team_id: string;
  user_id: string;
  added_at: Generated<Timestamp>;
}

export interface UserProfiles {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  email: string;
  name: string;
  record_id: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

// Database interface
export interface Database {
  tenants: Tenants;
  organisations: Organisations;
  tenant_memberships: TenantMemberships;
  object_definitions: ObjectDefinitions;
  field_definitions: FieldDefinitions;
  records: Records;
  record_relationships: RecordRelationships;
  relationship_definitions: RelationshipDefinitions;
  pipeline_definitions: PipelineDefinitions;
  stage_definitions: StageDefinitions;
  stage_gates: StageGates;
  stage_history: StageHistory;
  layout_definitions: LayoutDefinitions;
  layout_fields: LayoutFields;
  page_layouts: PageLayouts;
  page_layout_versions: PageLayoutVersions;
  object_permissions: ObjectPermissions;
  teams: Teams;
  team_members: TeamMembers;
  user_profiles: UserProfiles;
}
