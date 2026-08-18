import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { isAdminUser } from "@/lib/admin";
import { BENCH_VER, type BenchRun } from "./bench-store";

function asRun(payload: unknown): BenchRun | null {
  const obj = typeof payload === "string" ? safeParse(payload) : payload;
  if (!obj || typeof obj !== "object") return null;
  const run = obj as BenchRun;
  if (!run.id || run.benchVer !== BENCH_VER) return null;
  return run;
}

function safeParse(s: string) {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return null;
  }
}

export const saveCloudRun = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((run: BenchRun) => run)
  .handler(async ({ context, data: run }) => {
    if (run.benchVer !== BENCH_VER) return { ok: false as const };
    const sql = await getSql();
    const safe: BenchRun = { ...run, keyHint: "已隐藏" };
    await sql.query(
      `insert into bench_runs (id, user_id, host, key_fp, bench_ver, payload)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (id) do nothing`,
      [run.id, context.userId, run.host, run.keyFp, run.benchVer, JSON.stringify(safe)],
    );
    for (const m of run.models) {
      await sql.query(
        `insert into bench_public_scores
          (id, user_id, host, model, iq, score, max_score, seconds,
           freshness, juice, web_suspect, iq_suspect)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict (id) do nothing`,
        [
          `${run.id}:${m.id}`,
          context.userId,
          run.host,
          m.id,
          m.iq ?? 70,
          m.total,
          m.max,
          m.seconds,
          m.probe?.freshness ?? null,
          m.probe?.juice.value ?? null,
          Boolean(m.probe?.webSuspect),
          Boolean(m.baseline?.suspect),
        ],
      );
    }
    return { ok: true as const };
  });

export const listCloudRuns = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql.query(`delete from bench_runs where user_id = $1 and bench_ver < $2`, [
      context.userId,
      BENCH_VER,
    ]);
    const rows = await sql<{ payload: unknown }>`
      select payload from bench_runs
      where user_id = ${context.userId} and bench_ver = ${BENCH_VER}
      order by created_at desc
      limit 80
    `;
    return rows.map((r) => asRun(r.payload)).filter((x): x is BenchRun => Boolean(x));
  });

export type PublicModelRow = {
  model: string;
  best_iq: number;
  best_score: number;
  best_seconds: number;
  runs: number;
  /** 全网见过的最新知识季度（YYYYQN 字典序即时间序） */
  freshness: string | null;
};

export type PublicChannelRow = {
  host: string;
  runs: number;
  models: number;
  avg_iq: number;
  best_iq: number;
  web_suspect: boolean;
  juice_seen: boolean;
  iq_suspect: boolean;
};

export type BaselineRow = {
  model: string;
  runs: number;
  med_iq: number;
  p25_iq: number;
  best_iq: number;
};

/** 全网分数基线：给降智对照用，公开数据，无需登录 */
export const modelBaselines = createServerFn({ method: "POST" })
  .validator((models: string[]) =>
    (Array.isArray(models) ? models : []).slice(0, 30).map((m) => String(m).slice(0, 200)),
  )
  .handler(async ({ data: models }) => {
    if (!models.length) return [] as BaselineRow[];
    const sql = await getSql();
    return sql.query<BaselineRow>(
      `select model,
              count(*)::int as runs,
              round(percentile_cont(0.5) within group (order by iq))::int as med_iq,
              round(percentile_cont(0.25) within group (order by iq))::int as p25_iq,
              max(iq)::int as best_iq
       from bench_public_scores
       where model = any($1::text[])
       group by model`,
      [models],
    );
  });

export const publicModelBoard = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  return sql<PublicModelRow>`
    select model,
           max(iq)::int as best_iq,
           max(score)::int as best_score,
           min(seconds)::float as best_seconds,
           count(*)::int as runs,
           max(freshness) as freshness
    from bench_public_scores
    group by model
    order by best_iq desc, best_seconds asc
    limit 50
  `;
});

export const publicChannelBoard = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  return sql<PublicChannelRow>`
    select host,
           count(*)::int as runs,
           count(distinct model)::int as models,
           round(avg(iq))::int as avg_iq,
           max(iq)::int as best_iq,
           bool_or(web_suspect) as web_suspect,
           bool_or(juice is not null) as juice_seen,
           bool_or(iq_suspect) as iq_suspect
    from bench_public_scores
    group by host
    order by avg_iq desc, best_iq desc
    limit 50
  `;
});

export const deleteCloudRun = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    await sql.query(`delete from bench_runs where id = $1 and user_id = $2`, [id, context.userId]);
    await sql.query(`delete from bench_public_scores where user_id = $1 and id like $2`, [
      context.userId,
      `${id}:%`,
    ]);
    return { ok: true as const };
  });

export const clearMyCloudRuns = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql.query(`delete from bench_runs where user_id = $1`, [context.userId]);
    await sql.query(`delete from bench_public_scores where user_id = $1`, [context.userId]);
    return { ok: true as const };
  });

export const whoamiAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const u = await getSessionUser();
  return { signedIn: Boolean(u), admin: isAdminUser(u) };
});

export const wipePublicBoards = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const u = await getSessionUser();
    if (!isAdminUser({ id: context.userId, email: u?.email })) {
      throw new Error("无权清空公开榜");
    }
    const sql = await getSql();
    await sql.query(`truncate table bench_public_scores`);
    await sql.query(`delete from bench_runs`);
    return { ok: true as const };
  });
