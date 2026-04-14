/**
 * Drizzle Schema Definition
 *
 * Manually defined from migrations 001-025.
 * In production, would use `drizzle-kit introspect` from a live database.
 */

import { pgTable, uuid, varchar, text, timestamp, boolean, integer, jsonb, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended', 'inactive']);
export const tenantRoleEnum = pgEnum('tenant_role', ['owner', 'admin', 'member']);

// ─── Tables ───────────────────────────────────────────────────────────────────

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: tenantStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  slugIdx: index('idx_tenants_slug').on(table.slug),
}));

export const organisations = pgTable('organisations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantIdIdx: index('idx_organisations_tenant_id').on(table.tenantId),
}));

export const tenantMemberships = pgTable('tenant_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  organisationId: uuid('organisation_id').references(() => organisations.id, { onDelete: 'set null' }),
  role: tenantRoleEnum('role').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantUserUnique: uniqueIndex('tenant_memberships_tenant_id_user_id_key').on(table.tenantId, table.userId),
  tenantIdIdx: index('idx_tenant_memberships_tenant_id').on(table.tenantId),
  userIdIdx: index('idx_tenant_memberships_user_id').on(table.userId),
}));

export const objectDefinitions = pgTable('object_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  apiName: varchar('api_name', { length: 100 }).notNull(),
  label: varchar('label', { length: 255 }).notNull(),
  pluralLabel: varchar('plural_label', { length: 255 }).notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  icon: varchar('icon', { length: 50 }),
  nameFieldId: uuid('name_field_id'),
  nameTemplate: text('name_template'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantApiNameUnique: uniqueIndex('object_definitions_tenant_id_api_name_key').on(table.tenantId, table.apiName),
  tenantIdIdx: index('idx_object_definitions_tenant_id').on(table.tenantId),
}));

export const fieldDefinitions = pgTable('field_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  objectId: uuid('object_id').notNull().references(() => objectDefinitions.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  apiName: varchar('api_name', { length: 100 }).notNull(),
  label: varchar('label', { length: 255 }).notNull(),
  fieldType: varchar('field_type', { length: 50 }).notNull(),
  required: boolean('required').notNull().default(false),
  options: jsonb('options').notNull().default({}),
  sortOrder: integer('sort_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  objectApiNameUnique: uniqueIndex('field_definitions_object_id_api_name_key').on(table.objectId, table.apiName),
  objectIdIdx: index('idx_field_definitions_object_id').on(table.objectId),
  tenantIdIdx: index('idx_field_definitions_tenant_id').on(table.tenantId),
}));

export const records = pgTable('records', {
  id: uuid('id').primaryKey().defaultRandom(),
  objectId: uuid('object_id').notNull().references(() => objectDefinitions.id, { onDelete: 'restrict' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 500 }).notNull(),
  fieldValues: jsonb('field_values').notNull().default({}),
  ownerId: varchar('owner_id', { length: 255 }).notNull(),
  ownerRecordId: uuid('owner_record_id'),
  updatedBy: varchar('updated_by', { length: 255 }),
  updatedByRecordId: uuid('updated_by_record_id'),
  pipelineId: uuid('pipeline_id'),
  currentStageId: uuid('current_stage_id'),
  stageEnteredAt: timestamp('stage_entered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  objectIdIdx: index('idx_records_object_id').on(table.objectId),
  ownerIdIdx: index('idx_records_owner_id').on(table.ownerId),
  objectOwnerIdx: index('idx_records_object_owner').on(table.objectId, table.ownerId),
  nameIdx: index('idx_records_name').on(table.name),
  tenantIdIdx: index('idx_records_tenant_id').on(table.tenantId),
  pipelineIdIdx: index('idx_records_pipeline_id').on(table.pipelineId),
  currentStageIdIdx: index('idx_records_current_stage_id').on(table.currentStageId),
  // GIN index on JSONB - Drizzle doesn't support GIN directly, would use raw SQL
}));

export const relationshipDefinitions = pgTable('relationship_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  sourceObjectId: uuid('source_object_id').notNull().references(() => objectDefinitions.id, { onDelete: 'cascade' }),
  targetObjectId: uuid('target_object_id').notNull().references(() => objectDefinitions.id, { onDelete: 'cascade' }),
  apiName: varchar('api_name', { length: 100 }).notNull(),
  label: varchar('label', { length: 255 }).notNull(),
  reverseLabel: varchar('reverse_label', { length: 255 }),
  relationshipType: varchar('relationship_type', { length: 50 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  sourceApiNameUnique: uniqueIndex('relationship_definitions_source_object_id_api_name_key').on(table.sourceObjectId, table.apiName),
  tenantIdIdx: index('idx_relationship_definitions_tenant_id').on(table.tenantId),
}));

export const recordRelationships = pgTable('record_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  relationshipId: uuid('relationship_id').notNull().references(() => relationshipDefinitions.id, { onDelete: 'cascade' }),
  sourceRecordId: uuid('source_record_id').notNull().references(() => records.id, { onDelete: 'cascade' }),
  targetRecordId: uuid('target_record_id').notNull().references(() => records.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  relSourceTargetUnique: uniqueIndex('record_relationships_relationship_id_source_record_id_targe_key').on(table.relationshipId, table.sourceRecordId, table.targetRecordId),
  sourceRecordIdIdx: index('idx_record_relationships_source_record_id').on(table.sourceRecordId),
  targetRecordIdIdx: index('idx_record_relationships_target_record_id').on(table.targetRecordId),
  relationshipIdIdx: index('idx_record_relationships_relationship_id').on(table.relationshipId),
}));

export const pipelineDefinitions = pgTable('pipeline_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  objectId: uuid('object_id').notNull().references(() => objectDefinitions.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  apiName: varchar('api_name', { length: 100 }).notNull().unique(),
  description: text('description'),
  isDefault: boolean('is_default').notNull().default(false),
  isSystem: boolean('is_system').notNull().default(false),
  ownerId: varchar('owner_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  objectApiNameUnique: uniqueIndex('pipeline_definitions_object_id_api_name_key').on(table.objectId, table.apiName),
  tenantIdIdx: index('idx_pipeline_definitions_tenant_id').on(table.tenantId),
}));

export const stageDefinitions = pgTable('stage_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  pipelineId: uuid('pipeline_id').notNull().references(() => pipelineDefinitions.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  apiName: varchar('api_name', { length: 100 }).notNull(),
  sortOrder: integer('sort_order').notNull(),
  stageType: varchar('stage_type', { length: 20 }).notNull().default('open'),
  colour: varchar('colour', { length: 20 }).notNull().default('blue'),
  defaultProbability: integer('default_probability'),
  expectedDays: integer('expected_days'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pipelineApiNameUnique: uniqueIndex('stage_definitions_pipeline_id_api_name_key').on(table.pipelineId, table.apiName),
  pipelineSortOrderUnique: uniqueIndex('stage_definitions_pipeline_id_sort_order_key').on(table.pipelineId, table.sortOrder),
  pipelineIdIdx: index('idx_stage_definitions_pipeline_id').on(table.pipelineId),
  pipelineSortIdx: index('idx_stage_definitions_pipeline_id_sort_order').on(table.pipelineId, table.sortOrder),
  tenantIdIdx: index('idx_stage_definitions_tenant_id').on(table.tenantId),
}));

export const stageGates = pgTable('stage_gates', {
  id: uuid('id').primaryKey().defaultRandom(),
  stageId: uuid('stage_id').notNull().references(() => stageDefinitions.id, { onDelete: 'cascade' }),
  fieldId: uuid('field_id').notNull().references(() => fieldDefinitions.id, { onDelete: 'cascade' }),
  gateType: varchar('gate_type', { length: 50 }).notNull().default('required'),
  gateValue: text('gate_value'),
  errorMessage: varchar('error_message', { length: 500 }),
}, (table) => ({
  stageFieldUnique: uniqueIndex('stage_gates_stage_id_field_id_key').on(table.stageId, table.fieldId),
  stageIdIdx: index('idx_stage_gates_stage_id').on(table.stageId),
}));

export const stageHistory = pgTable('stage_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  recordId: uuid('record_id').notNull().references(() => records.id, { onDelete: 'cascade' }),
  pipelineId: uuid('pipeline_id').notNull().references(() => pipelineDefinitions.id),
  fromStageId: uuid('from_stage_id').references(() => stageDefinitions.id),
  toStageId: uuid('to_stage_id').notNull().references(() => stageDefinitions.id),
  changedBy: varchar('changed_by', { length: 255 }).notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  daysInPreviousStage: integer('days_in_previous_stage'),
}, (table) => ({
  recordIdIdx: index('idx_stage_history_record_id').on(table.recordId),
  recordPipelineIdx: index('idx_stage_history_record_id_pipeline_id').on(table.recordId, table.pipelineId),
  changedAtIdx: index('idx_stage_history_changed_at').on(table.changedAt),
  tenantIdIdx: index('idx_stage_history_tenant_id').on(table.tenantId),
}));

// Additional tables would be defined here (teams, object_permissions, etc.)
// Omitted for brevity as the focus is on records/pipelines
