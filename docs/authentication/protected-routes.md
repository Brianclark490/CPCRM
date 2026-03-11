# Protected Routes and Session Handling

This document describes how CPCRM protects frontend routes and manages session state.

## Overview

All routes in the application that require an authenticated user are wrapped with the `ProtectedRoute` component. This component uses the Descope SDK's `useSession()` hook to determine whether the current user has an active, valid session before rendering the requested page.

## Route Structure

```
/               → redirects to /dashboard
/login          → public (LoginPage)
/unauthorized   → public (UnauthorizedPage)
/dashboard      → protected (DashboardPage)
*               → public catch-all (NotFoundPage)
```

Protected routes are wrapped at the route level in `App.tsx`:

```tsx
<Route
  path="/dashboard"
  element={
    <ProtectedRoute>
      <DashboardPage />
    </ProtectedRoute>
  }
/>
```

## ProtectedRoute Component

`apps/web/src/components/ProtectedRoute.tsx`

The `ProtectedRoute` component handles three states:

| State | Behaviour |
|---|---|
| Session is loading | Renders a loading indicator while the SDK initialises |
| Session is active and valid | Renders the child component |
| No active session | Redirects to `/login` |

### Session Expiry Detection

The component uses a lightweight external store (`sessionHistory`) that is updated from event handlers — specifically from `LoginPage` on successful authentication and from `DashboardPage` on logout. `ProtectedRoute` reads this store with `useSyncExternalStore`, which keeps it compatible with the React Compiler.

When a previously-authenticated session expires (the refresh token becomes invalid), the component redirects to `/login` and passes `{ reason: 'session_expired' }` as route state. The login page reads this state and displays an informational message.

If a user arrives at a protected route without ever having authenticated in the current tab session, the redirect happens silently with no extra state.

## Login Page

`apps/web/src/pages/LoginPage.tsx`

- **Session expiry message**: When redirected from a `ProtectedRoute` with `reason: 'session_expired'`, the login page renders an alert: *"Your session has expired. Please sign in again."*
- **Already-authenticated redirect**: If a logged-in user navigates directly to `/login`, they are immediately redirected to `/dashboard`. This prevents re-authentication during an active session.

## Unauthorized Page

`apps/web/src/pages/UnauthorizedPage.tsx`

Available at `/unauthorized`, this page is shown when a user attempts to access a resource they are not permitted to view (e.g., after a backend API returns `401` or `403`). It provides a clear message and a link back to the dashboard.

## Not Found Page

`apps/web/src/pages/NotFoundPage.tsx`

A catch-all route (`*`) renders this page for any unknown URL, giving users a clear indication that the page does not exist and a way to navigate back to the dashboard.

## Logout

Logout is handled in `DashboardPage` (and any other authenticated page that exposes a sign-out action) using the `useDescope()` hook:

```tsx
const { logout } = useDescope();

const handleLogout = async () => {
  await logout();
  void navigate('/login');
};
```

Calling `logout()` clears the Descope session token and refresh token from the browser. Any subsequent navigation to a protected route will be blocked by `ProtectedRoute` and the user will be redirected to `/login`.

## Session Handling Behaviour Summary

| Scenario | Result |
|---|---|
| Unauthenticated user visits `/dashboard` | Redirected to `/login` |
| Session expires while user is on `/dashboard` | Redirected to `/login` with expiry message |
| Authenticated user visits `/login` | Redirected to `/dashboard` |
| User clicks Sign out | Session cleared, redirected to `/login` |
| User visits an unknown URL | Shown `NotFoundPage` |
| User visits `/unauthorized` | Shown `UnauthorizedPage` with access denied message |

## Configuration

No additional configuration is required for protected route and session handling beyond the standard Descope project ID setup. See [descope-setup.md](./descope-setup.md) for required environment variables.

The Descope `AuthProvider` in `main.tsx` automatically handles session token refresh in the background. `useSession()` reflects the current session state reactively, so any change (including expiry) is propagated to `ProtectedRoute` without a page reload.
