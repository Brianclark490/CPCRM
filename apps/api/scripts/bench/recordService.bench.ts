/**
 * recordService benchmark — Phase 3a Kysely migration (issue #444).
 *
 * Measures the end-to-end latency of `listRecords` against a real
 * PostgreSQL instance with 10,000 seeded records. This is the harness
 * referenced in the Phase 3a acceptance criterion "Capture benchmark
 * numbers for listRecords on 10k records".
 *
 * The benchmark exercises every non-trivial `listRecords` code path:
 *
 *   listRecords.noSearch                — baseline, no ILIKE
 *   listRecords.nameSearch              — ILIKE on records.name only
 *   listRecords.jsonbSearch             — ILIKE across JSONB text fields
 *   listRecords.multiFieldSearch        — search term matches multiple fields
 *   listRecords.sortByName              — ORDER BY name ASC
 *   listRecords.sortByCreatedAt         — ORDER BY created_at DESC
 *   listRecords.sortByJsonbField        — ORDER BY field_values->>$1
 *   listRecords.paginateDeep            — OFFSET 9000 (deep page)
 *
 * Additionally, createRecord / getRecord / updateRecord / deleteRecord
 * are benchmarked for point-query comparisons against raw-pg.
 *
 * ─── Usage ────────────────────────────────────────────────────────────────
 *
 *   docker run -d --rm --name cpcrm-bench \
 *     -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17
 *   export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
 *   npm run --workspace @cpcrm/api dev:migrate
 *   npx tsx apps/api/scripts/bench/recordService.bench.ts
 *
 * Flags (environment variables):
 *
 *   BENCH_ITERATIONS  number of iterations per operation     (default 200)
 *   BENCH_WARMUP      number of warm-up iterations           (default 20)
 *   BENCH_RECORDS     number of records to seed              (default 10000)
 *   BENCH_TENANT      tenant_id for the fixture data         (default bench-tenant-<uuid>)
 *   BENCH_CLEANUP     "false" to leave bench data in place   (default true)
 *
 * ─── Why this is a script, not a vitest test ─────────────────────────────
 *
 * Benchmarks are sensitive to the host and the network path to the
 * database, so there is no stable threshold we can assert against in CI
 * without flakes. The harness is committed so reviewers and future
 * migrations can reproduce the numbers locally when they want a
 * before/after comparison against raw-pg.
 */
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { tenantStore } from '../../src/db/tenantContext.js';
import { pool } from '../../src/db/client.js';
import {
  createRecord,
  listRecords,
  getRecord,
  updateRecord,
  deleteRecord,
} from '../../src/services/recordService.js';

const ITERATIONS = Number.parseInt(process.env.BENCH_ITERATIONS ?? '200', 10);
const WARMUP = Number.parseInt(process.env.BENCH_WARMUP ?? '20', 10);
const SEED_SIZE = Number.parseInt(process.env.BENCH_RECORDS ?? '10000', 10);
const TENANT_ID = process.env.BENCH_TENANT ?? `bench-tenant-${randomUUID()}`;
const CLEANUP = (process.env.BENCH_CLEANUP ?? 'true').toLowerCase() !== 'false';

// ─── Fixture setup ────────────────────────────────────────────────────────────

interface Fixture {
  tenantId: string;
  objectId: string;
  apiName: string;
  ownerId: string;
  /** Ids of a few seeded records we can target for point-query benches. */
  sampleRecordIds: string[];
}

async function setupFixture(): Promise<Fixture> {
  const tenantId = TENANT_ID;
  const objectId = randomUUID();
  const ownerId = 'bench-user';
  const apiName = 'bench_account';

  // Ensure tenant row (RLS bypass policy applies — no tenant context needed).
  await pool.query(
    `INSERT INTO tenants (id, name, slug, status)
     VALUES ($1, 'bench', $2, 'active')
     ON CONFLICT (id) DO NOTHING`,
    [tenantId, `bench-${tenantId}`],
  );

  // Ensure an object definition and field definitions exist.
  await pool.query(
    `INSERT INTO object_definitions
       (id, tenant_id, api_name, label, plural_label, owner_id, is_system)
     VALUES ($1, $2, $3, 'Bench', 'Benches', $4, false)
     ON CONFLICT (id) DO NOTHING`,
    [objectId, tenantId, apiName, ownerId],
  );

  // Field definitions: one text (full_name), one email, one textarea (notes).
  // All three are JSONB-searchable per the ILIKE predicate in listRecords.
  const fieldRows: Array<[string, string, string, number]> = [
    ['full_name', 'Full Name', 'text', 1],
    ['email', 'Email', 'email', 2],
    ['notes', 'Notes', 'textarea', 3],
  ];
  for (const [apiNm, label, fieldType, sortOrder] of fieldRows) {
    await pool.query(
      `INSERT INTO field_definitions
         (id, tenant_id, object_id, api_name, label, field_type, required, options, sort_order)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, false, '{}'::jsonb, $6)
       ON CONFLICT DO NOTHING`,
      [tenantId, objectId, apiNm, label, fieldType, sortOrder],
    );
  }

  // Bulk-seed SEED_SIZE records. Use a single multi-row INSERT for speed —
  // pg has a hard limit on bind parameters per statement (64k), so we
  // chunk by 500 rows × 10 columns = 5000 bindings per statement.
  console.log(`[bench] seeding ${SEED_SIZE} records…`);
  const CHUNK = 500;
  const sampleIds: string[] = [];
  const now = new Date();
  for (let chunkStart = 0; chunkStart < SEED_SIZE; chunkStart += CHUNK) {
    const end = Math.min(chunkStart + CHUNK, SEED_SIZE);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let pIdx = 1;
    for (let i = chunkStart; i < end; i++) {
      const id = randomUUID();
      if (i < 5) sampleIds.push(id);
      const firstName = `First${i}`;
      const lastName = `Last${i}`;
      const fullName = `${firstName} ${lastName}`;
      const email = `user${i}@example.com`;
      const notes = `Bench record #${i}`;
      const fieldValues = JSON.stringify({
        full_name: fullName,
        email,
        notes,
      });
      placeholders.push(
        `($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}::jsonb, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`,
      );
      values.push(
        id,
        tenantId,
        objectId,
        fullName,
        fieldValues,
        ownerId,
        'Bench Owner',
        ownerId,
        now,
        now,
      );
    }
    await pool.query(
      `INSERT INTO records
         (id, tenant_id, object_id, name, field_values, owner_id, owner_name, updated_by, created_at, updated_at)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
  }
  console.log(`[bench] seeded ${SEED_SIZE} records.`);

  return { tenantId, objectId, apiName, ownerId, sampleRecordIds: sampleIds };
}

async function teardownFixture(fx: Fixture): Promise<void> {
  if (!CLEANUP) return;
  await pool.query(`DELETE FROM records WHERE tenant_id = $1`, [fx.tenantId]);
  await pool.query(
    `DELETE FROM field_definitions WHERE tenant_id = $1 AND object_id = $2`,
    [fx.tenantId, fx.objectId],
  );
  await pool.query(
    `DELETE FROM object_definitions WHERE id = $1`,
    [fx.objectId],
  );
  // Leave the tenants row — it's cheap and may be reused.
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
    'op'.padEnd(32),
    'n'.padStart(6),
    'min'.padStart(8),
    'avg'.padStart(8),
    'p50'.padStart(8),
    'p95'.padStart(8),
    'p99'.padStart(8),
    'max'.padStart(8),
  ].join(' ');

  console.log();
  console.log('recordService — Kysely Phase 3a benchmark');
  console.log(
    'tenant:',
    TENANT_ID,
    '| records:',
    SEED_SIZE,
    '| iterations:',
    ITERATIONS,
    '| warmup:',
    WARMUP,
  );
  console.log();
  console.log(header);
  console.log('─'.repeat(header.length));
  for (const r of rows) {
    console.log(
      [
        r.op.padEnd(32),
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

    // ── listRecords: no search, default sort ──────────────────────────────
    samples.push(
      await bench('listRecords.noSearch', () =>
        listRecords({
          tenantId: fx.tenantId,
          apiName: fx.apiName,
          ownerId: fx.ownerId,
          limit: 50,
          offset: 0,
        }),
      ),
    );

    // ── listRecords: ILIKE on records.name only ───────────────────────────
    samples.push(
      await bench('listRecords.nameSearch', () =>
        listRecords({
          tenantId: fx.tenantId,
          apiName: fx.apiName,
          ownerId: fx.ownerId,
          search: 'First42',
          limit: 50,
          offset: 0,
        }),
      ),
    );

    // ── listRecords: JSONB ->> ILIKE across all text fields ───────────────
    samples.push(
      await bench('listRecords.jsonbSearch', () =>
        listRecords({
          tenantId: fx.tenantId,
          apiName: fx.apiName,
          ownerId: fx.ownerId,
          search: 'user1234@example',
          limit: 50,
          offset: 0,
        }),
      ),
    );

    // ── listRecords: multi-field match (term matches both name + email + notes) ──
    samples.push(
      await bench('listRecords.multiFieldSearch', () =>
        listRecords({
          tenantId: fx.tenantId,
          apiName: fx.apiName,
          ownerId: fx.ownerId,
          search: 'Bench',
          limit: 50,
          offset: 0,
        }),
      ),
    );

    // ── listRecords: ORDER BY name ASC ────────────────────────────────────
    samples.push(
      await bench('listRecords.sortByName', () =>
        listRecords({
          tenantId: fx.tenantId,
          apiName: fx.apiName,
          ownerId: fx.ownerId,
          sortBy: 'name',
          sortDir: 'asc',
          limit: 50,
          offset: 0,
        }),
      ),
    );

    // ── listRecords: ORDER BY created_at DESC (baseline) ──────────────────
    samples.push(
      await bench('listRecords.sortByCreatedAt', () =>
        listRecords({
          tenantId: fx.tenantId,
          apiName: fx.apiName,
          ownerId: fx.ownerId,
          sortBy: 'created_at',
          sortDir: 'desc',
          limit: 50,
          offset: 0,
        }),
      ),
    );

    // ── listRecords: ORDER BY field_values->>'full_name' (JSONB sort) ─────
    samples.push(
      await bench('listRecords.sortByJsonbField', () =>
        listRecords({
          tenantId: fx.tenantId,
          apiName: fx.apiName,
          ownerId: fx.ownerId,
          sortBy: 'full_name',
          sortDir: 'asc',
          limit: 50,
          offset: 0,
        }),
      ),
    );

    // ── listRecords: deep pagination (OFFSET near the end of the set) ─────
    samples.push(
      await bench('listRecords.paginateDeep', () =>
        listRecords({
          tenantId: fx.tenantId,
          apiName: fx.apiName,
          ownerId: fx.ownerId,
          limit: 50,
          offset: Math.max(0, SEED_SIZE - 100),
        }),
      ),
    );

    // ── Point queries ─────────────────────────────────────────────────────

    // createRecord — each iteration creates a fresh record so we don't
    // perturb the seeded 10k too much. Track ids so we can clean up later.
    const createdIds: string[] = [];
    samples.push(
      await bench('createRecord', async () => {
        const rec = await createRecord(
          fx.tenantId,
          fx.apiName,
          {
            full_name: `Bench Create ${randomUUID().slice(0, 8)}`,
            email: 'bench@create.test',
            notes: 'bench',
          },
          fx.ownerId,
        );
        createdIds.push(rec.id);
      }),
    );

    const sampleId = fx.sampleRecordIds[0]!;

    // getRecord — single-row fetch + relationships hydration.
    samples.push(
      await bench('getRecord', () =>
        getRecord(fx.tenantId, fx.apiName, sampleId, fx.ownerId),
      ),
    );

    // updateRecord — partial update on an existing seeded record.
    samples.push(
      await bench('updateRecord', () =>
        updateRecord(
          fx.tenantId,
          fx.apiName,
          sampleId,
          { notes: `Updated ${Date.now()}` },
          fx.ownerId,
        ),
      ),
    );

    // deleteRecord — delete the records we created in createRecord.
    let deleteIdx = 0;
    const deleteIterations = Math.min(
      ITERATIONS,
      Math.max(0, createdIds.length - WARMUP),
    );
    if (deleteIterations > 0) {
      samples.push(
        await bench(
          'deleteRecord',
          async () => {
            const id = createdIds[deleteIdx++]!;
            await deleteRecord(fx.tenantId, fx.apiName, id, fx.ownerId);
          },
          deleteIterations,
          0,
        ),
      );
    }

    // Clean up any records createRecord left behind that weren't deleted by
    // the deleteRecord bench (warmup iterations, overflow).
    for (let i = deleteIdx; i < createdIds.length; i++) {
      await pool.query(
        `DELETE FROM records WHERE id = $1 AND tenant_id = $2`,
        [createdIds[i], fx.tenantId],
      );
    }

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
