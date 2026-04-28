# MCP-native CRM playbook (Phases 0–4, ~12 months)

Companion doc to meta-epic [#536](https://github.com/Brianclark490/CPCRM/issues/536). Issues numbers in this doc are the canonical source of work; this file is a single-page sequenced view + the concurrent deployment story.

## Critical-path summary

The playbook prescribes Phase 0 → 4 over ~12 months. CPCRM already has foundations the playbook gives credit for (multi-tenant, Descope, four registries, Companies House angle, dynamic records system). The actual work breaks into six stages with clear dependencies — and a couple of items in the current backlog are hard blockers for the playbook work.

| Stage | Window | Epic | Theme |
| --- | --- | --- | --- |
| 0 | Week 1 | [#537](https://github.com/Brianclark490/CPCRM/issues/537) | Unblock current state |
| 1 | Weeks 1–2 (parallel) | [#538](https://github.com/Brianclark490/CPCRM/issues/538) | Foundation decisions + infra |
| 2 | Weeks 3–8 | [#539](https://github.com/Brianclark490/CPCRM/issues/539) | MCP MVP + AI Attributes |
| 3 | Months 3–4 | [#540](https://github.com/Brianclark490/CPCRM/issues/540) | Interactive + intake |
| 4 | Months 5–6 | [#541](https://github.com/Brianclark490/CPCRM/issues/541) | Agentic layer |
| 5 | Months 7–12 | [#542](https://github.com/Brianclark490/CPCRM/issues/542) | Defensibility |
| ⨯ | Cross-cutting | [#543](https://github.com/Brianclark490/CPCRM/issues/543) | Concurrent deployment strategy |

## Stage 0 — Unblock current state (Week 1)

Two of the open issues actively block Stage 2 work and need to clear first.

| Issue | Why it blocks the playbook |
| --- | --- |
| #544 — Pipeline stages API 500 on stage creation | `cpcrm_deals_advance_stage` (#560) is in the first 12 MCP tools — can't expose a broken stage workflow to Claude. |
| #545 — Retire legacy `opportunityService` route | The MCP tools must hit one canonical records path, not race the legacy service. |
| #546 — Pipeline analytics querying wrong table | Becomes the data backing the kanban Interactive component in Stage 3 (#569). |
| #547 — Object icons rendering raw text | Cosmetic, but visible the moment Claude renders record cards. |
| #548 — Seed missing User/Team objects for tenant `025415616` | Backfill script — needed before any MCP smoke test against real tenants. |

Single agent, ≤5 files each. These are hygiene, not strategy.

## Stage 1 — Foundation decisions (Week 1–2, parallel with Stage 0)

Three decisions to lock before any Stage 2 code lands. These aren't issues for an agent — they're choices for the maintainer.

- #549 — **OAuth/DCR approach.** Recommendation: thin DCR proxy in front of Descope. Alternative: WorkOS AuthKit. The proxy is ~2 weeks but we keep Descope for the main app and own the consent UI.
- #550 — **Tool naming convention.** `cpcrm_<resource>_<verb>` with snake_case parameters (`tenant_id`, not `tenant`). Documented in `docs/architecture/mcp-tool-conventions.md`. Once tools ship, rename costs are real.
- #551 — **RLS rollout sequence.** The Phase 8 RLS work is critical-path before any external MCP exposure — a leaky tool is worse than no tool. RLS lands inside Stage 2 (#557), not deferred.

Two parallel infrastructure issues for an agent:

- #552 — Enable pgvector extension on the Postgres Flexible Server + add migration scaffold for embedding columns (1 agent, ~3 files)
- #553 — Add description, purpose, and tool-annotation metadata schema to ComponentRegistry field definitions (1 agent, ~5 files)

## Stage 2 — MCP MVP + AI Attributes (Weeks 3–8)

The playbook's Phase 1, broken into agent-sized issues. Order matters here.

| # | Issue | Files | Depends on |
| --- | --- | --- | --- |
| 1 | #554 — DCR/OAuth proxy app — well-known endpoints, PKCE S256, RFC 8707 | New service repo | #549 |
| 2 | #555 — Tenant picker consent screen | ~6 files | #554 |
| 3 | #556 — MCP server scaffold (Streamable HTTP, App Service slot) | New service | #554 |
| 4 | #557 — RLS policies on contacts/companies/deals/activities/users/teams | ~5 migrations | #551 |
| 5 | #558 — Tools 1–3: `cpcrm_contacts_search/get/upsert` with annotations | ~6 files | #556, #557 |
| 6 | #559 — Tools 4–6: `cpcrm_companies_search/get/upsert` | ~6 files | #558 |
| 7 | #560 — Tools 7–10: `cpcrm_deals_search/get/upsert/advance_stage` | ~7 files | #559, #544 |
| 8 | #561 — Tool 11: `cpcrm_enrichment_run` (free + premium) | ~5 files | #556 |
| 9 | #562 — Tool 12: `cpcrm_activity_log` | ~4 files | #556 |
| 10 | #563 — "Needs Approval" approval queue + write-confirmation flow | ~8 files | #558 |
| 11 | #564 — `field_kind: 'ai_attribute'` extension on ComponentRegistry | ~6 files | #553 |
| 12 | #565 — Wire `deal_coach` + `stale_deal_scanner` into Automation engine | ~5 files | none (parallel) |
| 13 | #566 — Anthropic tool-evaluation cookbook + iterate on descriptions | Tests + docs | #558–#562 |
| 14 | #567 — Public docs, privacy policy, support email, Connector Directory submission | Marketing/docs | All above |

**Stage 2 exit gate** = 10 design-partner tenants connected to Claude via MCP, connector submitted.

## Stage 3 — Interactive + intake (Months 3–4)

| # | Issue | Why now |
| --- | --- | --- |
| 1 | #568 — Embed endpoint `/embed/pipeline?token=...` returning sandboxed HTML kanban | Foundation for Interactive |
| 2 | #569 — First Interactive MCP App: `cpcrm_show_pipeline` with `ui://` resource | Earns the Interactive badge |
| 3 | #570 — postMessage handler for stage-change actions inside the iframe | Closes the loop |
| 4 | #571 — Microsoft Graph email + calendar sync (suggest-only) | Closes the call/meeting hygiene gap |
| 5 | #572 — Google Workspace email + calendar sync (Gmail + Calendar APIs) | Parity |
| 6 | #573 — "Review changes inbox" UI for surfaced suggestions | Default-suggest policy needs a UI |
| 7 | #574 — Conversational onboarding agent | Aligns with "no-forms" vision |

**Stage 3 exit gate** = Interactive badge + first 25 paying tenants.

## Stage 4 — Agentic layer (Months 5–6)

The big differentiator. Exposes the Automation registry as MCP tools — nobody else in SMB CRM has this.

- #575 — `cpcrm_automations_list/describe/create/update/test` with draft-by-default writes
- #576 — Interactive flow-canvas component for visual review (re-uses the existing visual canvas)
- #577 — Meeting capture via webhook integration (Granola / Fireflies / Avoma — partner, don't build a bot)
- #578 — Continuous-learning store: every agent decision + outcome label, used as few-shot context for that tenant's future calls
- #579 — Open-source `@cpcrm/mcp-sdk` package for tenant-authored custom tools
- #580 — Anthropic Partner Network application

## Stage 5 — Defensibility (Months 7–12)

- #581 — Per-tenant predictive scoring (embeddings + small classifier, weekly retrain)
- #582 — Relationship graph table (or Apache AGE if it earns its weight)
- #583 — MSP/agency reseller tier with white-label
- #584 — Public Skills library — UK SaaS sales, recruitment agency, professional services playbooks
- #585 — Voice-to-CRM mobile (Whisper API) — low priority but cheap

## Concurrent deployment strategy (cross-cutting, Stages 1–4)

Tracked under [#543](https://github.com/Brianclark490/CPCRM/issues/543). The MCP server, DCR proxy, embed service, and main API ship as **independent services** but share infra and need coordinated, low-blast-radius rollouts. Builds on existing groundwork: slot-swap blue/green (#394), Key Vault via managed identity (#396), backup runbook (#393).

| # | Issue |
| --- | --- |
| Deploy 1 | #586 — App Service slot topology (staging slot + warmup before swap) for MCP server, DCR proxy, embed service |
| Deploy 2 | #587 — Per-stage canary cohort: 5–10 design-partner tenants flagged in via the feature-flag service before general rollout |
| Deploy 3 | #588 — Feature-flag service for stage gating (`mcp.tools.*`, `mcp.interactive.*`, `mcp.agentic.*`) so half-built tools can ship dark |
| Deploy 4 | #589 — Cross-service correlation ID propagation (web → API → MCP → DCR proxy) with shared `requestId` in App Insights — extends #381 |

### Rollout ritual

1. **Slot deploy** to staging slot for the affected service.
2. **Warmup**: hit `/health` + a representative tool listing on the staging slot; abort the swap on any error.
3. **Swap** to production slot.
4. **Cohort flip**: enable the new flag (`mcp.tools.deals.advance_stage`, etc) for the 5–10 design-partner tenants only.
5. **Soak**: 7 days of cohort metrics green (error rate, p95 latency, approval-queue rejection rate) before flipping the flag globally.
6. **Rollback**: swap slots back; flags can be flipped off independently in seconds.

The full runbook lives at `docs/runbooks/mcp-rollout.md` (to be authored as part of #586/#588).

## What's not in this plan (out of scope)

- React 19 upgrade (#419) — independent track.
- Page-builder zones epic (#514) — independent UI track.
- AI patch contract spike (#523) — adjacent design work; not on the MCP critical path.

## Source-of-truth notes

- Issue numbers above are stable; if priorities change, re-order labels (`stage-0` … `stage-5`, `deployment`) on the affected issue rather than rewriting this doc.
- This doc is intentionally a single page. Detailed acceptance criteria, file anchors, and out-of-scope notes live on each issue.
