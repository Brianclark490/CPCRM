import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './lib/queryClient.js';
import { TenantSettingsProvider } from './store/tenantSettings.js';
import { SessionSync } from './components/SessionSync.js';
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { AccountsPage } from './pages/AccountsPage.js';
import { AccountDetailPage } from './pages/AccountDetailPage.js';
import { AdminPage } from './pages/AdminPage.js';
import { ObjectManagerPage } from './pages/ObjectManagerPage.js';
import { FieldBuilderPage } from './pages/FieldBuilderPage.js';
import { PageBuilderPage } from './pages/PageBuilderPage.js';
import { PipelineManagerPage } from './pages/PipelineManagerPage.js';
import { PipelineDetailPage } from './pages/PipelineDetailPage.js';
import { OrganisationProvisioningPage } from './pages/OrganisationProvisioningPage.js';
import { CreateAccountPage } from './pages/CreateAccountPage.js';
import { RecordListPage } from './pages/RecordListPage.js';
import { RecordCreatePage } from './pages/RecordCreatePage.js';
import { RecordDetailPage } from './pages/RecordDetailPage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { SettingsProfilePage } from './pages/SettingsProfilePage.js';
import { AdminUsersPage } from './pages/AdminUsersPage.js';
import { AdminRolesPage } from './pages/AdminRolesPage.js';
import { AdminAuditPage } from './pages/AdminAuditPage.js';
import { UnauthorizedPage } from './pages/UnauthorizedPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { TenantPickerPage } from './pages/TenantPickerPage.js';
import { PlatformTenantsPage } from './pages/PlatformTenantsPage.js';
import { PlatformTenantDetailPage } from './pages/PlatformTenantDetailPage.js';
import { AdminTenantSettingsPage } from './pages/AdminTenantSettingsPage.js';
import { AdminTargetsPage } from './pages/AdminTargetsPage.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { TenantGuard } from './components/TenantGuard.js';
import { AppShell } from './components/AppShell.js';
import { RouteErrorBoundary } from './components/RouteErrorBoundary.js';

function OpportunityDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/objects/opportunity/${id ?? ''}`} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <SessionSync />
      <QueryClientProvider client={queryClient}>
      <TenantSettingsProvider>
      <RouteErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route
          path="/select-tenant"
          element={
            <ProtectedRoute>
              <TenantPickerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <DashboardPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route path="/opportunities" element={<Navigate to="/objects/opportunity" replace />} />
        <Route path="/opportunities/new" element={<Navigate to="/objects/opportunity/new" replace />} />
        <Route path="/opportunities/:id" element={<OpportunityDetailRedirect />} />
        <Route
          path="/accounts"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <AccountsPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts/new"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <CreateAccountPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts/:id"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <AccountDetailPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <AdminPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/objects"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <ObjectManagerPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/objects/:id"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <FieldBuilderPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/objects/:objectId/page-builder"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <PageBuilderPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/pipelines"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <PipelineManagerPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/pipelines/:id"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <PipelineDetailPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <AdminUsersPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/roles"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <AdminRolesPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <AdminAuditPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/targets"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <AdminTargetsPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <ProtectedRoute>
              <AppShell>
                <AdminTenantSettingsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <ProfilePage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/profile"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <SettingsProfilePage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/objects/:apiName"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <RecordListPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/objects/:apiName/pipeline"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <RecordListPage initialView="pipeline" />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/objects/:apiName/new"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <RecordCreatePage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/objects/:apiName/:id"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <RecordDetailPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/organisations/new"
          element={
            <ProtectedRoute>
              <OrganisationProvisioningPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/platform/tenants"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <PlatformTenantsPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/platform/tenants/:id"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <PlatformTenantDetailPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </RouteErrorBoundary>
      </TenantSettingsProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </BrowserRouter>
  );
}
