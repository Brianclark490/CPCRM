import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fake DB pool with transaction support ──────────────────────────────────

const { mockQuery, mockConnect } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockConnect = vi.fn();
  return { mockQuery, mockConnect };
});

vi.mock('../../db/client.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

// We create fresh mock client functions before each test
let clientQuery: ReturnType<typeof vi.fn>;
let clientRelease: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockConnect.mockReset();
  mockQuery.mockReset();

  clientQuery = vi.fn();
  clientRelease = vi.fn();
  mockConnect.mockResolvedValue({
    query: clientQuery,
    release: clientRelease,
  });
});

const { convertLead } = await import('../leadConversionService.js');

// ─── Test helpers ────────────────────────────────────────────────────────────

function setupLeadConversionMocks(overrides: {
  leadFieldValues?: Record<string, unknown>;
  leadStatus?: string;
  leadExists?: boolean;
  accountExists?: boolean;
  existingAccountName?: string;
} = {}) {
  const {
    leadFieldValues = {
      first_name: 'John',
      last_name: 'Smith',
      company: 'Acme Corp',
      email: 'john@acme.com',
      phone: '555-1234',
      job_title: 'CEO',
      status: 'Qualified',
      estimated_value: 50000,
      source: 'Website',
      description: 'A great lead',
      industry: 'Technology',
      website: 'https://acme.com',
      address: '123 Main St',
    },
    leadExists = true,
    accountExists = false,
    existingAccountName = 'Existing Corp',
  } = overrides;

  clientQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();

    // BEGIN / COMMIT / ROLLBACK
    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
      return { rows: [] };
    }

    // Resolve lead object definition
    if (s.includes('FROM OBJECT_DEFINITIONS WHERE API_NAME') && params?.[0] === 'lead') {
      return { rows: [{ id: 'obj-lead-id' }] };
    }

    // Resolve account object definition
    if (s.includes('FROM OBJECT_DEFINITIONS WHERE API_NAME') && params?.[0] === 'account') {
      return { rows: [{ id: 'obj-account-id' }] };
    }

    // Resolve contact object definition
    if (s.includes('FROM OBJECT_DEFINITIONS WHERE API_NAME') && params?.[0] === 'contact') {
      return { rows: [{ id: 'obj-contact-id' }] };
    }

    // Resolve opportunity object definition
    if (s.includes('FROM OBJECT_DEFINITIONS WHERE API_NAME') && params?.[0] === 'opportunity') {
      return { rows: [{ id: 'obj-opportunity-id' }] };
    }

    // Fetch lead record
    if (s.includes('FROM RECORDS WHERE ID') && s.includes('OBJECT_ID') && s.includes('OWNER_ID') && !s.startsWith('UPDATE')) {
      if (!leadExists) return { rows: [] };

      // If it's checking for a lead (obj-lead-id)
      if (params?.[1] === 'obj-lead-id') {
        return {
          rows: [{
            id: params?.[0],
            object_id: 'obj-lead-id',
            name: 'John Smith',
            field_values: leadFieldValues,
            owner_id: 'user-123',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        };
      }

      // Existing account lookup
      if (params?.[1] === 'obj-account-id') {
        if (accountExists) {
          return {
            rows: [{
              id: params?.[0],
              name: existingAccountName,
            }],
          };
        }
        return { rows: [] };
      }

      return { rows: [] };
    }

    // Fetch conversion mappings
    if (s.includes('FROM LEAD_CONVERSION_MAPPINGS')) {
      return {
        rows: [
          { lead_field_api_name: 'company', target_object: 'account', target_field_api_name: 'name' },
          { lead_field_api_name: 'industry', target_object: 'account', target_field_api_name: 'industry' },
          { lead_field_api_name: 'website', target_object: 'account', target_field_api_name: 'website' },
          { lead_field_api_name: 'phone', target_object: 'account', target_field_api_name: 'phone' },
          { lead_field_api_name: 'email', target_object: 'account', target_field_api_name: 'email' },
          { lead_field_api_name: 'address', target_object: 'account', target_field_api_name: 'address_line1' },
          { lead_field_api_name: 'first_name', target_object: 'contact', target_field_api_name: 'first_name' },
          { lead_field_api_name: 'last_name', target_object: 'contact', target_field_api_name: 'last_name' },
          { lead_field_api_name: 'email', target_object: 'contact', target_field_api_name: 'email' },
          { lead_field_api_name: 'phone', target_object: 'contact', target_field_api_name: 'phone' },
          { lead_field_api_name: 'job_title', target_object: 'contact', target_field_api_name: 'job_title' },
          { lead_field_api_name: 'company', target_object: 'opportunity', target_field_api_name: 'name' },
          { lead_field_api_name: 'estimated_value', target_object: 'opportunity', target_field_api_name: 'value' },
          { lead_field_api_name: 'source', target_object: 'opportunity', target_field_api_name: 'source' },
          { lead_field_api_name: 'description', target_object: 'opportunity', target_field_api_name: 'description' },
        ],
      };
    }

    // INSERT INTO records (create account, contact, or opportunity)
    if (s.startsWith('INSERT INTO RECORDS')) {
      return { rows: [] };
    }

    // Relationship definition lookup
    if (s.includes('FROM RELATIONSHIP_DEFINITIONS WHERE API_NAME')) {
      const apiName = params?.[0] as string;
      if (apiName === 'contact_account') return { rows: [{ id: 'rel-contact-account-id' }] };
      if (apiName === 'opportunity_account') return { rows: [{ id: 'rel-opp-account-id' }] };
      if (apiName === 'opportunity_contact') return { rows: [{ id: 'rel-opp-contact-id' }] };
      return { rows: [] };
    }

    // INSERT INTO record_relationships
    if (s.startsWith('INSERT INTO RECORD_RELATIONSHIPS')) {
      return { rows: [] };
    }

    // UPDATE records (update lead)
    if (s.startsWith('UPDATE RECORDS')) {
      return { rows: [{}] };
    }

    return { rows: [] };
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('convertLead', () => {
  it('converts a lead and creates account, contact, and opportunity', async () => {
    setupLeadConversionMocks();

    const result = await convertLead('lead-1', 'user-123', {});

    expect(result.account).toBeDefined();
    expect(result.account.name).toBe('Acme Corp');
    expect(result.contact).toBeDefined();
    expect(result.contact.name).toBe('John Smith');
    expect(result.opportunity).toBeDefined();
    expect(result.opportunity!.name).toBe('Acme Corp - Opportunity');
    expect(result.lead.id).toBe('lead-1');
    expect(result.lead.status).toBe('Converted');

    // Verify transaction was used
    const calls = clientQuery.mock.calls.map((c: unknown[]) =>
      (c[0] as string).replace(/\s+/g, ' ').trim().toUpperCase(),
    );
    expect(calls[0]).toBe('BEGIN');
    expect(calls[calls.length - 1]).toBe('COMMIT');

    // Verify release was called
    expect(clientRelease).toHaveBeenCalled();
  });

  it('throws NOT_FOUND when lead does not exist', async () => {
    setupLeadConversionMocks({ leadExists: false });

    await expect(
      convertLead('missing-lead', 'user-123', {}),
    ).rejects.toThrow('Lead not found');
  });

  it('throws ALREADY_CONVERTED when lead status is Converted', async () => {
    setupLeadConversionMocks({
      leadFieldValues: {
        first_name: 'John',
        last_name: 'Smith',
        company: 'Acme Corp',
        status: 'Converted',
      },
    });

    await expect(
      convertLead('lead-1', 'user-123', {}),
    ).rejects.toThrow('Lead has already been converted');
  });

  it('links to existing account when account_id is provided', async () => {
    setupLeadConversionMocks({ accountExists: true, existingAccountName: 'Existing Corp' });

    const result = await convertLead('lead-1', 'user-123', {
      accountId: 'existing-account-id',
    });

    expect(result.account.id).toBe('existing-account-id');
    expect(result.account.name).toBe('Existing Corp');
  });

  it('throws NOT_FOUND when provided account_id does not exist', async () => {
    setupLeadConversionMocks({ accountExists: false });

    await expect(
      convertLead('lead-1', 'user-123', { accountId: 'nonexistent-id' }),
    ).rejects.toThrow('Account not found');
  });

  it('skips opportunity creation when create_opportunity is false', async () => {
    setupLeadConversionMocks();

    const result = await convertLead('lead-1', 'user-123', {
      createOpportunity: false,
    });

    expect(result.opportunity).toBeNull();
    expect(result.account).toBeDefined();
    expect(result.contact).toBeDefined();
  });

  it('rolls back transaction on error', async () => {
    setupLeadConversionMocks();

    // Make the INSERT for account fail
    const originalImpl = clientQuery.getMockImplementation();
    let insertCount = 0;
    clientQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      const s = sql.replace(/\s+/g, ' ').trim().toUpperCase();
      if (s.startsWith('INSERT INTO RECORDS')) {
        insertCount++;
        if (insertCount === 1) {
          throw new Error('Database error');
        }
      }
      if (typeof originalImpl === 'function') {
        return originalImpl(sql, params);
      }
      return { rows: [] };
    });

    await expect(
      convertLead('lead-1', 'user-123', {}),
    ).rejects.toThrow('Database error');

    // Verify ROLLBACK was called
    const calls = clientQuery.mock.calls.map((c: unknown[]) =>
      (c[0] as string).replace(/\s+/g, ' ').trim().toUpperCase(),
    );
    expect(calls).toContain('ROLLBACK');
    expect(clientRelease).toHaveBeenCalled();
  });

  it('creates opportunity with computed name "{company} - Opportunity"', async () => {
    setupLeadConversionMocks({
      leadFieldValues: {
        first_name: 'Jane',
        last_name: 'Doe',
        company: 'MegaCorp',
        email: 'jane@mega.com',
        status: 'Qualified',
        estimated_value: 100000,
      },
    });

    const result = await convertLead('lead-1', 'user-123', {});

    expect(result.opportunity).toBeDefined();
    expect(result.opportunity!.name).toBe('MegaCorp - Opportunity');
  });

  it('defaults create_opportunity to true', async () => {
    setupLeadConversionMocks();

    const result = await convertLead('lead-1', 'user-123', {});

    expect(result.opportunity).not.toBeNull();
  });
});
