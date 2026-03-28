import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../db/client.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { syncUserRecord, clearUserRecordCache } = await import('../userSyncService.js');

describe('syncUserRecord', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    clearUserRecordCache();
  });

  it('returns empty result when User object definition is not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // object_definitions SELECT

    const result = await syncUserRecord({
      tenantId: 'tenant-1',
      descopeUserId: 'descope-abc',
      email: 'user@example.com',
      displayName: 'Test User',
      role: 'admin',
    });

    expect(result).toEqual({ userRecordId: '', created: false });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('creates a new User record when none exists', async () => {
    const objectId = 'obj-user-id';

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: objectId }] }) // object_definitions SELECT
      .mockResolvedValueOnce({ rows: [] }) // records SELECT (no existing user)
      .mockResolvedValueOnce({ rows: [{ id: 'new-record-id' }] }) // records INSERT
      .mockResolvedValueOnce({ rowCount: 0 }) // backfill owner_record_id
      .mockResolvedValueOnce({ rowCount: 0 }); // backfill updated_by_record_id

    const result = await syncUserRecord({
      tenantId: 'tenant-1',
      descopeUserId: 'descope-abc',
      email: 'user@example.com',
      displayName: 'Test User',
      role: 'admin',
    });

    expect(result.created).toBe(true);
    expect(result.userRecordId).toBeDefined();
    expect(result.userRecordId).not.toBe('');

    // Verify the INSERT was called with correct field_values
    const insertCall = mockQuery.mock.calls[2];
    const insertSql = insertCall[0] as string;
    expect(insertSql).toContain('INSERT INTO records');

    const insertParams = insertCall[1] as unknown[];
    expect(insertParams[2]).toBe('Test User'); // name
    const fieldValues = JSON.parse(insertParams[3] as string) as Record<string, unknown>;
    expect(fieldValues['email']).toBe('user@example.com');
    expect(fieldValues['display_name']).toBe('Test User');
    expect(fieldValues['role']).toBe('admin');
    expect(fieldValues['descope_user_id']).toBe('descope-abc');
    expect(fieldValues['is_active']).toBe(true);
  });

  it('updates existing User record when display_name changes', async () => {
    const objectId = 'obj-user-id';
    const existingId = 'existing-user-record';

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: objectId }] }) // object_definitions SELECT
      .mockResolvedValueOnce({
        rows: [{
          id: existingId,
          field_values: {
            email: 'user@example.com',
            display_name: 'Old Name',
            role: 'admin',
            descope_user_id: 'descope-abc',
            is_active: true,
          },
        }],
      }) // records SELECT (existing user found)
      .mockResolvedValueOnce({ rowCount: 1 }) // records UPDATE
      .mockResolvedValueOnce({ rowCount: 0 }) // backfill owner_record_id
      .mockResolvedValueOnce({ rowCount: 0 }); // backfill updated_by_record_id

    const result = await syncUserRecord({
      tenantId: 'tenant-1',
      descopeUserId: 'descope-abc',
      email: 'user@example.com',
      displayName: 'New Name',
      role: 'admin',
    });

    expect(result.created).toBe(false);
    expect(result.userRecordId).toBe(existingId);

    // Verify UPDATE was called
    const updateCall = mockQuery.mock.calls[2];
    const updateSql = updateCall[0] as string;
    expect(updateSql).toContain('UPDATE records');

    const updateParams = updateCall[1] as unknown[];
    const updatedFieldValues = JSON.parse(updateParams[0] as string) as Record<string, unknown>;
    expect(updatedFieldValues['display_name']).toBe('New Name');
  });

  it('skips update when nothing has changed', async () => {
    const objectId = 'obj-user-id';
    const existingId = 'existing-user-record';

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: objectId }] }) // object_definitions SELECT
      .mockResolvedValueOnce({
        rows: [{
          id: existingId,
          field_values: {
            email: 'user@example.com',
            display_name: 'Same Name',
            role: 'admin',
            descope_user_id: 'descope-abc',
            is_active: true,
          },
        }],
      }) // records SELECT (existing user found, same data)
      .mockResolvedValueOnce({ rowCount: 0 }) // backfill owner_record_id
      .mockResolvedValueOnce({ rowCount: 0 }); // backfill updated_by_record_id

    const result = await syncUserRecord({
      tenantId: 'tenant-1',
      descopeUserId: 'descope-abc',
      email: 'user@example.com',
      displayName: 'Same Name',
      role: 'admin',
    });

    expect(result.created).toBe(false);
    expect(result.userRecordId).toBe(existingId);

    // Should NOT have called UPDATE — only 2 SELECT + 2 backfill calls
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });

  it('updates existing User record when role changes', async () => {
    const objectId = 'obj-user-id';
    const existingId = 'existing-user-record';

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: objectId }] }) // object_definitions SELECT
      .mockResolvedValueOnce({
        rows: [{
          id: existingId,
          field_values: {
            email: 'user@example.com',
            display_name: 'Test User',
            role: 'user',
            descope_user_id: 'descope-abc',
            is_active: true,
          },
        }],
      }) // records SELECT
      .mockResolvedValueOnce({ rowCount: 1 }) // records UPDATE
      .mockResolvedValueOnce({ rowCount: 0 }) // backfill owner_record_id
      .mockResolvedValueOnce({ rowCount: 0 }); // backfill updated_by_record_id

    const result = await syncUserRecord({
      tenantId: 'tenant-1',
      descopeUserId: 'descope-abc',
      displayName: 'Test User',
      role: 'admin',
    });

    expect(result.created).toBe(false);

    // Verify UPDATE was called with new role
    const updateCall = mockQuery.mock.calls[2];
    const updateParams = updateCall[1] as unknown[];
    const updatedFieldValues = JSON.parse(updateParams[0] as string) as Record<string, unknown>;
    expect(updatedFieldValues['role']).toBe('admin');
  });

  it('uses email as name fallback when displayName is not provided', async () => {
    const objectId = 'obj-user-id';

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: objectId }] }) // object_definitions SELECT
      .mockResolvedValueOnce({ rows: [] }) // records SELECT (no existing user)
      .mockResolvedValueOnce({ rows: [{ id: 'new-record-id' }] }) // records INSERT
      .mockResolvedValueOnce({ rowCount: 0 }) // backfill owner_record_id
      .mockResolvedValueOnce({ rowCount: 0 }); // backfill updated_by_record_id

    const result = await syncUserRecord({
      tenantId: 'tenant-1',
      descopeUserId: 'descope-abc',
      email: 'user@example.com',
    });

    expect(result.created).toBe(true);

    // Verify name fallback to email
    const insertCall = mockQuery.mock.calls[2];
    const insertParams = insertCall[1] as unknown[];
    expect(insertParams[2]).toBe('user@example.com'); // name
  });

  it('runs backfill queries after creating a new User record', async () => {
    const objectId = 'obj-user-id';

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: objectId }] }) // object_definitions SELECT
      .mockResolvedValueOnce({ rows: [] }) // records SELECT (no existing user)
      .mockResolvedValueOnce({ rows: [{ id: 'new-record-id' }] }) // records INSERT
      .mockResolvedValueOnce({ rowCount: 2 }) // backfill owner_record_id
      .mockResolvedValueOnce({ rowCount: 1 }); // backfill updated_by_record_id

    await syncUserRecord({
      tenantId: 'tenant-1',
      descopeUserId: 'descope-abc',
      email: 'user@example.com',
      displayName: 'Test User',
    });

    // Verify backfill UPDATE for owner_record_id
    const backfillOwnerCall = mockQuery.mock.calls[3];
    const backfillOwnerSql = backfillOwnerCall[0] as string;
    expect(backfillOwnerSql).toContain('owner_record_id');
    expect(backfillOwnerSql).toContain('owner_id');

    // Verify backfill UPDATE for updated_by_record_id
    const backfillUpdatedByCall = mockQuery.mock.calls[4];
    const backfillUpdatedBySql = backfillUpdatedByCall[0] as string;
    expect(backfillUpdatedBySql).toContain('updated_by_record_id');
    expect(backfillUpdatedBySql).toContain('updated_by');
  });

  it('returns cached result on repeated calls with unchanged data', async () => {
    const objectId = 'obj-user-id';

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: objectId }] }) // object_definitions SELECT
      .mockResolvedValueOnce({ rows: [] }) // records SELECT (no existing user)
      .mockResolvedValueOnce({ rows: [{ id: 'new-record-id' }] }) // records INSERT
      .mockResolvedValueOnce({ rowCount: 0 }) // backfill owner_record_id
      .mockResolvedValueOnce({ rowCount: 0 }); // backfill updated_by_record_id

    // First call — hits DB and populates cache
    const first = await syncUserRecord({
      tenantId: 'tenant-1',
      descopeUserId: 'descope-abc',
      email: 'user@example.com',
      displayName: 'Test User',
      role: 'admin',
    });

    expect(first.created).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(5);

    // Second call — same data, should return from cache without DB queries
    const second = await syncUserRecord({
      tenantId: 'tenant-1',
      descopeUserId: 'descope-abc',
      email: 'user@example.com',
      displayName: 'Test User',
      role: 'admin',
    });

    expect(second.created).toBe(false);
    expect(second.userRecordId).toBe(first.userRecordId);
    // No additional DB queries should have been made
    expect(mockQuery).toHaveBeenCalledTimes(5);
  });
});
