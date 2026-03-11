# Microsoft CRM

A multi-tenant, collaborative CRM platform for opportunity management, hosted on Azure.

## Tech Stack

| Layer          | Technology                     |
|----------------|--------------------------------|
| Frontend       | React + TypeScript             |
| Backend        | Node.js API service            |
| Auth           | Descope                        |
| Hosting        | Azure (PaaS-first)             |
| Infrastructure | Azure Bicep (IaC)              |
| Source Control | GitHub Enterprise              |
| Work Tracking  | Azure DevOps Boards            |

## Monorepo Structure

```
cpcrm/
├── apps/
│   ├── web/           # React + TypeScript frontend
│   └── api/           # Backend API service
├── packages/
│   ├── ui/            # Shared UI component library
│   ├── types/         # Shared TypeScript types and interfaces
│   └── config/        # Shared tooling configs (ESLint, TypeScript)
├── infrastructure/
│   ├── bicep/         # Azure Bicep templates (IaC)
│   └── scripts/       # Deployment and automation scripts
├── docs/
│   ├── architecture/  # Architecture decision records (ADRs)
│   └── runbooks/      # Operational runbooks
├── .github/
│   ├── workflows/     # GitHub Actions CI/CD pipelines
│   └── CODEOWNERS     # Code ownership rules
├── .editorconfig
├── .gitignore
├── CONTRIBUTING.md
└── package.json       # Monorepo workspace root
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+ (workspaces support)
- Azure CLI (for infrastructure work)

### Install dependencies

From the repository root, install all workspace dependencies:

```bash
npm install
```

### Frontend setup (`apps/web`)

#### 1. Configure environment variables

Copy the example environment file and fill in your local values:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local` and set:

| Variable | Description |
|---|---|
| `VITE_API_URL` | Base URL of the backend API (e.g. `http://localhost:3000`) |
| `VITE_DESCOPE_PROJECT_ID` | Your Descope project ID (from the Descope console) |
| `VITE_APP_ENV` | Environment name: `development`, `staging`, or `production` |

> **Note:** `.env.local` is git-ignored and should never be committed.

#### 2. Start the development server

```bash
npm run dev --workspace=apps/web
```

The app will be available at **http://localhost:5173**.

#### 3. Type-check

```bash
npm run typecheck --workspace=apps/web
```

#### 4. Lint

```bash
npm run lint --workspace=apps/web
```

Auto-fix lint issues:

```bash
npm run lint:fix --workspace=apps/web
```

#### 5. Format code

```bash
npm run format --workspace=apps/web
```

Check formatting without writing:

```bash
npm run format:check --workspace=apps/web
```

#### 6. Build for production

```bash
npm run build --workspace=apps/web
```

The production bundle is output to `apps/web/dist/`.

### Frontend folder structure

```
apps/web/
├── public/              # Static assets served at the root URL
├── src/
│   ├── assets/          # Images, fonts, and other imported assets
│   ├── components/      # Shared React components
│   ├── pages/           # Page-level React components
│   ├── App.tsx          # Root application component
│   ├── App.css          # Root component styles
│   ├── index.css        # Global CSS reset / base styles
│   ├── main.tsx         # React entry point
│   └── vite-env.d.ts    # Vite environment type declarations
├── .env.example         # Example environment variable definitions
├── .prettierrc          # Prettier formatting configuration
├── eslint.config.js     # ESLint flat configuration
├── index.html           # HTML entry point
├── tsconfig.json        # TypeScript project references root
├── tsconfig.app.json    # TypeScript config for src/ (browser)
├── tsconfig.node.json   # TypeScript config for vite.config.ts (Node)
├── vite.config.ts       # Vite bundler configuration
└── package.json         # Frontend package manifest
```

### Run the API (development)

```bash
npm run dev --workspace=apps/api
```

### Run everything

```bash
npm run dev
```

## Environments

| Environment | Branch      | Purpose                    |
|-------------|-------------|----------------------------|
| Development | `develop`   | Active development         |
| Staging     | `staging`   | Pre-production validation  |
| Production  | `main`      | Live tenant traffic        |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branching strategy, environment conventions, and secrets handling.

## License

Private – All rights reserved.