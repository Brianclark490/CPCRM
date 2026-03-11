# Descope Authentication Setup

This document describes how to configure Descope for local development and the dev environment.

## What is Descope?

[Descope](https://www.descope.com/) is a no-code authentication and user management platform. CPCRM uses Descope as its identity provider. The Descope SDK handles the authentication flow on the frontend, and the backend validates Descope-issued session tokens on every protected request.

## Architecture Overview

```
Browser (React)
  └─ @descope/react-sdk  ──►  Descope hosted flow (sign-up-or-in)
                                │
                    Returns session token (JWT)
                                │
                                ▼
API (Node.js / Express)
  └─ @descope/node-sdk  ──►  validateSession(token)
                                │
                    Returns authenticated user claims
```

## Required Configuration Values

### Frontend (`apps/web/.env`)

| Variable | Description | Where to find it |
|---|---|---|
| `VITE_DESCOPE_PROJECT_ID` | Your Descope project ID (safe to expose in the browser) | [Descope Console → Project Settings](https://app.descope.com/settings/project) |

### Backend (`apps/api/.env`)

| Variable | Description | Where to find it |
|---|---|---|
| `DESCOPE_PROJECT_ID` | Your Descope project ID (same value as frontend) | [Descope Console → Project Settings](https://app.descope.com/settings/project) |
| `PORT` | Port for the API server (optional, default: `3001`) | Set to any available port |
| `CORS_ORIGIN` | Allowed CORS origin for the frontend (optional, default: `http://localhost:5173`) | URL where the frontend dev server runs |

## Local Development Setup

### 1. Create a Descope Account and Project

1. Sign up at <https://app.descope.com>
2. Create a new project (e.g., `CPCRM Dev`)
3. Copy your **Project ID** from Project Settings — it starts with `P`

### 2. Configure the Authentication Flow

In the Descope Console:

1. Go to **Flows** and open (or create) the **sign-up-or-in** flow
2. Configure your preferred authentication method (e.g., Magic Link, OTP, SSO)
3. Save and publish the flow

### 3. Set Environment Variables

Copy the example files and fill in your values:

```bash
# Backend
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env and set DESCOPE_PROJECT_ID

# Frontend
cp apps/web/.env.example apps/web/.env
# Edit apps/web/.env and set VITE_DESCOPE_PROJECT_ID
```

Both files use the **same Descope Project ID** — the frontend uses it to load the hosted auth flow, the backend uses it to verify tokens.

### 4. Start the Development Servers

```bash
# Terminal 1 — API server (port 3001)
npm run dev --workspace=apps/api

# Terminal 2 — Frontend dev server (port 5173)
npm run dev --workspace=apps/web
```

Navigate to <http://localhost:5173>. You will be redirected to `/login`. Complete the Descope authentication flow and you will land on the `/dashboard` page.

## Development Environment (Azure)

In the Azure App Service and Static Web App, configuration is injected via **Azure App Configuration** and **Key Vault references** — no `.env` files are used in deployed environments.

| Setting name | Azure resource | Notes |
|---|---|---|
| `DESCOPE_PROJECT_ID` | App Service application settings (sourced from Key Vault: `descope-api-key`) | Set during provisioning; see the [environment provisioning runbook](../runbooks/environment-provisioning-order.md) |
| `VITE_DESCOPE_PROJECT_ID` | Static Web App environment variables | Set at build time via the CI/CD pipeline |

## Security Notes

- **Never commit `.env` files** to source control — they are listed in `.gitignore`.
- The Descope **Project ID** is a public identifier (it is embedded in the frontend bundle). It does not need to be kept secret.
- The **Descope Management Key** (used for server-side admin operations) is a secret and must be stored in Azure Key Vault. It is not used in this integration.
- Session tokens issued by Descope are short-lived JWTs. The backend verifies them cryptographically using the public key fetched from Descope's JWKS endpoint — no shared secret is required.
- Invalid, expired, or missing tokens are rejected by the `requireAuth` middleware with HTTP `401 Unauthorized`.

## Logout

The **Sign out** button on the Dashboard page calls `logout()` from `useDescope()`. This clears the local session (clears the token from memory/storage) and redirects the user to `/login`. Descope's `logout` call also invalidates the refresh token on the server side.

## Testing the Integration

### Unit Tests

```bash
# API middleware tests
npm run test --workspace=apps/api

# Frontend component tests
npm run test --workspace=apps/web
```

### End-to-End (Manual) Test

1. Open <http://localhost:5173> — you should be redirected to `/login`
2. Complete the Descope sign-up/sign-in flow
3. You should land on `/dashboard` and see your name or email
4. Click **Sign out** — you should be redirected back to `/login`
5. Try accessing `/dashboard` directly after logout — you should be redirected to `/login` again

### Verifying Token Validation

```bash
# Get your session token after login (check browser localStorage or DevTools)
TOKEN="<paste_your_token_here>"

# Should succeed (200)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/me

# Should fail (401)
curl http://localhost:3001/me
curl -H "Authorization: Bearer invalid_token" http://localhost:3001/me
```
