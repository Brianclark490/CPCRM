import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { OpportunitiesPage } from './pages/OpportunitiesPage.js';
import { AccountsPage } from './pages/AccountsPage.js';
import { AccountDetailPage } from './pages/AccountDetailPage.js';
import { AdminPage } from './pages/AdminPage.js';
import { ObjectManagerPage } from './pages/ObjectManagerPage.js';
import { FieldBuilderPage } from './pages/FieldBuilderPage.js';
import { PipelineManagerPage } from './pages/PipelineManagerPage.js';
import { PipelineDetailPage } from './pages/PipelineDetailPage.js';
import { OrganisationProvisioningPage } from './pages/OrganisationProvisioningPage.js';
import { CreateOpportunityPage } from './pages/CreateOpportunityPage.js';
import { OpportunityDetailPage } from './pages/OpportunityDetailPage.js';
import { CreateAccountPage } from './pages/CreateAccountPage.js';
import { RecordListPage } from './pages/RecordListPage.js';
import { RecordCreatePage } from './pages/RecordCreatePage.js';
import { RecordDetailPage } from './pages/RecordDetailPage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { SettingsProfilePage } from './pages/SettingsProfilePage.js';
import { AdminUsersPage } from './pages/AdminUsersPage.js';
import { AdminRolesPage } from './pages/AdminRolesPage.js';
import { UnauthorizedPage } from './pages/UnauthorizedPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { TenantPickerPage } from './pages/TenantPickerPage.js';
import { PlatformTenantsPage } from './pages/PlatformTenantsPage.js';
import { PlatformTenantDetailPage } from './pages/PlatformTenantDetailPage.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { TenantGuard } from './components/TenantGuard.js';
import { AppShell } from './components/AppShell.js';

export function App() {
  return (
    <BrowserRouter>
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
        <Route
          path="/opportunities"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <OpportunitiesPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/opportunities/new"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <CreateOpportunityPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/opportunities/:id"
          element={
            <ProtectedRoute>
              <TenantGuard>
                <AppShell>
                  <OpportunityDetailPage />
                </AppShell>
              </TenantGuard>
            </ProtectedRoute>
          }
        />
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
    </BrowserRouter>
  );
}
