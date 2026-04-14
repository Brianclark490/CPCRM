# ADR-005: API Versioning and Deprecation Policy

## Status

Accepted

## Context

Before CPCRM has any external API consumers, every HTTP route is mounted under
the bare `/api` prefix. That shape has served well for internal use — the
single-page web app is the only client today — but it leaves no room to ship
breaking changes without coordinated releases across the monorepo. As soon as
a third party (integration partner, mobile client, automation script, or
downstream service) takes a dependency on an endpoint, the shape of every
request and response becomes a public contract we cannot rewrite on a whim.

Introducing versioning **now**, while we still control 100 % of the callers, is
an order of magnitude cheaper than retrofitting it later. Doing it before
external consumers exist means:

1. We can pick a clean URL scheme without having to invent compatibility shims.
2. We can document a firm deprecation timeline that external integrators can
   plan around.
3. Future breaking changes (new request shape, removed field, renamed route)
   can land on `/api/v2` without coordinating a hard cutover.

---

## Decision

### 1. Canonical Versioned Prefix: `/api/v1`

Every current and future HTTP endpoint is mounted under a version-prefixed
path. The first version is `v1`:

```
/api/v1/health
/api/v1/auth/session
/api/v1/accounts
/api/v1/objects/:apiName/records
/api/v1/admin/pipelines
...
```

All routes are registered on a single Express `Router` in
`apps/api/src/index.ts` and that router is mounted at `/api/v1`. Mounting via a
shared router (rather than duplicating `app.use('/api/v1/...', routerA);
app.use('/api/v1/...', routerB);` by hand) guarantees that any new route added
to the registry is automatically available under the versioned prefix.

### 2. Legacy `/api` Alias With `Deprecation` Headers

The same `apiRouter` is also mounted at the bare `/api` prefix so that any
client that has not yet migrated keeps working. Every response served from
the legacy mount carries two standardised headers:

| Header | Value | Standard | Meaning |
|--------|-------|----------|---------|
| `Deprecation` | `true` | [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594) | This endpoint (under the bare `/api` prefix) is deprecated. |
| `Link` | `</api/v1/…>; rel="successor-version"` | [RFC 8288](https://www.rfc-editor.org/rfc/rfc8288) (header) + [RFC 5829](https://www.rfc-editor.org/rfc/rfc5829) (`successor-version` relation type) | Points the client at the canonical versioned path. |

The legacy alias exists **only** to prevent a flag-day migration. It is not a
supported long-term surface: clients that continue using `/api/...` after the
deprecation window lapses may begin receiving 410 Gone responses.

The versioned mount is registered first in the Express middleware chain, and
the shared router ends with a terminal 404 handler that throws the canonical
`NOT_FOUND` error. Together these guarantee two things:

1. A valid `/api/v1/...` request is always answered by the versioned mount —
   it never falls through to the legacy alias, so `Deprecation` headers are
   never emitted on versioned responses.
2. An unmatched `/api/v1/...` request (typo, wrong method) returns the
   canonical JSON error payload rather than the SPA `index.html` that the
   production static-file fallback would otherwise serve for unknown paths.

The legacy-alias middleware additionally short-circuits any request whose
`originalUrl` already begins with `/api/v1` as a defence-in-depth check, so
even a future misconfiguration cannot mistakenly stamp a versioned response
with deprecation headers or a malformed `Link: </api/v1/v1/…>` value.

### 3. Deprecation Policy for Breaking Changes

A breaking change is any change that could cause a previously working client
to fail:

- Removing a route, query parameter, request-body field, or response field.
- Renaming a route, field, or enum value.
- Changing a field's type, nullability, or semantic meaning.
- Tightening validation (e.g. making a previously optional field required).
- Removing a permission a caller previously relied on.

Non-breaking changes (adding optional fields, adding new endpoints, adding
new enum values in output-only fields, relaxing validation) may ship at any
time under the current version.

When a breaking change is required, the following policy applies:

1. **Minimum six months' notice.** A breaking change must be announced at
   least six months before the old behaviour is removed. The clock starts on
   the date the deprecation notice is published in the OpenAPI spec and the
   release notes, *not* the date the replacement endpoint first ships.
2. **Mark the old surface deprecated.** The deprecated endpoint, field, or
   parameter is marked `deprecated: true` in the OpenAPI document and the
   response begins emitting the `Deprecation: true` header (in addition to
   the `Link` header pointing at the successor, if one exists).
3. **Ship the replacement on a new version prefix.** Breaking changes land
   on `/api/v2`, `/api/v3`, etc. The previous version continues to serve the
   unchanged shape until its sunset date.
4. **Publish a sunset date.** Deprecated endpoints add a `Sunset` header
   (RFC 8594) carrying the earliest date the old surface may be removed.
   That date must be at least six months after the deprecation notice.
5. **Remove only after the window elapses.** Once the sunset date has passed
   *and* telemetry confirms no active callers remain, the old surface may be
   removed in a subsequent release.

The bare `/api` alias itself is subject to the same policy: it is considered
deprecated from the moment `/api/v1` ships, and will not be removed before
the policy window has elapsed for every currently-deployed client.

### 4. Client Guidance

- **Internal clients** (the web app, any future mobile app, server-side
  workers) must target `/api/v1` directly. The web app's shared `apiClient`
  only emits versioned URLs; there is no fallback to the legacy prefix.
- **External integrators** should target `/api/v1`. Treat any response that
  carries a `Deprecation: true` header as a signal to inspect the `Link`
  header and migrate to the successor version before the next release.
- **Observability.** Server logs include the matched route path, which makes
  it possible to track legacy-alias usage over time via the existing
  request-id log fields. Once the volume of bare `/api` traffic drops to
  zero for a full release cycle, the alias can be scheduled for removal.

---

## Consequences

### Positive

- Breaking changes can ship on a new prefix without coordinating a flag-day
  cutover with every consumer.
- External integrators get a firm, written commitment to a minimum six-month
  deprecation window, which is table stakes for enterprise adoption.
- The OpenAPI spec and the generated Swagger UI now advertise a stable,
  versioned URL scheme that matches the shipped reality.
- The legacy `/api` alias keeps the migration risk-free: any caller that was
  missed during the internal cutover continues to work, and a deprecation
  header makes the missed caller easy to notice.

### Negative

- Every internal caller (the web app, tests, OpenAPI tooling) had to migrate
  to the new prefix. This was a mechanical find-and-replace but it touched
  ~50 files.
- Running two mount points for the same router costs a small amount of
  additional middleware per request on the legacy path (the
  `legacyApiDeprecationHeaders` middleware). This is negligible compared to
  the cost of the rest of the request pipeline.
- The deprecation policy imposes a hard minimum timeline on breaking changes.
  Teams must plan rollouts against the six-month window rather than shipping
  breaking changes on demand.

### Neutral

- Shipping `/api/v2` in future will not require any refactoring of
  `index.ts`: a new router can be registered alongside `apiRouter` and
  mounted at the new prefix without touching the existing mounts.
