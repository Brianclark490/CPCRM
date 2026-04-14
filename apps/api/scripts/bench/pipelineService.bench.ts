/**
 * pipelineService benchmark — Phase 2 Kysely pilot (issue #443).
 *
 * Measures the end-to-end latency of every exported function in
 * `pipelineService.ts` against a real PostgreSQL instance. This is the
 * harness referenced in PR #450's acceptance criterion
 * "Capture benchmark numbers".
 *
 * ─── Usage ────────────────────────────────────────────────────────────────
 *
 * Start a local Postgres (any running instance that matches the schema in
 * `apps/api/src/db/migrations/`), apply migrations, and point the script at
 * it via `DATABASE_URL`:
 *
 *   docker run -d --rm --name cpcrm-bench \
 *     -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17
 *   export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
 *   npm run --workspace @cpcrm/api dev:migrate   # or run runMigrations.ts
 *   npx tsx apps/api/scripts/bench/pipelineService.bench.ts
 *
 * Flags (environment variables):
 *
 *   BENCH_ITERATIONS  number of iterations per operation        (default 200)
 *   BENCH_WARMUP      number of warm-up iterations              (default 20)
 *   BENCH_TENANT      tenant_id to use for the fixture data     (default bench-tenant)
 *   BENCH_CLEANUP     "false" to leave bench data in place      (default true)
 *
 * ─── What it reports ─────────────────────────────────────────────────────
 *
 * For each of the 9 service functions below, prints min / avg / p50 / p95 /
 * p99 / max latency in milliseconds:
 *
 *   createPipeline, listPipelines, getPipelineById, updatePipeline,
 *   deletePipeline, createStage, updateStage, deleteStage, reorderStages
 *
 * ─── Why this is a script, not a vitest test ─────────────────────────────
 *
 * Benchmarks are inherently sensitive to the host and the network path to
 * the database, so there is no stable threshold we can assert against in
 * CI without noisy flakes. The harness is committed so reviewers and
 * future migrations can reproduce the numbers locally when they want a
 * before/after comparison against raw-pg.
 */
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { tenantStore } from '../../src/db/tenantContext.js';
import { pool } from '../../src/db/client.js';
import {
  createPipeline,
  createStage,
  deletePipeline,
  deleteStage,
  getPipelineById,
  listPipelines,
  reorderStages,
  updatePipeline,
  updateStage,
} from '../../src/services/pipelineService.js';

const ITERATIONS = Number.parseInt(process.env.BENCH_ITERATIONS ?? '200', 10);
const WARMUP = Number.parseInt(process.env.BENCH_WARMUP ?? '20', 10);
const TENANT_ID = process.env.BENCH_TENANT ?? `bench-tenant-${randomUUID()}`;
const CLEANUP = (process.env.BENCH_CLEANUP ?? 'true').toLowerCase() !== 'false';

// ─── Fixture setup ────────────────────────────────────────────────────────────

interface Fixture {
  tenantId: string;
  objectId: string;
  ownerId: string;
}

async function setupFixture(): Promise<Fixture> {
  const tenantId = TENANT_ID;
  const objectId = randomUUID();
  const ownerId = 'bench-user';

  // Ensure tenant row exists (RLS bypass policy applies — no tenant context).
  await pool.query(
    `INSERT INTO tenants (id, name, slug, status)
     VALUES ($1, 'bench', $2, 'active')
     ON CONFLICT (id) DO NOTHING`,
    [tenantId, `bench-${tenantId}`],
  );

  // Ensure an object definition exists for the fixture.
  await pool.query(
    `INSERT INTO object_definitions
       (id, tenant_id, api_name, label, plural_label, owner_id, is_system)
     VALUES ($1, $2, 'bench_object', 'Bench', 'Benches', $3, false)
     ON CONFLICT (id) DO NOTHING`,
    [objectId, tenantId, ownerId],
  );

  return { tenantId, objectId, ownerId };
}

async function teardownFixture(fx: Fixture): Promise<void> {
  if (!CLEANUP) return;
  await pool.query(
    `DELETE FROM pipeline_definitions WHERE tenant_id = $1`,
    [fx.tenantId],
  );
  await pool.query(
    `DELETE FROM object_definitions WHERE id = $1`,
    [fx.objectId],
  );
  // Leave the tenant row — it's cheap and may be reused across runs.
}

// ─── Timing primitives ───────────────────────────────────────────────────────

interface Sample {
  label: string;
  samples: number[];
}

async function time<T>(fn: () => Promise<T>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

async function bench(
  label: string,
  fn: () => Promise<unknown>,
  iterations = ITERATIONS,
  warmup = WARMUP,
): Promise<Sample> {
  for (let i = 0; i < warmup; i++) await fn();
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) samples.push(await time(fn));
  return { label, samples };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function report(samples: Sample[]): void {
  const rows = samples.map(({ label, samples }) => {
    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      op: label,
      n: sorted.length,
      min: sorted[0] ?? NaN,
      avg: sum / sorted.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted[sorted.length - 1] ?? NaN,
    };
  });

  const fmt = (v: number) => v.toFixed(2).padStart(8);
  const header = [
    'op'.padEnd(22),
    'n'.padStart(6),
    'min'.padStart(8),
    'avg'.padStart(8),
    'p50'.padStart(8),
    'p95'.padStart(8),
    'p99'.padStart(8),
    'max'.padStart(8),
  ].join(' ');

  console.log();
  console.log('pipelineService — Kysely Phase 2 pilot benchmark');
  console.log('tenant:', TENANT_ID, '| iterations:', ITERATIONS, '| warmup:', WARMUP);
  console.log();
  console.log(header);
  console.log('─'.repeat(header.length));
  for (const r of rows) {
    console.log(
      [
        r.op.padEnd(22),
        String(r.n).padStart(6),
        fmt(r.min),
        fmt(r.avg),
        fmt(r.p50),
        fmt(r.p95),
        fmt(r.p99),
        fmt(r.max),
      ].join(' '),
    );
  }
  console.log();
}

// ─── Benchmark suite ─────────────────────────────────────────────────────────

async function runSuite(fx: Fixture): Promise<Sample[]> {
  // All service calls run inside tenantStore.run so the RLS proxy on
  // pool.connect() / pool.query sets `app.current_tenant_id`.
  return tenantStore.run(fx.tenantId, async () => {
    const samples: Sample[] = [];

    // createPipeline — each iteration creates a fresh pipeline with a
    // unique api_name so we don't hit the uniqueness constraint.
    let createdIds: string[] = [];
    samples.push(
      await bench('createPipeline', async () => {
        const id = randomUUID();
        const pipeline = await createPipeline(fx.tenantId, {
          name: `Bench ${id.slice(0, 8)}`,
          apiName: `bench_${id.replace(/-/g, '').slice(0, 16)}`,
          objectId: fx.objectId,
          ownerId: fx.ownerId,
        });
        createdIds.push(pipeline.id);
      }),
    );

    const anchorId = createdIds[0]!;

    // listPipelines — cheap, tenant-scoped list.
    samples.push(await bench('listPipelines', () => listPipelines(fx.tenantId)));

    // getPipelineById — includes stages + gates hydration.
    samples.push(
      await bench('getPipelineById', () => getPipelineById(fx.tenantId, anchorId)),
    );

    // updatePipeline — dynamic SET with one field.
    samples.push(
      await bench('updatePipeline', () =>
        updatePipeline(fx.tenantId, anchorId, { name: `Bench ${Date.now()}` }),
      ),
    );

    // createStage — runs inside a Kysely transaction (sort_order shift + insert).
    const stageIdsByIteration: string[] = [];
    samples.push(
      await bench('createStage', async () => {
        const apiName = `bench_stage_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
        const stage = await createStage(fx.tenantId, anchorId, {
          name: 'Bench Stage',
          apiName,
          stageType: 'open',
          colour: 'blue',
        });
        stageIdsByIteration.push(stage.id);
      }),
    );

    // updateStage — dynamic SET on an existing stage.
    const stageForUpdate = stageIdsByIteration[0]!;
    samples.push(
      await bench('updateStage', () =>
        updateStage(fx.tenantId, anchorId, stageForUpdate, {
          name: `Bench Stage ${Date.now()}`,
        }),
      ),
    );

    // reorderStages — updates every stage's sort_order in a loop.
    // We fetch the current stages once per iteration to get a valid set of ids.
    samples.push(
      await bench('reorderStages', async () => {
        const pipeline = await getPipelineById(fx.tenantId, anchorId);
        const ids = pipeline!.stages.map((s) => s.id);
        // Keep won/lost at the end to pass validation.
        const open = ids.filter((id) => {
          const st = pipeline!.stages.find((s) => s.id === id)!.stageType;
          return st === 'open';
        });
        const terminal = ids.filter((id) => {
          const st = pipeline!.stages.find((s) => s.id === id)!.stageType;
          return st === 'won' || st === 'lost';
        });
        await reorderStages(fx.tenantId, anchorId, [...open, ...terminal]);
      }),
    );

    // deleteStage — delete the stages we created in the createStage bench so
    // we can benchmark the delete path. We'll create fresh stages for this
    // bench so we have enough to iterate over.
    const deletableStages: string[] = [];
    for (let i = 0; i < ITERATIONS + WARMUP; i++) {
      const stage = await createStage(fx.tenantId, anchorId, {
        name: 'Bench Deletable',
        apiName: `bench_del_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        stageType: 'open',
        colour: 'grey',
      });
      deletableStages.push(stage.id);
    }
    let deleteIdx = 0;
    samples.push(
      await bench('deleteStage', async () => {
        const stageId = deletableStages[deleteIdx++]!;
        await deleteStage(fx.tenantId, anchorId, stageId);
      }),
    );

    // deletePipeline — delete every pipeline we created earlier. We can only
    // run as many iterations as we have pipelines, so cap n to createdIds.length.
    let pipelineDeleteIdx = 0;
    samples.push(
      await bench(
        'deletePipeline',
        async () => {
          const id = createdIds[pipelineDeleteIdx++]!;
          await deletePipeline(fx.tenantId, id);
        },
        // We need a pipeline per iteration; the createPipeline bench already
        // produced ITERATIONS + WARMUP of them.
        Math.min(ITERATIONS, createdIds.length - WARMUP),
        0,
      ),
    );

    return samples;
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const fx = await setupFixture();
  try {
    const samples = await runSuite(fx);
    report(samples);
  } finally {
    await teardownFixture(fx);
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[bench] failed:', err);
  process.exit(1);
});
