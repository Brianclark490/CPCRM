# Frontend Developer Setup

This guide covers everything you need to build and run the CPCRM web application locally.

## Prerequisites

| Tool    | Version | Install                            |
|---------|---------|------------------------------------|
| Node.js | 20+     | https://nodejs.org or [nvm](https://github.com/nvm-sh/nvm) |
| npm     | 10+     | Bundled with Node.js               |

Verify your environment:

```bash
node --version   # should be v20.x or higher
npm --version    # should be 10.x or higher
```

## Installation

From the **repository root**, install all workspace dependencies:

```bash
npm install
```

This installs dependencies for the entire monorepo including `apps/web`, `apps/api`, and all shared packages.

## Environment Variables

The frontend requires a Descope Project ID to run locally.

1. Copy the example file:

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```

2. Open `apps/web/.env.local` and set your values:

   ```env
   # Required: your Descope Project ID
   # Find it at https://app.descope.com/settings/project
   VITE_DESCOPE_PROJECT_ID=P_your_project_id_here

   # Optional: defaults to same-origin proxy
   VITE_API_BASE_URL=http://localhost:3001
   ```

> **Note:** `.env.local` is listed in `.gitignore` and will never be committed. Never commit real credentials.

## Running the Development Server

```bash
npm run dev --workspace=apps/web
```

The app will be available at **http://localhost:5173**.

API requests to `/api/*` are proxied to `http://localhost:3001` by the Vite dev server, so you can run the frontend independently.

## Linting

Check for lint issues:

```bash
npm run lint --workspace=apps/web
```

Auto-fix lint issues:

```bash
npm run lint:fix --workspace=apps/web
```

## Formatting

Check formatting:

```bash
npm run format:check --workspace=apps/web
```

Apply formatting:

```bash
npm run format --workspace=apps/web
```

Prettier is configured in `.prettierrc` at the repository root.

## Type Checking

```bash
npm run typecheck --workspace=apps/web
```

## Running Tests

```bash
npm run test --workspace=apps/web
```

Tests use [Vitest](https://vitest.dev/) with [Testing Library](https://testing-library.com/).

## Running All Checks at Once (from the repo root)

```bash
npm run lint       # lint all workspaces
npm run typecheck  # typecheck all workspaces
npm run test       # test all workspaces
```

## Editor Setup (VS Code)

The repository includes `.vscode/settings.json` and `.vscode/extensions.json`. Install the recommended extensions when prompted:

- **Prettier – Code formatter** (`esbenp.prettier-vscode`) – formats on save
- **ESLint** (`dbaeumer.vscode-eslint`) – highlights lint errors inline

With these installed, files will be formatted and linted automatically when you save.

## Folder Structure

```
apps/web/
├── src/
│   ├── __tests__/          # Unit and integration tests
│   ├── components/         # Reusable React components
│   ├── pages/              # Page-level components (route targets)
│   ├── App.tsx             # Root component and routing
│   └── main.tsx            # Application entry point
├── .env.example            # Environment variable template
├── eslint.config.js        # ESLint flat config
├── index.html              # HTML entry point (Vite)
├── tsconfig.json           # TypeScript config
├── vite.config.ts          # Vite build and dev server config
└── vitest.config.ts        # Vitest test runner config
```

## Troubleshooting

**`VITE_DESCOPE_PROJECT_ID environment variable is required`**  
You haven't created `apps/web/.env.local`. Follow the [Environment Variables](#environment-variables) steps above.

**Port 5173 already in use**  
Another process is using port 5173. Stop it or change the `server.port` in `apps/web/vite.config.ts`.

**`Cannot find module` errors after pulling changes**  
Run `npm install` from the repository root to pick up any new dependencies.
