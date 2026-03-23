import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { pool } from '../db/client.js';
import { VALID_COMPONENT_TYPES } from '../lib/componentRegistry.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PageLayoutJson {
  header: {
    primaryField: string;
    secondaryFields?: string[];
    badges?: Array<{ fieldId: string; colorMap: Record<string, string> }>;
    actions?: string[];
  };
  tabs: PageLayoutTab[];
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

function rowToPageLayout(row: Record<string, unknown>): PageLayout {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    objectId: row.object_id as string,
    name: row.name as string,
    role: (row.role as string | null) ?? null,
    isDefault: row.is_default as boolean,
    layout: row.layout as PageLayoutJson,
    publishedLayout: (row.published_layout as PageLayoutJson | null) ?? null,
    version: row.version as number,
    status: row.status as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    publishedAt: row.published_at ? new Date(row.published_at as string) : null,
  };
}

function rowToPageLayoutVersion(row: Record<string, unknown>): PageLayoutVersion {
  return {
    id: row.id as string,
    layoutId: row.layout_id as string,
    tenantId: row.tenant_id as string,
    version: row.version as number,
    layout: row.layout as PageLayoutJson,
    publishedBy: (row.published_by as string | null) ?? null,
    publishedAt: new Date(row.published_at as string),
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

export function validateLayoutJson(layout: unknown): string | null {
  if (typeof layout !== 'object' || layout === null) {
    return 'layout is required and must be an object';
  }

  const l = layout as Record<string, unknown>;

  // Validate header
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

  // Validate tabs
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
      }
    }
  }

  return null;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function assertObjectExists(tenantId: string, objectId: string): Promise<void> {
  const result = await pool.query(
    'SELECT id FROM object_definitions WHERE id = $1 AND tenant_id = $2',
    [objectId, tenantId],
  );
  if (result.rows.length === 0) {
    throwNotFoundError('Object definition not found');
  }
}

// ─── Service functions ───────────────────────────────────────────────────────

/**
 * Creates a new page layout on the specified object.
 *
 * @throws {Error} NOT_FOUND — parent object does not exist
 * @throws {Error} VALIDATION_ERROR — invalid input
 * @throws {Error} CONFLICT — layout already exists for this object/role combination
 */
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

  // Check uniqueness constraint (tenant_id, object_id, role)
  const role = params.role ?? null;
  const existing = await pool.query(
    `SELECT id FROM page_layouts
     WHERE tenant_id = $1 AND object_id = $2 AND ${role === null ? 'role IS NULL' : 'role = $3'}`,
    role === null ? [tenantId, objectId] : [tenantId, objectId, role],
  );
  if (existing.rows.length > 0) {
    throwConflictError(
      role
        ? `A page layout already exists for this object with role "${role}"`
        : 'A page layout already exists for this object (default role)',
    );
  }

  const layoutId = randomUUID();
  const now = new Date();

  const result = await pool.query(
    `INSERT INTO page_layouts
       (id, tenant_id, object_id, name, role, is_default, layout, version, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      layoutId,
      tenantId,
      objectId,
      params.name.trim(),
      role,
      params.isDefault ?? false,
      JSON.stringify(params.layout),
      1,
      'draft',
      now,
      now,
    ],
  );

  logger.info({ layoutId, objectId, name: params.name }, 'Page layout created');

  return rowToPageLayout(result.rows[0]);
}

/**
 * Returns all page layouts for an object, ordered by name.
 *
 * @throws {Error} NOT_FOUND — parent object does not exist
 */
export async function listPageLayouts(
  tenantId: string,
  objectId: string,
): Promise<PageLayout[]> {
  await assertObjectExists(tenantId, objectId);

  const result = await pool.query(
    'SELECT * FROM page_layouts WHERE tenant_id = $1 AND object_id = $2 ORDER BY name ASC',
    [tenantId, objectId],
  );

  return result.rows.map((row: Record<string, unknown>) => rowToPageLayout(row));
}

/**
 * Returns a single page layout by ID.
 *
 * @throws {Error} NOT_FOUND — layout or parent object does not exist
 */
export async function getPageLayoutById(
  tenantId: string,
  objectId: string,
  layoutId: string,
): Promise<PageLayout> {
  await assertObjectExists(tenantId, objectId);

  const result = await pool.query(
    'SELECT * FROM page_layouts WHERE id = $1 AND tenant_id = $2 AND object_id = $3',
    [layoutId, tenantId, objectId],
  );

  if (result.rows.length === 0) {
    throwNotFoundError('Page layout not found');
  }

  return rowToPageLayout(result.rows[0]);
}

/**
 * Updates a page layout's metadata and/or draft layout.
 *
 * @throws {Error} NOT_FOUND — layout or parent object does not exist
 * @throws {Error} VALIDATION_ERROR — invalid input
 * @throws {Error} CONFLICT — role conflict with another layout
 */
export async function updatePageLayout(
  tenantId: string,
  objectId: string,
  layoutId: string,
  params: UpdatePageLayoutParams,
): Promise<PageLayout> {
  await assertObjectExists(tenantId, objectId);

  const existing = await pool.query(
    'SELECT * FROM page_layouts WHERE id = $1 AND tenant_id = $2 AND object_id = $3',
    [layoutId, tenantId, objectId],
  );

  if (existing.rows.length === 0) {
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

  // Check role uniqueness if changing role
  if ('role' in params) {
    const newRole = params.role ?? null;
    const dup = await pool.query(
      `SELECT id FROM page_layouts
       WHERE tenant_id = $1 AND object_id = $2 AND id != $3
         AND ${newRole === null ? 'role IS NULL' : 'role = $4'}`,
      newRole === null
        ? [tenantId, objectId, layoutId]
        : [tenantId, objectId, layoutId, newRole],
    );
    if (dup.rows.length > 0) {
      throwConflictError(
        newRole
          ? `A page layout already exists for this object with role "${newRole}"`
          : 'A page layout already exists for this object (default role)',
      );
    }
  }

  // Build dynamic update
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if ('name' in params) {
    updates.push(`name = $${paramIndex++}`);
    values.push(params.name!.trim());
  }
  if ('role' in params) {
    updates.push(`role = $${paramIndex++}`);
    values.push(params.role ?? null);
  }
  if ('layout' in params) {
    updates.push(`layout = $${paramIndex++}`);
    values.push(JSON.stringify(params.layout));
  }
  if ('isDefault' in params) {
    updates.push(`is_default = $${paramIndex++}`);
    values.push(params.isDefault);
  }

  if (updates.length === 0) {
    return rowToPageLayout(existing.rows[0]);
  }

  const now = new Date();
  updates.push(`updated_at = $${paramIndex++}`);
  values.push(now);

  values.push(layoutId);
  const layoutIdParam = paramIndex++;
  values.push(tenantId);
  const tenantIdParam = paramIndex;

  const result = await pool.query(
    `UPDATE page_layouts SET ${updates.join(', ')} WHERE id = $${layoutIdParam} AND tenant_id = $${tenantIdParam} RETURNING *`,
    values,
  );

  logger.info({ layoutId, objectId }, 'Page layout updated');

  return rowToPageLayout(result.rows[0]);
}

/**
 * Publishes a page layout — copies the draft layout to published_layout,
 * increments the version, and creates a version snapshot.
 *
 * @throws {Error} NOT_FOUND — layout or parent object does not exist
 */
export async function publishPageLayout(
  tenantId: string,
  objectId: string,
  layoutId: string,
  publishedBy: string,
): Promise<PageLayout> {
  await assertObjectExists(tenantId, objectId);

  const existing = await pool.query(
    'SELECT * FROM page_layouts WHERE id = $1 AND tenant_id = $2 AND object_id = $3',
    [layoutId, tenantId, objectId],
  );

  if (existing.rows.length === 0) {
    throwNotFoundError('Page layout not found');
  }

  const row = existing.rows[0] as Record<string, unknown>;
  const currentVersion = row.version as number;
  const newVersion = currentVersion + 1;
  const now = new Date();

  // Wrap the layout update and version snapshot in a transaction so both
  // succeed or neither does — prevents a partial state where the layout is
  // marked as published but no version record exists.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update the page layout: copy layout → published_layout
    const result = await client.query(
      `UPDATE page_layouts
       SET published_layout = layout,
           version = $1,
           status = 'published',
           published_at = $2,
           updated_at = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [newVersion, now, layoutId, tenantId],
    );

    // Create version snapshot
    await client.query(
      `INSERT INTO page_layout_versions
         (id, layout_id, tenant_id, version, layout, published_by, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        layoutId,
        tenantId,
        newVersion,
        row.layout,
        publishedBy,
        now,
      ],
    );

    await client.query('COMMIT');

    logger.info({ layoutId, objectId, version: newVersion, publishedBy }, 'Page layout published');

    return rowToPageLayout(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Returns all version snapshots for a page layout, newest first.
 *
 * @throws {Error} NOT_FOUND — layout or parent object does not exist
 */
export async function listPageLayoutVersions(
  tenantId: string,
  objectId: string,
  layoutId: string,
): Promise<PageLayoutVersion[]> {
  await assertObjectExists(tenantId, objectId);

  // Verify the layout exists
  const layoutResult = await pool.query(
    'SELECT id FROM page_layouts WHERE id = $1 AND tenant_id = $2 AND object_id = $3',
    [layoutId, tenantId, objectId],
  );
  if (layoutResult.rows.length === 0) {
    throwNotFoundError('Page layout not found');
  }

  const result = await pool.query(
    'SELECT * FROM page_layout_versions WHERE layout_id = $1 AND tenant_id = $2 ORDER BY version DESC',
    [layoutId, tenantId],
  );

  return result.rows.map((row: Record<string, unknown>) => rowToPageLayoutVersion(row));
}

/**
 * Deletes a page layout. Default layouts cannot be deleted.
 *
 * @throws {Error} NOT_FOUND — layout or parent object does not exist
 * @throws {Error} DELETE_BLOCKED — default layout
 */
export async function deletePageLayout(
  tenantId: string,
  objectId: string,
  layoutId: string,
): Promise<void> {
  await assertObjectExists(tenantId, objectId);

  const existing = await pool.query(
    'SELECT * FROM page_layouts WHERE id = $1 AND tenant_id = $2 AND object_id = $3',
    [layoutId, tenantId, objectId],
  );

  if (existing.rows.length === 0) {
    throwNotFoundError('Page layout not found');
  }

  const row = existing.rows[0] as Record<string, unknown>;

  if (row.is_default === true) {
    throwDeleteBlockedError('Cannot delete default page layouts');
  }

  await pool.query('DELETE FROM page_layouts WHERE id = $1 AND tenant_id = $2', [layoutId, tenantId]);

  logger.info({ layoutId, objectId }, 'Page layout deleted');
}
