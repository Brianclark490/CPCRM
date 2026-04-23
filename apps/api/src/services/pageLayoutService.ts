import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import type { Selectable, Updateable } from 'kysely';
import { logger } from '../lib/logger.js';
import { db } from '../db/kysely.js';
import type { PageLayouts, PageLayoutVersions } from '../db/kysely.types.js';
import { VALID_COMPONENT_TYPES } from '../lib/componentRegistry.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PageLayoutJson {
  header: {
    primaryField: string;
    secondaryFields?: string[];
    badges?: Array<{ fieldId: string; colorMap: Record<string, string> }>;
    actions?: string[];
  };
  zones?: PageLayoutZones;
  tabs: PageLayoutTab[];
}

// KPI strip is a flat list of components; rails are vertical stacks of sections.
export interface PageLayoutZones {
  kpi: PageLayoutComponent[];
  leftRail: PageLayoutSection[];
  rightRail: PageLayoutSection[];
}

export interface PageLayoutTab {
  id: string;
  label: string;
  icon?: string;
  sections: PageLayoutSection[];
}

export interface PageLayoutSection {
  id: string;
  type: string;
  label: string;
  columns?: number;
  collapsed?: boolean;
  visibility?: VisibilityRule | null;
  components: PageLayoutComponent[];
}

export interface PageLayoutComponent {
  id: string;
  type: string;
  config: Record<string, unknown>;
  visibility?: VisibilityRule | null;
}

export interface VisibilityRule {
  operator: 'AND' | 'OR';
  conditions: VisibilityCondition[];
}

export interface VisibilityCondition {
  field: string;
  op: string;
  value?: unknown;
}

export interface PageLayout {
  id: string;
  tenantId: string;
  objectId: string;
  name: string;
  role: string | null;
  isDefault: boolean;
  layout: PageLayoutJson;
  publishedLayout: PageLayoutJson | null;
  version: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

export interface PageLayoutVersion {
  id: string;
  layoutId: string;
  tenantId: string;
  version: number;
  layout: PageLayoutJson;
  publishedBy: string | null;
  publishedAt: Date;
}

export interface CreatePageLayoutParams {
  name: string;
  role?: string | null;
  isDefault?: boolean;
  layout: PageLayoutJson;
}

export interface UpdatePageLayoutParams {
  name?: string;
  role?: string | null;
  layout?: PageLayoutJson;
  isDefault?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_SECTION_TYPES = new Set(['field_section', 'related_list', 'widget_section']);
const VALID_VISIBILITY_OPS = new Set([
  'equals', 'not_equals', 'contains', 'not_empty', 'empty',
  'greater_than', 'less_than', 'in', 'not_in',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Fills in `zones` with empty arrays so readers always see a populated shape.
// Old layouts (no `zones`) read as `{ kpi: [], leftRail: [], rightRail: [] }`.
export function normalizeLayout(layout: PageLayoutJson): PageLayoutJson {
  const z = layout.zones as Partial<PageLayoutZones> | null | undefined;
  return {
    ...layout,
    zones: {
      kpi: Array.isArray(z?.kpi) ? z!.kpi! : [],
      leftRail: Array.isArray(z?.leftRail) ? z!.leftRail! : [],
      rightRail: Array.isArray(z?.rightRail) ? z!.rightRail! : [],
    },
  };
}

function throwValidationError(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = 'VALIDATION_ERROR';
  throw err;
}

function throwNotFoundError(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = 'NOT_FOUND';
  throw err;
}

function throwConflictError(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = 'CONFLICT';
  throw err;
}

function throwDeleteBlockedError(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = 'DELETE_BLOCKED';
  throw err;
}

// ─── Row → domain model ─────────────────────────────────────────────────────

function rowToPageLayout(row: Selectable<PageLayouts>): PageLayout {
  const rawPublished = row.published_layout as unknown as PageLayoutJson | null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    objectId: row.object_id,
    name: row.name,
    role: row.role,
    isDefault: row.is_default,
    layout: normalizeLayout(row.layout as unknown as PageLayoutJson),
    publishedLayout: rawPublished ? normalizeLayout(rawPublished) : null,
    version: row.version,
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at as unknown as string),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at as unknown as string),
    publishedAt: row.published_at
      ? (row.published_at instanceof Date ? row.published_at : new Date(row.published_at as unknown as string))
      : null,
  };
}

function rowToPageLayoutVersion(row: Selectable<PageLayoutVersions>): PageLayoutVersion {
  return {
    id: row.id,
    layoutId: row.layout_id,
    tenantId: row.tenant_id,
    version: row.version,
    layout: normalizeLayout(row.layout as unknown as PageLayoutJson),
    publishedBy: row.published_by,
    publishedAt: row.published_at instanceof Date ? row.published_at : new Date(row.published_at as unknown as string),
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validatePageLayoutName(name: unknown): string | null {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return 'name is required';
  }
  if (name.trim().length > 255) {
    return 'name must be 255 characters or fewer';
  }
  return null;
}

function validateVisibilityRule(rule: unknown): string | null {
  if (rule === null || rule === undefined) return null;

  if (typeof rule !== 'object') {
    return 'visibility must be an object with operator and conditions';
  }

  const r = rule as Record<string, unknown>;

  if (r.operator !== 'AND' && r.operator !== 'OR') {
    return 'visibility.operator must be "AND" or "OR"';
  }

  if (!Array.isArray(r.conditions)) {
    return 'visibility.conditions must be an array';
  }

  for (const cond of r.conditions) {
    if (typeof cond !== 'object' || cond === null) {
      return 'Each visibility condition must be an object';
    }
    const c = cond as Record<string, unknown>;
    if (typeof c.field !== 'string' || c.field.trim().length === 0) {
      return 'Each visibility condition must have a field';
    }
    if (typeof c.op !== 'string' || !VALID_VISIBILITY_OPS.has(c.op)) {
      return `Invalid visibility operator: ${String(c.op)}. Must be one of: ${[...VALID_VISIBILITY_OPS].join(', ')}`;
    }
  }

  return null;
}

function validateComponent(comp: unknown): string | null {
  if (typeof comp !== 'object' || comp === null) {
    return 'Each component must be an object';
  }
  const c = comp as Record<string, unknown>;
  if (typeof c.id !== 'string' || c.id.trim().length === 0) {
    return 'Each component must have an id';
  }
  if (typeof c.type !== 'string' || !VALID_COMPONENT_TYPES.has(c.type)) {
    return `Component "${c.id}" has invalid type: ${String(c.type)}. Must be one of: ${[...VALID_COMPONENT_TYPES].join(', ')}`;
  }
  if (typeof c.config !== 'object' || c.config === null) {
    return `Component "${c.id}" must have a config object`;
  }

  const compVisErr = validateVisibilityRule(c.visibility);
  if (compVisErr) return `Component "${c.id}": ${compVisErr}`;

  return null;
}

function validateSection(section: unknown): string | null {
  if (typeof section !== 'object' || section === null) {
    return 'Each section must be an object';
  }
  const s = section as Record<string, unknown>;
  if (typeof s.id !== 'string' || s.id.trim().length === 0) {
    return 'Each section must have an id';
  }
  if (typeof s.type !== 'string' || !VALID_SECTION_TYPES.has(s.type)) {
    return `Section "${s.id}" has invalid type: ${String(s.type)}. Must be one of: ${[...VALID_SECTION_TYPES].join(', ')}`;
  }
  if (typeof s.label !== 'string' || s.label.trim().length === 0) {
    return `Section "${s.id}" must have a label`;
  }

  const visErr = validateVisibilityRule(s.visibility);
  if (visErr) return `Section "${s.id}": ${visErr}`;

  if (!Array.isArray(s.components)) {
    return `Section "${s.id}" must have a components array`;
  }

  for (const comp of s.components) {
    const compErr = validateComponent(comp);
    if (compErr) return compErr;
  }

  return null;
}

function validateZones(zones: unknown): string | null {
  if (zones === undefined || zones === null) return null;
  if (typeof zones !== 'object') {
    return 'layout.zones must be an object with kpi, leftRail, rightRail arrays';
  }

  const z = zones as Record<string, unknown>;

  if (z.kpi !== undefined) {
    if (!Array.isArray(z.kpi)) {
      return 'layout.zones.kpi must be an array';
    }
    for (const comp of z.kpi) {
      const compErr = validateComponent(comp);
      if (compErr) return `zones.kpi: ${compErr}`;
    }
  }

  for (const rail of ['leftRail', 'rightRail'] as const) {
    if (z[rail] !== undefined) {
      if (!Array.isArray(z[rail])) {
        return `layout.zones.${rail} must be an array`;
      }
      for (const section of z[rail] as unknown[]) {
        const secErr = validateSection(section);
        if (secErr) return `zones.${rail}: ${secErr}`;
      }
    }
  }

  return null;
}

export function validateLayoutJson(layout: unknown): string | null {
  if (typeof layout !== 'object' || layout === null) {
    return 'layout is required and must be an object';
  }

  const l = layout as Record<string, unknown>;

  if (typeof l.header !== 'object' || l.header === null) {
    return 'layout.header is required and must be an object';
  }

  const header = l.header as Record<string, unknown>;
  if (typeof header.primaryField !== 'string' || header.primaryField.trim().length === 0) {
    return 'layout.header.primaryField is required';
  }

  if (header.secondaryFields !== undefined && !Array.isArray(header.secondaryFields)) {
    return 'layout.header.secondaryFields must be an array of strings';
  }

  if (header.badges !== undefined && !Array.isArray(header.badges)) {
    return 'layout.header.badges must be an array';
  }

  if (header.actions !== undefined && !Array.isArray(header.actions)) {
    return 'layout.header.actions must be an array of strings';
  }

  const zonesErr = validateZones(l.zones);
  if (zonesErr) return zonesErr;

  if (!Array.isArray(l.tabs)) {
    return 'layout.tabs is required and must be an array';
  }

  for (const tab of l.tabs) {
    if (typeof tab !== 'object' || tab === null) {
      return 'Each tab must be an object';
    }
    const t = tab as Record<string, unknown>;
    if (typeof t.id !== 'string' || t.id.trim().length === 0) {
      return 'Each tab must have an id';
    }
    if (typeof t.label !== 'string' || t.label.trim().length === 0) {
      return 'Each tab must have a label';
    }

    if (!Array.isArray(t.sections)) {
      return `Tab "${t.id}" must have a sections array`;
    }

    for (const section of t.sections) {
      const secErr = validateSection(section);
      if (secErr) return secErr;
    }
  }

  return null;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function assertObjectExists(tenantId: string, objectId: string): Promise<void> {
  const row = await db
    .selectFrom('object_definitions')
    .select('id')
    .where('id', '=', objectId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!row) {
    throwNotFoundError('Object definition not found');
  }
}

// ─── Service functions ───────────────────────────────────────────────────────

export async function createPageLayout(
  tenantId: string,
  objectId: string,
  params: CreatePageLayoutParams,
): Promise<PageLayout> {
  await assertObjectExists(tenantId, objectId);

  const nameError = validatePageLayoutName(params.name);
  if (nameError) throwValidationError(nameError);

  const layoutError = validateLayoutJson(params.layout);
  if (layoutError) throwValidationError(layoutError);

  const role = params.role ?? null;

  let existingQuery = db
    .selectFrom('page_layouts')
    .select('id')
    .where('tenant_id', '=', tenantId)
    .where('object_id', '=', objectId);

  if (role === null) {
    existingQuery = existingQuery.where('role', 'is', null);
  } else {
    existingQuery = existingQuery.where('role', '=', role);
  }

  const existing = await existingQuery.executeTakeFirst();
  if (existing) {
    throwConflictError(
      role
        ? `A page layout already exists for this object with role "${role}"`
        : 'A page layout already exists for this object (default role)',
    );
  }

  const layoutId = randomUUID();
  const now = new Date();

  const row = await db
    .insertInto('page_layouts')
    .values({
      id: layoutId,
      tenant_id: tenantId,
      object_id: objectId,
      name: params.name.trim(),
      role,
      is_default: params.isDefault ?? false,
      layout: JSON.stringify(params.layout),
      version: 1,
      status: 'draft',
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info({ layoutId, objectId, name: params.name }, 'Page layout created');

  return rowToPageLayout(row);
}

export async function listPageLayouts(
  tenantId: string,
  objectId: string,
): Promise<PageLayout[]> {
  await assertObjectExists(tenantId, objectId);

  const rows = await db
    .selectFrom('page_layouts')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .where('object_id', '=', objectId)
    .orderBy('name', 'asc')
    .execute();

  return rows.map(rowToPageLayout);
}

export async function getPageLayoutById(
  tenantId: string,
  objectId: string,
  layoutId: string,
): Promise<PageLayout> {
  await assertObjectExists(tenantId, objectId);

  const row = await db
    .selectFrom('page_layouts')
    .selectAll()
    .where('id', '=', layoutId)
    .where('tenant_id', '=', tenantId)
    .where('object_id', '=', objectId)
    .executeTakeFirst();

  if (!row) {
    throwNotFoundError('Page layout not found');
  }

  return rowToPageLayout(row);
}

export async function updatePageLayout(
  tenantId: string,
  objectId: string,
  layoutId: string,
  params: UpdatePageLayoutParams,
): Promise<PageLayout> {
  await assertObjectExists(tenantId, objectId);

  const existing = await db
    .selectFrom('page_layouts')
    .selectAll()
    .where('id', '=', layoutId)
    .where('tenant_id', '=', tenantId)
    .where('object_id', '=', objectId)
    .executeTakeFirst();

  if (!existing) {
    throwNotFoundError('Page layout not found');
  }

  if (params.name !== undefined) {
    const nameError = validatePageLayoutName(params.name);
    if (nameError) throwValidationError(nameError);
  }

  if (params.layout !== undefined) {
    const layoutError = validateLayoutJson(params.layout);
    if (layoutError) throwValidationError(layoutError);
  }

  if ('role' in params) {
    const newRole = params.role ?? null;

    let dupQuery = db
      .selectFrom('page_layouts')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('object_id', '=', objectId)
      .where('id', '!=', layoutId);

    if (newRole === null) {
      dupQuery = dupQuery.where('role', 'is', null);
    } else {
      dupQuery = dupQuery.where('role', '=', newRole);
    }

    const dup = await dupQuery.executeTakeFirst();
    if (dup) {
      throwConflictError(
        newRole
          ? `A page layout already exists for this object with role "${newRole}"`
          : 'A page layout already exists for this object (default role)',
      );
    }
  }

  const patch: Updateable<PageLayouts> = {};
  if ('name' in params) {
    patch.name = params.name!.trim();
  }
  if ('role' in params) {
    patch.role = params.role ?? null;
  }
  if ('layout' in params) {
    patch.layout = JSON.stringify(params.layout);
  }
  if ('isDefault' in params) {
    patch.is_default = params.isDefault;
  }

  if (Object.keys(patch).length === 0) {
    return rowToPageLayout(existing);
  }

  patch.updated_at = new Date();

  const row = await db
    .updateTable('page_layouts')
    .set(patch)
    .where('id', '=', layoutId)
    .where('tenant_id', '=', tenantId)
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info({ layoutId, objectId }, 'Page layout updated');

  return rowToPageLayout(row);
}

export async function publishPageLayout(
  tenantId: string,
  objectId: string,
  layoutId: string,
  publishedBy: string,
): Promise<PageLayout> {
  await assertObjectExists(tenantId, objectId);

  const existingRow = await db
    .selectFrom('page_layouts')
    .selectAll()
    .where('id', '=', layoutId)
    .where('tenant_id', '=', tenantId)
    .where('object_id', '=', objectId)
    .executeTakeFirst();

  if (!existingRow) {
    throwNotFoundError('Page layout not found');
  }

  const currentVersion = existingRow.version;
  const newVersion = currentVersion + 1;
  const now = new Date();

  return db.transaction().execute(async (trx) => {
    const row = await trx
      .updateTable('page_layouts')
      .set({
        published_layout: sql`layout`,
        version: newVersion,
        status: 'published',
        published_at: now,
        updated_at: now,
      })
      .where('id', '=', layoutId)
      .where('tenant_id', '=', tenantId)
      .returningAll()
      .executeTakeFirstOrThrow();

    await trx
      .insertInto('page_layout_versions')
      .values({
        id: randomUUID(),
        layout_id: layoutId,
        tenant_id: tenantId,
        version: newVersion,
        layout: row.layout,
        published_by: publishedBy,
        published_at: now,
      })
      .execute();

    logger.info({ layoutId, objectId, version: newVersion, publishedBy }, 'Page layout published');

    return rowToPageLayout(row);
  });
}

export async function listPageLayoutVersions(
  tenantId: string,
  objectId: string,
  layoutId: string,
): Promise<PageLayoutVersion[]> {
  await assertObjectExists(tenantId, objectId);

  const layoutRow = await db
    .selectFrom('page_layouts')
    .select('id')
    .where('id', '=', layoutId)
    .where('tenant_id', '=', tenantId)
    .where('object_id', '=', objectId)
    .executeTakeFirst();
  if (!layoutRow) {
    throwNotFoundError('Page layout not found');
  }

  const rows = await db
    .selectFrom('page_layout_versions')
    .selectAll()
    .where('layout_id', '=', layoutId)
    .where('tenant_id', '=', tenantId)
    .orderBy('version', 'desc')
    .execute();

  return rows.map(rowToPageLayoutVersion);
}

export async function deletePageLayout(
  tenantId: string,
  objectId: string,
  layoutId: string,
): Promise<void> {
  await assertObjectExists(tenantId, objectId);

  const existing = await db
    .selectFrom('page_layouts')
    .selectAll()
    .where('id', '=', layoutId)
    .where('tenant_id', '=', tenantId)
    .where('object_id', '=', objectId)
    .executeTakeFirst();

  if (!existing) {
    throwNotFoundError('Page layout not found');
  }

  if (existing.is_default === true) {
    throwDeleteBlockedError('Cannot delete default page layouts');
  }

  await db
    .deleteFrom('page_layouts')
    .where('id', '=', layoutId)
    .where('tenant_id', '=', tenantId)
    .execute();

  logger.info({ layoutId, objectId }, 'Page layout deleted');
}

export async function copyLayout(
  tenantId: string,
  objectId: string,
  targetLayoutId: string,
  sourceLayoutId: string,
): Promise<PageLayout> {
  await assertObjectExists(tenantId, objectId);

  const sourceRow = await db
    .selectFrom('page_layouts')
    .selectAll()
    .where('id', '=', sourceLayoutId)
    .where('tenant_id', '=', tenantId)
    .where('object_id', '=', objectId)
    .executeTakeFirst();
  if (!sourceRow) {
    throwNotFoundError('Source page layout not found');
  }

  const targetRow = await db
    .selectFrom('page_layouts')
    .selectAll()
    .where('id', '=', targetLayoutId)
    .where('tenant_id', '=', tenantId)
    .where('object_id', '=', objectId)
    .executeTakeFirst();
  if (!targetRow) {
    throwNotFoundError('Target page layout not found');
  }

  const now = new Date();

  const row = await db
    .updateTable('page_layouts')
    .set({
      layout: sourceRow.layout,
      updated_at: now,
    })
    .where('id', '=', targetLayoutId)
    .where('tenant_id', '=', tenantId)
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info({ targetLayoutId, sourceLayoutId, objectId }, 'Page layout copied');

  return rowToPageLayout(row);
}

export async function revertLayout(
  tenantId: string,
  objectId: string,
  layoutId: string,
  version: number,
): Promise<PageLayout> {
  await assertObjectExists(tenantId, objectId);

  const layoutRow = await db
    .selectFrom('page_layouts')
    .selectAll()
    .where('id', '=', layoutId)
    .where('tenant_id', '=', tenantId)
    .where('object_id', '=', objectId)
    .executeTakeFirst();
  if (!layoutRow) {
    throwNotFoundError('Page layout not found');
  }

  const versionRow = await db
    .selectFrom('page_layout_versions')
    .selectAll()
    .where('layout_id', '=', layoutId)
    .where('tenant_id', '=', tenantId)
    .where('version', '=', version)
    .executeTakeFirst();
  if (!versionRow) {
    throwNotFoundError(`Version ${version} not found for this layout`);
  }

  const now = new Date();

  const row = await db
    .updateTable('page_layouts')
    .set({
      layout: versionRow.layout,
      updated_at: now,
    })
    .where('id', '=', layoutId)
    .where('tenant_id', '=', tenantId)
    .returningAll()
    .executeTakeFirstOrThrow();

  logger.info({ layoutId, objectId, version }, 'Page layout reverted');

  return rowToPageLayout(row);
}
