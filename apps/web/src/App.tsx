import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { OpportunitiesPage } from './pages/OpportunitiesPage.js';
import { AccountsPage } from './pages/AccountsPage.js';
import { AccountDetailPage } from './pages/AccountDetailPage.js';
import { AdminPage } from './pages/AdminPage.js';
import { OrganisationProvisioningPage } from './pages/OrganisationProvisioningPage.js';
import { CreateOpportunityPage } from './pages/CreateOpportunityPage.js';
import { OpportunityDetailPage } from './pages/OpportunityDetailPage.js';
import { CreateAccountPage } from './pages/CreateAccountPage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { UnauthorizedPage } from './pages/UnauthorizedPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { AppShell } from './components/AppShell.js';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
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
          path="/organisations/new"
          element={
            <ProtectedRoute>
              <OrganisationProvisioningPage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
