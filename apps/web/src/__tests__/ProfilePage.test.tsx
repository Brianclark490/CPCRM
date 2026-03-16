import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProfilePage } from '../pages/ProfilePage.js';

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

function renderPage() {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  );
}

const baseProfile = {
  id: 'profile-uuid',
  userId: 'user-123',
  displayName: 'Alice',
  jobTitle: 'Engineer',
  updatedBy: 'user-123',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows a loading state initially', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders the profile heading and form fields after loading', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseProfile,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Display name')).toBeInTheDocument();
    expect(screen.getByLabelText('Job title (optional)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeInTheDocument();
  });

  it('populates form fields with existing profile data', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => baseProfile,
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Alice')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('Engineer')).toBeInTheDocument();
  });

  it('shows an error alert when loading fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Unauthorised' }),
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Unauthorised');
    });
  });

  it('shows a network error when fetch throws during load', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to connect to the server. Please try again.',
      );
    });
  });

  it('submits the form with the correct payload and shows success message', async () => {
    const updatedProfile = { ...baseProfile, displayName: 'Alice Updated' };
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => baseProfile } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => updatedProfile } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Alice')).toBeInTheDocument();
    });

    const displayNameInput = screen.getByLabelText('Display name');
    await userEvent.clear(displayNameInput);
    await userEvent.type(displayNameInput, 'Alice Updated');

    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/profile',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Profile saved successfully.');
    });
  });

  it('shows a save error when the server returns a non-ok response', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => baseProfile } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Display name must be 100 characters or fewer' }),
      } as Response);

    renderPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Alice')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Display name must be 100 characters or fewer',
      );
    });
  });

  it('shows a network error when fetch throws during save', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => baseProfile } as Response)
      .mockRejectedValueOnce(new Error('Network error'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Alice')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to connect to the server. Please try again.',
      );
    });
  });
});
