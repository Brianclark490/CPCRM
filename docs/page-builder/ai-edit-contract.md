# AI patch contract — page builder

**Status:** Draft — design spike for issue
[#523](https://github.com/Brianclark490/CPCRM/issues/523).
**Parent epic:** [#514](https://github.com/Brianclark490/CPCRM/issues/514)
**Depends on:** [#522](https://github.com/Brianclark490/CPCRM/issues/522)
(stub Ask button — merged in PR #535).

## Purpose

Define the contract between the "Ask" prompt in `BuilderToolbar` and the AI
backend that will eventually answer it. This document is design-only; no
runtime code lands here. The goal is to freeze the shapes that the
endpoint, the patch applicator, and the preview/confirm UX can be built
against in parallel.

The questions this doc answers:

1. What goes into the model?
2. What does the model return?
3. How do we validate the model's output before applying it?
4. What is the AI not allowed to do?
5. Which model, with what latency / caching characteristics?

Implementation issues are filed separately (see "Follow-up issues" below).

## Goals & non-goals

In scope for v1:

- A typed, validatable op list the model produces and the FE applies.
- Server-side validation that catches malformed, unsafe, or
  zone-incompatible ops before they reach the renderer.
- A diff preview the user confirms before the layout is mutated.
- Three worked examples demonstrating prompt → ops → applied diff.

Out of scope for v1 (intentionally deferred):

- Mutating `header` config — stays read-only until v2.
- Creating, deleting, or relabelling layouts; toggling `isDefault`.
- Adding component types not in `COMPONENT_REGISTRY`.
- Multi-turn conversations or follow-up clarifications — every request
  is single-shot.
- Fine-tuning or eval harness — that is a separate workstream.
- Streaming the op list. v1 returns the full op list in one response;
  streaming can be added later without changing the contract.

## Anchor points

The contract is grounded in three existing modules. The model **must**
respect their shapes; validators reject ops that don't.

- Layout schema: `apps/web/src/components/layoutTypes.ts`
  (`PageLayout`, `LayoutZones`, `LayoutSectionDef`, `LayoutComponentDef`,
  `VisibilityRule`).
- Component registry: `apps/api/src/lib/componentRegistry.ts`
  (`COMPONENT_REGISTRY`, `LayoutZone`, `isComponentAllowedInZone`).
- Existing layout validator: `validateLayoutJson` and `validateZones`
  in `apps/api/src/services/pageLayoutService.ts:291-410`. The op
  applicator runs `validateLayoutJson` on the post-apply layout as a
  belt-and-braces check.

The op schema and the request/response types should ship from
`packages/types/src/index.ts` so the FE applicator and the BE endpoint
can't drift.

## Prompt shape

The model receives three things, in order: a system prompt that never
changes per request, a context block that varies per (object, layout),
and the user's natural-language request.

### System prompt (cacheable)

The system prompt describes the contract, the op schema, the registry,
the zone whitelist, and the safety rules. It is identical for every
request from a given deploy and should be cached using Anthropic prompt
caching to amortise token cost.

Concretely the system prompt contains:

1. A one-paragraph description of what a `PageLayout` is and how zones
   relate to tabs/sections.
2. A condensed, JSON-encoded view of `COMPONENT_REGISTRY` — for each
   entry: `type`, `label`, `category`, `allowedZones`, `configSchema`
   keys with their types. Default configs are included so the model
   knows the minimal valid shape.
3. The TypeScript op schema (see "Output shape" below) verbatim, plus
   the safety rules section verbatim.
4. Three few-shot examples (mirrored from the worked examples below).
5. The instruction: *"Return only a JSON object matching the
   `AiEditResponse` schema. Do not include prose, markdown, or
   explanation outside the `summary` field."*

### Context block (per request)

```ts
interface AiEditContext {
  layoutId: string;
  objectApiName: string;          // e.g. "opportunity"
  objectLabel: string;            // e.g. "Opportunity"
  layout: PageLayout;             // current draft, normalised
  fields: Array<{                 // every field on the active object
    apiName: string;
    label: string;
    fieldType: FieldType;
  }>;
  relationships: Array<{          // every relationship the object has
    relationshipId: string;
    label: string;
    relationshipType: 'lookup' | 'parent_child';
    relatedObjectApiName: string;
  }>;
}
```

`layout` is sent post-`normalizeLayout`, so `zones` is always present.
The model never sees other tenants' data; the BE constructs the context
from the authenticated tenant's metadata.

### User prompt

A single string from the textarea — capped at 2,000 characters by the
endpoint. Longer prompts are rejected with `400 prompt_too_long`.

## Output shape

We adopt **Option C — a custom operation list** from the issue. Reasons:

- Surgical: untouched parts of the layout are guaranteed unchanged,
  unlike a full-layout replacement (Option A).
- Validatable: each op has a tight Zod schema, unlike an RFC 6902 patch
  (Option B) where path strings are easy to get wrong and hard to type-check.
- High-signal for previews: each op maps cleanly to one human-readable
  line in the confirm UI ("Add KPI 'days_since_last_call' to KPI strip").
- Cheap to apply: a small reducer over the existing `PageLayout` —
  no JSON-pointer evaluation, no diff/merge.

### Top-level response

```ts
interface AiEditResponse {
  /** Short natural-language summary shown above the diff preview. */
  summary: string;
  /** Ordered list of operations to apply. May be empty (no-op). */
  ops: AiEditOp[];
  /**
   * Optional clarifying question. When set, `ops` MUST be empty and the
   * FE renders the question instead of a diff. v1 surfaces this as a
   * read-only message; multi-turn lands later.
   */
  clarification?: string;
}
```

### Op union

```ts
type AiEditOp =
  | AddComponentOp
  | RemoveComponentOp
  | MoveComponentOp
  | UpdateComponentConfigOp
  | AddSectionOp
  | RemoveSectionOp
  | ReplaceSectionOp
  | ReorderSectionOp;
```

Every op carries a stable `id` field so the FE can show per-op
accept/reject controls in the preview.

#### Component-level ops

```ts
interface AddComponentOp {
  op: 'add_component';
  id: string;
  /** Where the component goes. */
  target:
    | { kind: 'zone'; zone: 'kpi' }
    | { kind: 'section'; sectionId: string };
  /** 0-based index. Use -1 for "append". */
  position: number;
  component: {
    /** Optional client-supplied id; BE generates one if omitted. */
    id?: string;
    type: string;                 // must be in COMPONENT_REGISTRY
    config: Record<string, unknown>;
    visibility?: VisibilityRule | null;
  };
}

interface RemoveComponentOp {
  op: 'remove_component';
  id: string;
  componentId: string;
}

interface MoveComponentOp {
  op: 'move_component';
  id: string;
  componentId: string;
  to:
    | { kind: 'zone'; zone: 'kpi'; position: number }
    | { kind: 'section'; sectionId: string; position: number };
}

interface UpdateComponentConfigOp {
  op: 'update_component_config';
  id: string;
  componentId: string;
  /** Shallow merge into the existing config. Keys set to `null` are deleted. */
  patch: Record<string, unknown>;
}
```

#### Section-level ops

```ts
interface AddSectionOp {
  op: 'add_section';
  id: string;
  /** Rails are the only place sections live. `main` sections live inside tabs. */
  target:
    | { kind: 'rail'; rail: 'leftRail' | 'rightRail' }
    | { kind: 'tab'; tabId: string };
  position: number;
  section: {
    id?: string;
    label: string;
    columns: number;             // 1 or 2
    collapsed?: boolean;
    components: AddComponentOp['component'][];
  };
}

interface RemoveSectionOp {
  op: 'remove_section';
  id: string;
  sectionId: string;
}

interface ReplaceSectionOp {
  op: 'replace_section';
  id: string;
  sectionId: string;
  /** Components after replacement. Section metadata (label, columns, …) is preserved unless overridden. */
  section: {
    label?: string;
    columns?: number;
    collapsed?: boolean;
    components: AddComponentOp['component'][];
  };
}

interface ReorderSectionOp {
  op: 'reorder_section';
  id: string;
  sectionId: string;
  /** New 0-based index inside its current rail or tab. */
  position: number;
}
```

### Why these ops and not others

- `update_component_config` rather than a generic patch — it forces the
  model to address one component at a time and keeps the audit trail
  legible.
- `replace_section` is kept distinct from a remove-then-add pair because
  the user-visible intent ("swap this whole block out") deserves its own
  preview line and its own undo entry.
- No `update_section_metadata` op in v1 — section labels and `columns`
  are rarely worth a natural-language change. Add later if telemetry
  shows demand.
- No header ops (see "Safety").

## Validation

Server-side, before any op is applied, the response runs through five
gates. Failure of any gate causes the BE to return
`422 invalid_ai_response` with the failed gate and offending op id —
the FE shows a generic "the assistant couldn't produce a safe edit"
toast and logs the detail.

1. **Schema (Zod).** `AiEditResponseSchema.parse(json)`. Catches missing
   fields, wrong types, unknown op kinds, malformed unions.
2. **Registry membership.** For every `add_component` and the components
   inside `add_section` / `replace_section`: `type` must be in
   `VALID_COMPONENT_TYPES`.
3. **Zone whitelist.** Resolve the destination zone for every component
   placement and call `isComponentAllowedInZone(type, zone)`.
   - `target.kind === 'zone'` with `zone === 'kpi'` → zone is `'kpi'`.
   - `target.kind === 'section'` → look the section up; rail sections
     resolve to `'leftRail'` / `'rightRail'`, tab sections to `'main'`.
4. **Reference existence.** Every `componentId`, `sectionId`, `tabId`
   must exist in the current layout (or, for ids introduced earlier in
   the same op list, in the in-progress applied state). Every
   `fieldId` / `fieldApiName` referenced in a component config must
   exist in `context.fields`. Every `relationshipId` must exist in
   `context.relationships`.
5. **Post-apply layout validity.** After running the op reducer in a
   sandbox, `validateLayoutJson(result)` must return `null`. This is
   the existing validator that already powers normal builder saves —
   reusing it guarantees AI edits can never produce a layout the
   builder itself would reject.

The reducer applies ops in order; each op's reference checks see the
state after all earlier ops in the same response. If gate 4 or 5 fails
mid-list, the entire response is rejected — partial application is
never surfaced.

After validation passes, the FE shows the diff preview. Apply happens
client-side against the in-memory `PageLayout`; the user clicks
"Apply" to commit it as the new draft (which then goes through the
ordinary save path, validators included).

### Validation pseudocode

```ts
function validateAndApply(
  response: unknown,
  context: AiEditContext,
): { ok: true; layout: PageLayout } | { ok: false; reason: string; opId?: string } {
  // Gate 1: Zod
  const parsed = AiEditResponseSchema.safeParse(response);
  if (!parsed.success) return { ok: false, reason: 'schema' };

  let working = structuredClone(context.layout);
  for (const op of parsed.data.ops) {
    // Gates 2-4: registry, zones, references — see helpers below.
    const refError = checkReferences(op, working, context);
    if (refError) return { ok: false, reason: refError, opId: op.id };

    const zoneError = checkZones(op, working);
    if (zoneError) return { ok: false, reason: zoneError, opId: op.id };

    working = applyOp(working, op);
  }

  // Gate 5: re-run the production validator.
  const validatorError = validateLayoutJson(working);
  if (validatorError) return { ok: false, reason: validatorError };

  return { ok: true, layout: working };
}
```

`applyOp` is a pure reducer — `(layout, op) => layout`. It is the same
function the FE uses to render the preview; the BE imports it from
`packages/types` (or a new sibling package if importing TS into the API
is awkward, TBD in the FE applicator issue).

## Safety rules

These are enforced by the validator, not just instructed in the system
prompt. The model is not trusted to police itself.

1. **No header edits in v1.** No op may target `layout.header`.
2. **No layout-level edits.** No op renames the layout, toggles
   `isDefault`, switches `role`, or removes/adds tabs. Tab edits land
   later if needed.
3. **No registry escapes.** Every component `type` must be in
   `COMPONENT_REGISTRY`. The BE refuses unknown types even if the model
   produces a plausibly-shaped config.
4. **Zone whitelist is hard.** A `metric` in `leftRail` is rejected
   regardless of how the model justifies it.
5. **No raw field/relationship strings.** Configs reference fields and
   relationships only by ids/api-names that appear in
   `context.fields` / `context.relationships`. The model cannot invent
   a `fieldApiName: 'amount_v2'` if `amount_v2` doesn't exist on the
   active object.
6. **No PII or tenant data leakage.** Record values are not in the
   context; the model only sees field metadata. Real record data stays
   server-side.
7. **Empty op lists are valid.** `ops: []` plus a `summary` is the
   correct response when the model can't do something safely; the FE
   surfaces this as "I couldn't make that change" rather than treating
   it as an error.

## Cost / latency

- **Model.** Claude Sonnet 4.6 (`claude-sonnet-4-6`). Sonnet is the
  right cost/quality tradeoff for structured editing — Opus is
  overkill for a closed op vocabulary, Haiku struggles to keep
  configs schema-correct in early prototyping. Revisit after the
  endpoint ships and we have eval coverage.
- **Tokens.** System prompt ≈ 2.5–3k tokens (registry + op schema +
  three few-shots). Context block scales with layout size — typical
  layouts are 1–2k tokens.
- **Caching.** The system prompt is identical across every request
  from a given deploy and uses Anthropic prompt caching
  (`cache_control: { type: 'ephemeral' }`). The context block is
  per-request and not cached.
- **Streaming.** v1 does not stream — the FE waits for the full op
  list before rendering the preview. Latency target: p50 < 4s, p95
  < 10s. Streaming can be added later without changing the contract.
- **Tool use vs JSON mode.** Use the SDK's structured-output / tool-use
  pathway with `AiEditResponseSchema` as the tool schema, not free-form
  JSON in a text block. Tool use gives us schema-enforced output and
  removes a class of "model added a stray comma" failures.

## Worked examples

All three examples assume the active object is `opportunity` with
fields including `name`, `amount`, `stage`, `expected_close_date`,
`last_call_at`, plus a `recent_calls` relationship to a `call` object.
The starting layout (abbreviated) has a left-rail "Opportunities"
section, a notes section in the main tab, and an empty KPI strip.

### Example 1 — "Replace my opportunities section with recent calls"

**User prompt:** *Replace my opportunities section with recent calls*

**Response:**

```json
{
  "summary": "Replaces the Opportunities section with a Recent Calls related list.",
  "ops": [
    {
      "op": "replace_section",
      "id": "op_1",
      "sectionId": "sec_opps",
      "section": {
        "label": "Recent Calls",
        "components": [
          {
            "type": "related_list",
            "config": {
              "relationshipId": "rel_recent_calls",
              "displayFields": ["name", "called_at", "outcome"],
              "limit": 5,
              "allowCreate": true
            }
          }
        ]
      }
    }
  ]
}
```

**Resulting diff (preview UI shows):**

```
~ leftRail / Opportunities → Recent Calls
- field(opportunity_name)
- field(amount)
+ related_list(recent_calls, limit=5)
```

### Example 2 — "Add a KPI for days since last call"

**User prompt:** *Add a KPI for days since the last call*

**Response:**

```json
{
  "summary": "Adds a 'Days since last call' metric card to the KPI strip.",
  "ops": [
    {
      "op": "add_component",
      "id": "op_1",
      "target": { "kind": "zone", "zone": "kpi" },
      "position": -1,
      "component": {
        "type": "metric",
        "config": {
          "label": "Days since last call",
          "source": { "kind": "field", "fieldApiName": "last_call_at" },
          "format": "duration",
          "accent": "warning"
        }
      }
    }
  ]
}
```

**Resulting diff:**

```
+ kpi[2] metric(label="Days since last call", field=last_call_at, format=duration)
```

### Example 3 — "Move Notes under Opportunities and add an Activity feed below it"

**User prompt:** *Move Notes under Opportunities, then add an activity feed below it.*

**Response:**

```json
{
  "summary": "Moves Notes into the left rail under Opportunities and adds an Activity Feed beneath it.",
  "ops": [
    {
      "op": "move_component",
      "id": "op_1",
      "componentId": "cmp_notes",
      "to": { "kind": "section", "sectionId": "sec_opps", "position": -1 }
    },
    {
      "op": "add_component",
      "id": "op_2",
      "target": { "kind": "section", "sectionId": "sec_opps" },
      "position": -1,
      "component": {
        "type": "activity",
        "config": { "limit": 10, "types": ["opportunity", "system"] }
      }
    }
  ]
}
```

**Resulting diff:**

```
~ leftRail / Opportunities
+ field(notes)            (moved from main / "About")
+ activity(limit=10)
~ main / About
- field(notes)
```

These three examples are the canonical few-shots embedded in the system
prompt. Any change to the op schema must update them.

## Decisions to revisit

- **Streaming preview.** Could stream ops and render the preview
  incrementally. Defer until p95 latency proves uncomfortable.
- **Multi-turn clarification.** v1 returns a single `clarification`
  string and stops. A genuine back-and-forth (model asks → user replies
  → model edits) is a follow-up.
- **Header ops.** Once primary/secondary field swaps prove safe to
  preview, the v2 spec adds an `update_header` op behind a feature flag.
- **Per-tenant model selection.** A self-hosted or alternate model
  per-tenant (compliance reasons) is plausible but out of scope for
  the v1 contract.

## Follow-up issues to file

- **#TBD — BE: AI edit endpoint.** New `POST /api/page-layouts/:id/ai-edit`
  that accepts a prompt, builds the context, calls the model with the
  cached system prompt, runs all five validation gates, and returns the
  validated `AiEditResponse`. Wires up the Anthropic SDK with prompt
  caching.
- **#TBD — Shared: op schema in `packages/types`.** Move
  `AiEditOp`, `AiEditResponse`, and `applyOp` (the reducer) into a
  shared package so FE and BE import the same source of truth.
- **#TBD — FE: patch applicator + diff preview.** Replace the stub
  handler from #522. Wire the endpoint, run the same `applyOp` reducer
  in a sandbox copy, render a diff list, and gate the apply behind an
  explicit "Apply" button.
- **#TBD — FE: undo for AI edits.** AI edits should land in the existing
  undo stack as a single entry per response (not per op).
- **#TBD — Eval harness.** A small set of (prompt, layout) → expected
  ops fixtures, run as a nightly check against the production model.
  Out of scope for the contract spike but should be filed before the
  endpoint goes live.

## Acceptance criteria for this spike

- [x] Doc lives at `docs/page-builder/ai-edit-contract.md`.
- [x] Op schema sketched in TypeScript with all six op kinds.
- [x] Three worked examples covering KPI add, section replace, and
      cross-zone move.
- [x] Validation pipeline described with five gates and pseudocode.
- [x] Safety rules listed and tied to validator behaviour rather than
      prompt instruction alone.
- [x] In/out scope for v1 explicit.
- [ ] Reviewed by stakeholders (post-merge).
- [ ] Follow-up implementation issues filed (post-merge).
