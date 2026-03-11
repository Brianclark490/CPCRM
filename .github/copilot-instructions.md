# GitHub Copilot Instructions

This repository contains **CPCRM** (Microsoft CRM), a greenfield multi-tenant CRM platform for managing Microsoft opportunities collaboratively across multiple users and organisations.

## Project context

- Hosted in **Azure** (PaaS-first)
- Source control in **GitHub Enterprise**
- Work tracking in **Azure DevOps Boards**
- Authentication uses **Descope**
- Multi-tenant architecture is required from the start
- Frontend: **React + TypeScript**
- Backend: API-first, Azure-friendly
- Relational database required
- Early setup phase — keep implementation practical and lightweight

## What to optimise for

When suggesting code, structure, PRs, or implementation approaches, optimise for:

- simplicity
- maintainability
- clear folder structure
- strong naming conventions
- low operational complexity
- Azure-aligned architecture
- secure-by-default patterns
- good developer onboarding
- small, incremental deliverables

Prefer solutions that are easy for a small engineering team to understand and extend.

## Architectural expectations

- This is a **multi-tenant application** — tenant isolation must be considered in domain design, APIs, and data access
- Authentication and session flows should align with **Descope**
- Prefer **PaaS services** over infrastructure-heavy solutions
- Avoid Kubernetes, microservices, or event-driven complexity unless explicitly requested
- Start with a modular monolith or simple service architecture
- Favour a relational data model suitable for CRM-style business entities

## Repository structure

The repository follows a monorepo layout:

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
└── .github/
    ├── workflows/     # GitHub Actions CI/CD pipelines
    └── CODEOWNERS     # Code ownership rules
```

## Coding guidance

- Write readable, production-minded code
- Avoid unnecessary abstraction in early stages
- Prefer explicitness over cleverness
- Add comments only where they improve clarity
- Use clear, descriptive names
- Keep files and modules focused on a single responsibility
- Follow the existing repository structure and naming patterns
- Do not introduce major dependencies without a clear reason

## Frontend guidance

When generating frontend code:

- Prefer **React + TypeScript**
- Favour maintainable component structure over premature optimisation
- Keep state management simple unless complexity justifies more
- Use predictable patterns for forms, validation, API calls, and routing
- Build for internal product usability rather than marketing-style UI
- Prioritise clarity, consistency, and extensibility

## Backend guidance

When generating backend code:

- Keep the API structure clean and resource-oriented
- Design with tenant awareness from the beginning
- Use clear separation between domain logic, API contracts, and infrastructure concerns
- Prefer straightforward service patterns over deep layering unless needed
- Validate inputs and fail safely
- Keep security and authorisation in mind for all protected operations

## Infrastructure guidance

When suggesting infrastructure:

- Prefer **Azure PaaS**
- Keep the initial dev environment lightweight
- Do not overdesign the landing zone
- Prefer practical first steps that support development quickly
- Include observability, configuration, and secrets handling as baseline concerns
- Defer enterprise-scale complexity unless explicitly requested

## Delivery guidance

When helping with issues, pull requests, or implementation:

- Break work into small, reviewable pieces
- Prefer incremental setup over large one-shot scaffolding
- Make assumptions explicit
- Call out tradeoffs when relevant
- Where appropriate, suggest a minimal viable implementation first

## Things to avoid

- overengineering
- unnecessary frameworks
- premature microservices
- unnecessary infrastructure complexity
- speculative abstractions
- introducing patterns that the current team size does not need
- hidden magic or unclear conventions

## Current priority

The current focus is establishing the core platform and developer setup:

- repository structure
- frontend developer setup
- backend developer setup
- Azure environment setup
- Descope integration planning
- configuration, observability, and deployment foundations

## Pre-suggestion checklist

Before making large structural suggestions, verify the proposal:

1. fits a greenfield Azure-hosted CRM
2. supports multi-tenant requirements
3. is maintainable by a small team
4. avoids unnecessary complexity
5. aligns with the repository structure and current delivery phase

If there is a simpler approach that achieves the same outcome, prefer the simpler approach.
