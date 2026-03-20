import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/permission.js';
import { pool } from '../db/client.js';
import { logger } from '../lib/logger.js';

export const adminTenantSettingsRouter = Router();

// All tenant settings routes require authentication, active tenant, and admin role
const auth = [requireAuth, requireTenant, requireRole('admin')];

/** Shape of the settings JSONB column. */
interface TenantSettings {
  currency?: string;
  dateFormat?: string;
  timezone?: string;
  financialYearStart?: string;
  defaultPipeline?: string;
  defaultRecordOwner?: string;
  leadAutoConversion?: boolean;
}

/** API response for tenant settings. */
interface TenantSettingsResponse {
  name: string;
  slug: string;
  status: string;
  plan: string;
  settings: TenantSettings;
}

/**
 * GET /api/admin/tenant-settings
 *
 * Returns the current tenant's name, slug, status, plan, and settings.
 * Admin role required.
 *
 * Responses:
 *   200  – tenant settings
 *   401  – unauthenticated
 *   403  – not a tenant admin
 *   404  – tenant not found
 *   500  – unexpected error
 */
export async function handleGetTenantSettings(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const tenantId = req.user!.tenantId!;

  try {
    const result = await pool.query(
      'SELECT name, slug, status, plan, settings FROM tenants WHERE id = $1',
      [tenantId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Tenant not found', code: 'NOT_FOUND' });
      return;
    }

    const row = result.rows[0] as {
      name: string;
      slug: string;
      status: string;
      plan: string;
      settings: TenantSettings;
    };

    const response: TenantSettingsResponse = {
      name: row.name,
      slug: row.slug,
      status: row.status,
      plan: row.plan ?? 'free',
      settings: row.settings ?? {},
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    logger.error({ err, tenantId }, 'Unexpected error fetching tenant settings');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/** Allowed values for settings fields. */
const VALID_CURRENCIES = ['GBP', 'USD', 'EUR', 'AUD', 'CAD'];
const VALID_DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const VALID_TIMEZONES = [
  'Europe/London',
  'US/Eastern',
  'US/Central',
  'US/Mountain',
  'US/Pacific',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Pacific/Auckland',
];
const VALID_FY_STARTS = ['January', 'April', 'July', 'October'];

/**
 * PUT /api/admin/tenant-settings
 *
 * Updates the current tenant's name and/or settings JSONB.
 * Admin role required.
 *
 * Request body:
 *   { name?: string, settings?: TenantSettings }
 *
 * Responses:
 *   200  – updated tenant settings
 *   400  – validation error
 *   401  – unauthenticated
 *   403  – not a tenant admin
 *   404  – tenant not found
 *   500  – unexpected error
 */
export async function handleUpdateTenantSettings(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const tenantId = req.user!.tenantId!;
  const body = req.body as { name?: unknown; settings?: unknown };

  try {
    // ── Validate name ────────────────────────────────────────────────────────
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    if (name !== undefined && name.length === 0) {
      res.status(400).json({ error: 'Company name cannot be empty', code: 'VALIDATION_ERROR' });
      return;
    }
    if (name !== undefined && name.length > 255) {
      res.status(400).json({ error: 'Company name must be 255 characters or fewer', code: 'VALIDATION_ERROR' });
      return;
    }

    // ── Validate settings ────────────────────────────────────────────────────
    let settingsUpdate: TenantSettings | undefined;
    if (body.settings !== undefined && body.settings !== null && typeof body.settings === 'object') {
      const s = body.settings as Record<string, unknown>;
      settingsUpdate = {};

      if ('currency' in s) {
        if (typeof s.currency !== 'string' || !VALID_CURRENCIES.includes(s.currency)) {
          res.status(400).json({ error: `Invalid currency. Must be one of: ${VALID_CURRENCIES.join(', ')}`, code: 'VALIDATION_ERROR' });
          return;
        }
        settingsUpdate.currency = s.currency;
      }

      if ('dateFormat' in s) {
        if (typeof s.dateFormat !== 'string' || !VALID_DATE_FORMATS.includes(s.dateFormat)) {
          res.status(400).json({ error: `Invalid date format. Must be one of: ${VALID_DATE_FORMATS.join(', ')}`, code: 'VALIDATION_ERROR' });
          return;
        }
        settingsUpdate.dateFormat = s.dateFormat;
      }

      if ('timezone' in s) {
        if (typeof s.timezone !== 'string' || !VALID_TIMEZONES.includes(s.timezone)) {
          res.status(400).json({ error: `Invalid timezone. Must be one of: ${VALID_TIMEZONES.join(', ')}`, code: 'VALIDATION_ERROR' });
          return;
        }
        settingsUpdate.timezone = s.timezone;
      }

      if ('financialYearStart' in s) {
        if (typeof s.financialYearStart !== 'string' || !VALID_FY_STARTS.includes(s.financialYearStart)) {
          res.status(400).json({ error: `Invalid financial year start. Must be one of: ${VALID_FY_STARTS.join(', ')}`, code: 'VALIDATION_ERROR' });
          return;
        }
        settingsUpdate.financialYearStart = s.financialYearStart;
      }

      if ('defaultPipeline' in s) {
        if (typeof s.defaultPipeline !== 'string') {
          res.status(400).json({ error: 'Default pipeline must be a string', code: 'VALIDATION_ERROR' });
          return;
        }
        settingsUpdate.defaultPipeline = s.defaultPipeline;
      }

      if ('defaultRecordOwner' in s) {
        if (typeof s.defaultRecordOwner !== 'string') {
          res.status(400).json({ error: 'Default record owner must be a string', code: 'VALIDATION_ERROR' });
          return;
        }
        settingsUpdate.defaultRecordOwner = s.defaultRecordOwner;
      }

      if ('leadAutoConversion' in s) {
        if (typeof s.leadAutoConversion !== 'boolean') {
          res.status(400).json({ error: 'Lead auto-conversion must be a boolean', code: 'VALIDATION_ERROR' });
          return;
        }
        settingsUpdate.leadAutoConversion = s.leadAutoConversion;
      }
    }

    if (name === undefined && settingsUpdate === undefined) {
      res.status(400).json({ error: 'No fields to update', code: 'VALIDATION_ERROR' });
      return;
    }

    // ── Build update query ───────────────────────────────────────────────────
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      values.push(name);
    }

    if (settingsUpdate !== undefined) {
      // Merge the new settings into the existing settings JSONB
      setClauses.push(`settings = settings || $${idx++}::jsonb`);
      values.push(JSON.stringify(settingsUpdate));
    }

    setClauses.push(`updated_at = $${idx++}`);
    values.push(new Date());
    values.push(tenantId);

    const result = await pool.query(
      `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $${idx}
       RETURNING name, slug, status, plan, settings`,
      values,
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Tenant not found', code: 'NOT_FOUND' });
      return;
    }

    const row = result.rows[0] as {
      name: string;
      slug: string;
      status: string;
      plan: string;
      settings: TenantSettings;
    };

    const response: TenantSettingsResponse = {
      name: row.name,
      slug: row.slug,
      status: row.status,
      plan: row.plan ?? 'free',
      settings: row.settings ?? {},
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    logger.error({ err, tenantId }, 'Unexpected error updating tenant settings');
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

// ─── Route bindings ───────────────────────────────────────────────────────────

adminTenantSettingsRouter.get('/', ...auth, handleGetTenantSettings);
adminTenantSettingsRouter.put('/', ...auth, handleUpdateTenantSettings);
