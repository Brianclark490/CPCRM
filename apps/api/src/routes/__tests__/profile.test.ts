import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.js';

// ─── Mock middleware ──────────────────────────────────────────────────────────

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
}));

// ─── Mock the profile service ─────────────────────────────────────────────────

const mockGetOrCreateProfile = vi.fn();
const mockUpdateProfile = vi.fn();

vi.mock('../../services/profileService.js', () => ({
  getOrCreateProfile: mockGetOrCreateProfile,
  updateProfile: mockUpdateProfile,
}));

// ─── Mock logger so tests stay silent ────────────────────────────────────────

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { handleGetProfile, handleUpdateProfile } = await import('../profile.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(
  body: unknown = {},
  user = { userId: 'user-123' },
) {
  return {
    body,
    path: '/profile',
    user,
  } as unknown as AuthenticatedRequest;
}

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function makeProfile(overrides = {}) {
  const now = new Date();
  return {
    id: 'profile-uuid',
    userId: 'user-123',
    displayName: undefined,
    jobTitle: undefined,
    updatedBy: 'user-123',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ─── GET /profile ─────────────────────────────────────────────────────────────

describe('GET /profile', () => {
  beforeEach(() => {
    mockGetOrCreateProfile.mockReset();
  });

  it('returns 200 with the user profile on success', async () => {
    const profile = makeProfile({ displayName: 'Alice' });
    mockGetOrCreateProfile.mockResolvedValue(profile);

    const req = mockReq();
    const res = mockRes();

    await handleGetProfile(req, res);

    expect(mockGetOrCreateProfile).toHaveBeenCalledWith('user-123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(profile);
  });

  it('returns 200 with an empty profile when no optional fields are set', async () => {
    const profile = makeProfile();
    mockGetOrCreateProfile.mockResolvedValue(profile);

    const req = mockReq();
    const res = mockRes();

    await handleGetProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(profile);
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockGetOrCreateProfile.mockRejectedValue(new Error('Database error'));

    const req = mockReq();
    const res = mockRes();

    await handleGetProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});

// ─── PUT /profile ─────────────────────────────────────────────────────────────

describe('PUT /profile', () => {
  beforeEach(() => {
    mockUpdateProfile.mockReset();
  });

  it('returns 200 with the updated profile on success', async () => {
    const profile = makeProfile({ displayName: 'Alice Updated', jobTitle: 'Engineer' });
    mockUpdateProfile.mockResolvedValue(profile);

    const req = mockReq({ displayName: 'Alice Updated', jobTitle: 'Engineer' });
    const res = mockRes();

    await handleUpdateProfile(req, res);

    expect(mockUpdateProfile).toHaveBeenCalledWith(
      'user-123',
      { displayName: 'Alice Updated', jobTitle: 'Engineer' },
      'user-123',
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(profile);
  });

  it('only passes fields present in the request body to the service', async () => {
    const profile = makeProfile({ jobTitle: 'Manager' });
    mockUpdateProfile.mockResolvedValue(profile);

    const req = mockReq({ jobTitle: 'Manager' });
    const res = mockRes();

    await handleUpdateProfile(req, res);

    expect(mockUpdateProfile).toHaveBeenCalledWith(
      'user-123',
      { jobTitle: 'Manager' },
      'user-123',
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 400 when the service throws a VALIDATION_ERROR', async () => {
    const validationErr = Object.assign(new Error('Display name must not be blank'), {
      code: 'VALIDATION_ERROR',
    });
    mockUpdateProfile.mockRejectedValue(validationErr);

    const req = mockReq({ displayName: '' });
    const res = mockRes();

    await handleUpdateProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Display name must not be blank' });
  });

  it('returns 404 when the service throws a NOT_FOUND error', async () => {
    const notFoundErr = Object.assign(new Error('Profile not found'), { code: 'NOT_FOUND' });
    mockUpdateProfile.mockRejectedValue(notFoundErr);

    const req = mockReq({ displayName: 'Alice' });
    const res = mockRes();

    await handleUpdateProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Profile not found' });
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('Database error'));

    const req = mockReq({ displayName: 'Alice' });
    const res = mockRes();

    await handleUpdateProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred' });
  });
});
