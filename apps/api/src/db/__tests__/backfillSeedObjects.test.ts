import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockSeedDefaultObjects = vi.fn();

vi.mock('../client.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

vi.mock('../../services/seedDefaultObjects.js', () => ({
  seedDefaultObjects: (...args: unknown[]) => mockSeedDefaultObjects(...args),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { backfillSeedObjects } = await import('../backfillSeedObjects.js');

describe('backfillSeedObjects', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockSeedDefaultObjects.mockReset();
  });

  it('skips when no tenants exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await backfillSeedObjects();

    expect(mockSeedDefaultObjects).not.toHaveBeenCalled();
  });

  it('calls seedDefaultObjects for each tenant', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'tenant-1' }, { id: 'tenant-2' }],
    });

    mockSeedDefaultObjects.mockResolvedValue({
      objectsCreated: 0,
      objectsSkipped: 11,
      fieldsCreated: 0,
      fieldsSkipped: 50,
      relationshipsCreated: 0,
      relationshipsSkipped: 10,
      layoutsCreated: 0,
      layoutsSkipped: 10,
      layoutFieldsCreated: 0,
      layoutFieldsSkipped: 50,
      leadConversionMappingsCreated: 0,
      leadConversionMappingsSkipped: 5,
      pipelinesCreated: 0,
      pipelinesSkipped: 1,
      stagesCreated: 0,
      stagesSkipped: 5,
      stageGatesCreated: 0,
      stageGatesSkipped: 3,
    });

    await backfillSeedObjects();

    expect(mockSeedDefaultObjects).toHaveBeenCalledTimes(2);
    expect(mockSeedDefaultObjects).toHaveBeenCalledWith('tenant-1', 'SYSTEM');
    expect(mockSeedDefaultObjects).toHaveBeenCalledWith('tenant-2', 'SYSTEM');
  });

  it('continues with other tenants when one fails', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'tenant-1' }, { id: 'tenant-2' }],
    });

    mockSeedDefaultObjects
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce({
        objectsCreated: 2,
        objectsSkipped: 9,
        fieldsCreated: 10,
        fieldsSkipped: 40,
        relationshipsCreated: 3,
        relationshipsSkipped: 7,
        layoutsCreated: 4,
        layoutsSkipped: 6,
        layoutFieldsCreated: 10,
        layoutFieldsSkipped: 40,
        leadConversionMappingsCreated: 0,
        leadConversionMappingsSkipped: 5,
        pipelinesCreated: 0,
        pipelinesSkipped: 1,
        stagesCreated: 0,
        stagesSkipped: 5,
        stageGatesCreated: 0,
        stageGatesSkipped: 3,
      });

    await backfillSeedObjects();

    expect(mockSeedDefaultObjects).toHaveBeenCalledTimes(2);
  });
});
