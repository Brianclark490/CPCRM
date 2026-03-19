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
import { UnauthorizedPage } from './pages/UnauthorizedPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { TenantPickerPage } from './pages/TenantPickerPage.js';
import { PlatformTenantsPage } from './pages/PlatformTenantsPage.js';
import { PlatformTenantDetailPage } from './pages/PlatformTenantDetailPage.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
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
              <AppShell>
                <DashboardPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/opportunities"
          element={
            <ProtectedRoute>
              <AppShell>
                <OpportunitiesPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/opportunities/new"
          element={
            <ProtectedRoute>
              <AppShell>
                <CreateOpportunityPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/opportunities/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <OpportunityDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts"
          element={
            <ProtectedRoute>
              <AppShell>
                <AccountsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts/new"
          element={
            <ProtectedRoute>
              <AppShell>
                <CreateAccountPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <AccountDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AppShell>
                <AdminPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/objects"
          element={
            <ProtectedRoute>
              <AppShell>
                <ObjectManagerPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/objects/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <FieldBuilderPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/pipelines"
          element={
            <ProtectedRoute>
              <AppShell>
                <PipelineManagerPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/pipelines/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <PipelineDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AppShell>
                <ProfilePage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/objects/:apiName"
          element={
            <ProtectedRoute>
              <AppShell>
                <RecordListPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/objects/:apiName/pipeline"
          element={
            <ProtectedRoute>
              <AppShell>
                <RecordListPage initialView="pipeline" />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/objects/:apiName/new"
          element={
            <ProtectedRoute>
              <AppShell>
                <RecordCreatePage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/objects/:apiName/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <RecordDetailPage />
              </AppShell>
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
              <AppShell>
                <PlatformTenantsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/platform/tenants/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <PlatformTenantDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
