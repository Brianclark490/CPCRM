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

```bash
npm install
```

### Run the frontend (development)

```bash
npm run dev --workspace=apps/web
```

### Run the API (development)

```bash
npm run dev --workspace=apps/api
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