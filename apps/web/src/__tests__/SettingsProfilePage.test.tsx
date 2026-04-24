import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsProfilePage } from '../pages/SettingsProfilePage.js';

vi.mock('@descope/react-sdk', () => ({
  UserProfile: ({ widgetId, theme }: { widgetId: string; theme?: string }) => (
    <div data-testid="user-profile-widget" data-widget-id={widgetId} data-theme={theme} />
  ),
}));

// The page now renders <ConnectMailboxCard />, which fetches mailbox status.
// Stub the api client so the test doesn't attempt a network call.
vi.mock('../lib/apiClient.js', () => ({
  useApiClient: () => ({
    get: vi.fn().mockResolvedValue({ connected: false, status: 'disconnected', emailAddress: null, provider: null }),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
    request: vi.fn(),
  }),
}));

describe('SettingsProfilePage', () => {
  it('renders the page heading', () => {
    render(
      <MemoryRouter>
        <SettingsProfilePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'My profile' })).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(
      <MemoryRouter>
        <SettingsProfilePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText('Manage your personal details and preferences'),
    ).toBeInTheDocument();
  });

  it('renders the Descope UserProfile widget', () => {
    render(
      <MemoryRouter>
        <SettingsProfilePage />
      </MemoryRouter>,
    );

    const widget = screen.getByTestId('user-profile-widget');
    expect(widget).toBeInTheDocument();
    expect(widget).toHaveAttribute('data-widget-id', 'user-profile-widget');
  });

  it('passes theme="dark" to the UserProfile widget', () => {
    render(
      <MemoryRouter>
        <SettingsProfilePage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('user-profile-widget')).toHaveAttribute('data-theme', 'dark');
  });
});
