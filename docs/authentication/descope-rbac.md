# Descope RBAC — Roles and Permissions

This document describes the role-based access control (RBAC) configuration in Descope and how it integrates with the CPCRM backend.

## Overview

CPCRM uses Descope's built-in RBAC feature to manage roles and permissions. Roles and permissions are configured in the Descope console and appear as claims inside the JWT issued to authenticated users. The API middleware extracts these claims and enforces access control on protected endpoints.

## Permissions

The following permissions are configured in the Descope console under **Authorization → RBAC → Permissions**:

| Permission | Description |
|---|---|
| `objects:manage` | Create, edit, delete object definitions and fields |
| `records:create` | Create new records |
| `records:read` | View records |
| `records:update` | Edit existing records |
| `records:delete` | Delete records |
| `records:read_all` | View all records (not just own) |
| `records:read_team` | View team members' records |
| `admin:access` | Access the admin plane UI |

## Roles

The following roles are configured in the Descope console under **Authorization → RBAC → Roles**:

| Role | Permissions |
|---|---|
| `admin` | `objects:manage`, `records:create`, `records:read`, `records:update`, `records:delete`, `records:read_all`, `admin:access` |
| `manager` | `records:create`, `records:read`, `records:update`, `records:delete`, `records:read_team` |
| `user` | `records:create`, `records:read`, `records:update` |
| `read_only` | `records:read` |

## Console Setup Steps

### 1. Create Permissions

1. Open the [Descope Console](https://app.descope.com)
2. Navigate to **Authorization → RBAC** tab → **Permissions**
3. Create each of the 8 permissions listed above with the given name and description

### 2. Create Roles

1. In the same RBAC tab, go to **Roles**
2. Create each of the 4 roles listed above
3. Assign the correct permissions to each role as shown in the table

### 3. Assign Your User the Admin Role

1. Go to **Users** in the Descope console
2. Find your user account and open the edit view
3. Assign the `admin` role

### 4. Verify the Configuration

After logging in to the app:

1. Open the browser DevTools → **Application** → **Local Storage** (or inspect cookies)
2. Locate the Descope session token (JWT)
3. Decode it at [jwt.io](https://jwt.io) or in the DevTools console
4. Confirm the token contains a `tenants` claim with `roles` and `permissions`:

```json
{
  "tenants": {
    "<your-tenant-id>": {
      "roles": ["admin"],
      "permissions": [
        "objects:manage",
        "records:create",
        "records:read",
        "records:update",
        "records:delete",
        "records:read_all",
        "admin:access"
      ]
    }
  }
}
```

If RBAC is configured at the project level (not tenant level), the claims appear at the top level of the JWT instead:

```json
{
  "roles": ["admin"],
  "permissions": ["objects:manage", "records:create", ...]
}
```

## How It Works in the Backend

### Token Extraction

The `requireAuth` middleware in `apps/api/src/middleware/auth.ts` validates the Descope session token and extracts `roles` and `permissions` from the JWT claims. It checks:

1. The `tenants` claim first — if present, roles/permissions come from the active tenant entry
2. Falls back to top-level `roles`/`permissions` claims (project-level RBAC)

These values are attached to `req.user.roles` and `req.user.permissions`.

### Permission Enforcement

The `requirePermission` middleware in `apps/api/src/middleware/permission.ts` checks that the authenticated user holds **all** of the specified permissions:

```ts
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';

// Require a single permission
router.post('/admin/objects', requireAuth, requirePermission('objects:manage'), handler);

// Require multiple permissions (all must be present)
router.delete('/records/:id', requireAuth, requirePermission('records:read', 'records:delete'), handler);
```

### Role Enforcement

The `requireRole` middleware checks that the user holds **at least one** of the specified roles:

```ts
import { requireRole } from '../middleware/permission.js';

// Require admin role
router.get('/admin', requireAuth, requireRole('admin'), handler);

// Allow admin or manager
router.get('/team', requireAuth, requireRole('admin', 'manager'), handler);
```

Both middlewares return `403 Forbidden` when the check fails.

## TypeScript Types

The `@cpcrm/types` package exports `DescopePermission` and `DescopeRole` string literal types for compile-time safety:

```ts
import type { DescopePermission, DescopeRole } from '@cpcrm/types';

const perm: DescopePermission = 'records:read';    // ✓
const role: DescopeRole = 'admin';                  // ✓
```

## Security Notes

- Permissions are enforced server-side in the API middleware — never rely solely on frontend checks.
- The frontend may read `roles`/`permissions` from the JWT to control UI visibility (e.g. hiding admin links), but this is a UX convenience, not a security boundary.
- Role and permission configuration changes in the Descope console take effect on the next token issuance. Existing sessions retain their previous claims until the token is refreshed.
