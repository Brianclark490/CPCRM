# Contributing to Microsoft CRM

## Branching Strategy

We follow a trunk-based development model with short-lived feature branches.

| Branch pattern         | Purpose                                          |
|------------------------|--------------------------------------------------|
| `main`                 | Production – protected, deploys to prod          |
| `staging`              | Pre-production – protected, deploys to staging   |
| `develop`              | Integration branch for active development        |
| `feature/<ticket-id>-short-desc` | Feature work (e.g. `feature/CRM-42-add-contact-list`) |
| `fix/<ticket-id>-short-desc`     | Bug fixes                                |
| `chore/<desc>`         | Maintenance (deps, config, docs)                 |

### Rules

- Branch off `develop` for all feature and fix work.
- Open a pull request back to `develop`; require at least 1 approval.
- `develop` → `staging` and `staging` → `main` are gated by CI + manual approval.
- Delete merged branches promptly.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

feat(api): add opportunity creation endpoint
fix(web): resolve date picker timezone issue
chore(infra): update bicep API versions
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`.

## Environments & Deployment

| Environment | Branch    | Azure Resource Suffix |
|-------------|-----------|-----------------------|
| Development | `develop` | `-dev`                |
| Staging     | `staging` | `-stg`                |
| Production  | `main`    | `-prod`               |

- Each environment is a separate Azure resource group.
- Infrastructure is deployed via Bicep templates in `infrastructure/bicep/`.
- GitHub Actions workflows in `.github/workflows/` handle CI/CD per environment.

## Secrets Handling

**Never commit secrets to source control.**

| Secret type             | Where it lives                          |
|-------------------------|-----------------------------------------|
| Azure credentials       | GitHub Actions Secrets (OIDC preferred) |
| App configuration       | Azure App Configuration / Key Vault     |
| Descope API keys        | Azure Key Vault                         |
| Per-environment `.env`  | Local only – listed in `.gitignore`     |

- Use `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` via OIDC federation.
- Store all runtime secrets in Azure Key Vault; reference them in App Service configuration.
- Do **not** hard-code tenant IDs, connection strings, or API keys anywhere in the codebase.

## Multi-Tenancy Conventions

- Tenant context is resolved at the API layer via subdomain or claim in the Descope JWT.
- Tenant-specific data must always be scoped in queries (never fetch cross-tenant data).
- Shared packages (`packages/types`, `packages/config`) must remain tenant-agnostic.

## Security Advisory Exceptions

CI runs `npm audit --audit-level=high` on every pull request and fails the build
on any high or critical advisory (direct or transitive). Dependabot opens weekly
update PRs for `npm` and `github-actions` — merge those promptly.

If a PR must merge with an unavoidable high/critical advisory:

1. Confirm there is no upstream fix and no viable alternative package.
2. Add an entry to `docs/security-exceptions.md` with the advisory ID (GHSA or
   CVE), affected package, severity, rationale, and an expected resolution date.
3. Apply the `npm-audit-exception` label to the PR and request review from a
   security reviewer before merging.
4. Re-audit quarterly; remove the exception as soon as a fix is available.

CodeQL runs on every PR via GitHub's default code-scanning setup. PRs that
introduce new high or critical alerts must be resolved before merging.

## Database migrations

The API runs against PostgreSQL and uses [Kysely](https://kysely.dev/) for
type-safe queries. The Kysely table types live in
`apps/api/src/db/kysely.types.ts` and are **generated from the live database
schema** by [`kysely-codegen`](https://github.com/RobinBlomberg/kysely-codegen)
— they must always reflect the SQL migrations in
`apps/api/src/db/migrations/`.

### Adding a new migration

1. Create the next `NNN_description.sql` file in `apps/api/src/db/migrations/`.
2. Apply it locally, then regenerate the Kysely types:

   ```bash
   cd apps/api
   # Apply migrations to your local DB
   DATABASE_URL=postgres://...  npm run db:migrate
   # Regenerate Kysely types from that DB
   DATABASE_URL=postgres://...  npm run db:types
   ```

3. Commit **both** the new SQL migration and the regenerated
   `apps/api/src/db/kysely.types.ts` in the same PR.

### CI enforcement

The `Kysely types are in sync with migrations` CI job spins up a throwaway
Postgres, applies every committed migration, runs `kysely-codegen`, and
diffs the result against the committed `kysely.types.ts`. If they differ,
the build fails with instructions for how to regenerate the file.

CI is the backstop, not the primary workflow — please regenerate types as
part of writing the migration so reviewers see the intended schema diff.

## Pull Request Checklist

Before requesting a review:

- [ ] Tests pass (`npm test`)
- [ ] Lint passes (`npm run lint`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] No secrets committed
- [ ] PR title follows Conventional Commits format
- [ ] Linked to Azure DevOps Board work item
