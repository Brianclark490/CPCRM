# CodeQL Security Warnings — Resolution Summary

## Fixed (Critical / High)

### 1. SQL injection via string interpolation in JSONB queries

**Severity:** Critical  
**File:** `apps/api/src/services/recordService.ts`  
**Pattern:** `js/sql-injection`

JSONB field names were interpolated directly into SQL query strings using template literals (`r.field_values->>'${fieldName}'`) for search and sort operations. Although a `isSafeIdentifier()` validation guard was present, CodeQL flagged the string interpolation as a SQL injection vector.

**Fix:** Replaced all JSONB key interpolation with parameterised queries (`r.field_values->>$N`) where the field name is passed as a bind parameter. This eliminates the string interpolation entirely.

### 2. Incomplete URL scheme check

**Severity:** High  
**Files:** `apps/api/src/services/recordService.ts`, `apps/api/src/services/accountService.ts`  
**Pattern:** `js/incomplete-url-scheme-check`

The URL validation for both the `url` field type and the `validateWebsite()` function accepted any URL scheme including `javascript:`, `data:`, and `ftp:`. This could allow stored XSS or data exfiltration if URLs are rendered in the frontend without additional sanitisation.

**Fix:** Added explicit protocol validation after `new URL()` parsing to only allow `http:` and `https:` schemes.

### 3. LIKE wildcard injection

**Severity:** High  
**Files:** `apps/api/src/services/recordService.ts`, `apps/api/src/services/accountService.ts`  
**Pattern:** `js/sql-injection` (variant)

User-supplied search terms were wrapped in `%...%` for SQL LIKE patterns without escaping special LIKE metacharacters (`%`, `_`, `\`). While parameterised queries prevented actual SQL injection, unescaped metacharacters allowed attackers to manipulate search patterns (e.g., `%` would match everything).

**Fix:** Added `escapeLikePattern()` helper that escapes `%`, `_`, and `\` before embedding in LIKE patterns.

### 4. Prototype pollution prevention

**Severity:** High  
**File:** `apps/api/src/services/recordService.ts`  
**Pattern:** `js/prototype-polluting-assignment`

User-supplied field values were iterated via `Object.entries()` and merged with existing values using the spread operator (`{ ...existing, ...userInput }`). While the field name allowlist provided some protection, keys like `__proto__`, `constructor`, and `prototype` were not explicitly blocked.

**Fix:** Added `stripUnsafeKeys()` helper that removes `__proto__`, `constructor`, and `prototype` from user-supplied objects before processing. Applied to both `createRecord` and `updateRecord`.

## Fixed (Medium)

### 5. Missing security headers

**Severity:** Medium  
**File:** `apps/api/src/index.ts`  
**Pattern:** `js/missing-security-headers`

The Express application did not set security-related HTTP headers (X-Content-Type-Options, X-Frame-Options, Content-Security-Policy, Strict-Transport-Security, etc.).

**Fix:** Added `helmet` middleware as the first middleware in the Express pipeline. Helmet sets a comprehensive set of security headers with secure defaults.

### 6. CodeQL CI workflow

**Severity:** Medium (process)  
**File:** `.github/workflows/codeql.yml`

No automated security scanning was configured in CI. This allowed security issues to be introduced without detection.

**Fix:** Added a CodeQL GitHub Actions workflow that runs on every push and pull request to `develop`, `staging`, and `main` branches, plus a weekly scheduled scan. Uses `security-and-quality` query suite to catch both security vulnerabilities and code quality issues.

## Catalogued (Medium / Low) — Remaining Items

### 7. SSL certificate verification disabled in production

**Severity:** Medium  
**File:** `apps/api/src/db/client.ts` (line 63)  
**Status:** Accepted risk — required for Azure Database for PostgreSQL

```typescript
ssl: process.env.NODE_ENV === 'production'
  ? { rejectUnauthorized: false }
  : undefined,
```

Azure Database for PostgreSQL uses Microsoft-managed certificates that are rotated periodically. Setting `rejectUnauthorized: false` is the standard pattern recommended by Azure documentation for App Service to PostgreSQL connections. The connection is still encrypted (TLS), but the client does not verify the server's certificate chain.

**Mitigation plan:** When Azure supports pinning the DigiCert root CA reliably, switch to `rejectUnauthorized: true` with `ca: [azureRootCert]`.

### 8. Rate limiting coverage

**Severity:** Low  
**Status:** Partially addressed

Rate limiting is applied to `adminTargets`, `targets`, and `pageLayouts` routes. Other admin and record routes rely on authentication (Descope JWT) as the primary abuse prevention mechanism.

**Mitigation plan:** Add a global rate limiter middleware in a future iteration, with higher thresholds for authenticated users and lower thresholds for unauthenticated endpoints.

### 9. Log injection

**Severity:** Low  
**Pattern:** `js/log-injection`  
**Status:** False positive / accepted

Pino logger serialises all values as structured JSON, which neutralises log injection attacks. CodeQL may flag user-controlled values passed to `logger.info()` / `logger.warn()`, but Pino's JSON serialisation prevents newline injection and log forging.

### 10. Express.json() body size limit

**Severity:** Low  
**File:** `apps/api/src/index.ts`  
**Status:** Accepted — Express 5 defaults to 100kb

Express 5.x defaults to a 100KB body size limit for `express.json()`, which is sufficient for the CRM's use case. No explicit `limit` option is needed unless larger payloads are required.

### 11. Missing CSRF protection

**Severity:** Low  
**Status:** Not applicable for API-only architecture

CPCRM uses Bearer token (JWT) authentication, not cookie-based sessions. CSRF attacks require the browser to automatically send credentials (cookies), which does not apply to Authorization header-based auth.
