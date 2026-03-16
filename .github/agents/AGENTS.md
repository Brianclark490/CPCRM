# CPCRM

## Stack

- **Frontend**: React + TypeScript
- **Backend**: Node.js API service
- **Auth**: Descope — use `@descope/react-sdk` on frontend, `@descope/node-sdk` on backend. Never handle raw JWTs manually.
- **Hosting**: Azure PaaS (App Service, Functions, Storage)
- **Infrastructure**: Azure Bicep — templates in `infra/`
- **Source control**: GitHub Enterprise
- **Work tracking**: Azure DevOps Boards

## Code conventions

- TypeScript strict mode. No `any` unless justified with a comment.
- React: functional components only. Hooks only.
- API routes follow REST: `GET /api/resources`, `POST /api/resources`
- Error responses: `{ error: string, code: string }`
- All API endpoints validate auth via Descope middleware.

## Testing

- Frontend: Jest + React Testing Library. Tests next to source: `Component.test.tsx`
- Backend: Jest. Tests in `__tests__/` within each module.
- Run tests: `npm test`
- Run lint: `npm run lint`
- Type check: `npx tsc --noEmit`

## Azure conventions

- Resource naming: `{app}-{env}-{resource}` (e.g., `cpcrm-prod-webapp`)
- All resources tagged with `environment` and `managedBy`
- Use managed identities over connection strings

## Git workflow

- `main` is protected. All changes via PR.
- Branches: `feat/`, `fix/`, `chore/`
- Squash merge PR
