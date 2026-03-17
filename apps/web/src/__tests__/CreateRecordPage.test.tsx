import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CreateRecordPage } from '../pages/CreateRecordPage.js';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@descope/react-sdk', () => ({
  useSession: vi.fn(),
}));

const { useSession } = await import('@descope/react-sdk');

function renderPage(apiName = 'contact') {
  return render(
    <MemoryRouter initialEntries={[`/objects/${apiName}/new`]}>
      <Routes>
        <Route path="/objects/:apiName/new" element={<CreateRecordPage />} />
        <Route path="/objects/:apiName" element={<div>List Page</div>} />
        <Route path="/objects/:apiName/:id" element={<div>Detail Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// ─── Mock fetch helpers ─────────────────────────────────────────────────────

function mockFetchWithFields(fields: Array<{
  id: string;
  apiName: string;
  label: string;
  fieldType: string;
  required: boolean;
  options: Record<string, unknown>;
  sortOrder: number;
}> = []) {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    // Admin objects list
    if (typeof url === 'string' && url.includes('/api/admin/objects') && !url.includes('/fields') && !url.includes('/layouts')) {
      return Promise.resolve({
        ok: true,
        json: async () => [
          { id: 'obj-1', apiName: 'contact', label: 'Contact', pluralLabel: 'Contacts', isSystem: false },
        ],
      } as Response);
    }

    // Fields list
    if (typeof url === 'string' && url.includes('/fields')) {
      return Promise.resolve({
        ok: true,
        json: async () => fields,
      } as Response);
    }

    // Layout detail
    if (typeof url === 'string' && url.match(/\/layouts\/[^/]+$/)) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: 'layout-1',
          objectId: 'obj-1',
          name: 'Default Form',
          layoutType: 'form',
          isDefault: true,
          fields: fields.map((f, i) => ({
            fieldId: f.id,
            fieldApiName: f.apiName,
            fieldLabel: f.label,
            fieldType: f.fieldType,
            fieldRequired: f.required,
            fieldOptions: f.options,
            sortOrder: i,
            section: 0,
            sectionLabel: 'Details',
            width: f.fieldType === 'textarea' ? 'full' : 'half',
          })),
        }),
      } as Response);
    }

    // Layouts list
    if (typeof url === 'string' && url.includes('/layouts')) {
      return Promise.resolve({
        ok: true,
        json: async () => [
          { id: 'layout-1', objectId: 'obj-1', name: 'Default Form', layoutType: 'form', isDefault: true },
        ],
      } as Response);
    }

    // Create record
    if (typeof url === 'string' && url.match(/\/api\/objects\/[^/]+\/records$/)) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'new-record-uuid' }),
      } as Response);
    }

    return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const DEFAULT_FIELDS = [
  { id: 'f1', apiName: 'first_name', label: 'First Name', fieldType: 'text', required: true, options: {}, sortOrder: 0 },
  { id: 'f2', apiName: 'last_name', label: 'Last Name', fieldType: 'text', required: true, options: {}, sortOrder: 1 },
  { id: 'f3', apiName: 'email', label: 'Email', fieldType: 'email', required: false, options: {}, sortOrder: 2 },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CreateRecordPage', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      isAuthenticated: true,
      isSessionLoading: false,
      sessionToken: 'test-token',
      claims: {},
    });
    mockNavigate.mockReset();
  });

  it('renders the page heading with the object label', async () => {
    mockFetchWithFields(DEFAULT_FIELDS);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Create contact/i })).toBeInTheDocument();
    });
  });

  it('renders a breadcrumb navigation to the list page', async () => {
    mockFetchWithFields(DEFAULT_FIELDS);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Contacts')).toBeInTheDocument();
    });
  });

  it('renders form fields from field definitions', async () => {
    mockFetchWithFields(DEFAULT_FIELDS);
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/First Name/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Last Name/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    });
  });

  it('shows required indicators on required fields', async () => {
    mockFetchWithFields(DEFAULT_FIELDS);
    renderPage();

    await waitFor(() => {
      const firstNameLabel = screen.getByText('First Name');
      expect(firstNameLabel.closest('label')?.querySelector('span')).toHaveTextContent('*');
    });
  });

  it('shows client-side validation error for required fields', async () => {
    mockFetchWithFields(DEFAULT_FIELDS);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create contact/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Create contact/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent("Field 'First Name' is required");
    });
  });

  it('submits the form and navigates to the new record', async () => {
    const fetchMock = mockFetchWithFields(DEFAULT_FIELDS);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/First Name/)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/First Name/), 'John');
    await user.type(screen.getByLabelText(/Last Name/), 'Doe');
    await user.click(screen.getByRole('button', { name: /Create contact/i }));

    await waitFor(() => {
      const createCalls = fetchMock.mock.calls.filter(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).match(/\/api\/objects\/[^/]+\/records$/),
      );
      expect(createCalls.length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/objects/contact/new-record-uuid');
    });
  });

  it('shows an error when the API returns an error', async () => {
    const fetchMock = mockFetchWithFields(DEFAULT_FIELDS);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/First Name/)).toBeInTheDocument();
    });

    // Override fetch for the create call to return an error
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.match(/\/api\/objects\/[^/]+\/records$/) && opts?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: "Field 'Email' must be a valid email" }),
        } as Response);
      }
      // Return default responses for other calls
      if (typeof url === 'string' && url.includes('/api/admin/objects') && !url.includes('/fields') && !url.includes('/layouts')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 'obj-1', apiName: 'contact', label: 'Contact', pluralLabel: 'Contacts', isSystem: false },
          ],
        } as Response);
      }
      return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
    });

    await user.type(screen.getByLabelText(/First Name/), 'John');
    await user.type(screen.getByLabelText(/Last Name/), 'Doe');
    await user.click(screen.getByRole('button', { name: /Create contact/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent("Field 'Email' must be a valid email");
    });
  });

  it('navigates back when Cancel is clicked', async () => {
    mockFetchWithFields(DEFAULT_FIELDS);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockNavigate).toHaveBeenCalledWith('/objects/contact');
  });

  it('shows error when object type is not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/admin/objects') && !url.includes('/fields') && !url.includes('/layouts')) {
          return Promise.resolve({
            ok: true,
            json: async () => [],
          } as Response);
        }
        return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
      }),
    );

    renderPage('nonexistent');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Object type not found.');
    });
  });

  it('shows section label from layout', async () => {
    mockFetchWithFields(DEFAULT_FIELDS);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Details')).toBeInTheDocument();
    });
  });
});
