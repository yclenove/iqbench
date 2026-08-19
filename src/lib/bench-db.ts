import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { isAdminUser } from "@/lib/admin";
import { BENCH_VER, dimBreakdown, publishHost, type BenchRun } from "./bench-store";

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
    const host = publishHost(run.host, run.hostPublic === true);
    const safe: BenchRun = { ...run, host, keyHint: "已隐藏", hostPublic: run.hostPublic === true };
    await sql.query(
      `insert into bench_runs (id, user_id, host, key_fp, bench_ver, payload)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (id) do nothing`,
      [run.id, context.userId, host, run.keyFp, run.benchVer, JSON.stringify(safe)],
    );
    for (const m of run.models) {
      await sql.query(
        `insert into bench_public_scores
          (id, user_id, host, model, iq, score, max_score, seconds,
           freshness, juice, web_suspect, iq_suspect, dims)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
         on conflict (id) do nothing`,
        [
          `${run.id}:${m.id}`,
          context.userId,
          host,
          m.id,
          m.iq ?? 70,
          m.total,
          m.max,
          m.seconds,
          m.probe?.freshness ?? null,
          m.probe?.juice.value ?? null,
          Boolean(m.probe?.webSuspect),
          Boolean(m.baseline?.suspect),
          JSON.stringify(dimBreakdown(m.items)),
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
  med_iq: number;
  p25_iq: number;
  best_iq: number;
  best_score: number;
  avg_seconds: number;
  runs: number;
  hosts: number;
  freshness: string | null;
};

export type PublicChannelRow = {
  host: string;
  runs: number;
  models: number;
  avg_iq: number;
  med_iq: number;
  best_iq: number;
  /** 该渠道 IQ − 同模型全网中位。只测强模拉不动。null = 没有跨渠对照。 */
  lift: number | null;
  web_suspect: boolean;
  juice_seen: boolean;
  iq_suspect: boolean;
};

export type PublicPairRow = {
  model: string;
  host: string;
  med_iq: number;
  best_iq: number;
  runs: number;
  avg_seconds: number;
};

export type PublicDimRow = {
  dim: string;
  model: string;
  pct: number;
  n: number;
};

export type BaselineRow = {
  model: string;
  runs: number;
  med_iq: number;
  p25_iq: number;
  best_iq: number;
};

function num(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function mapModel(r: Record<string, unknown>): PublicModelRow {
  return {
    model: String(r.model ?? ""),
    med_iq: Math.round(num(r.med_iq)),
    p25_iq: Math.round(num(r.p25_iq)),
    best_iq: Math.round(num(r.best_iq)),
    best_score: Math.round(num(r.best_score)),
    avg_seconds: num(r.avg_seconds),
    runs: Math.round(num(r.runs)),
    hosts: Math.round(num(r.hosts)),
    freshness: r.freshness == null ? null : String(r.freshness),
  };
}

function mapChannel(r: Record<string, unknown>): PublicChannelRow {
  const liftRaw = r.lift;
  return {
    host: String(r.host ?? ""),
    runs: Math.round(num(r.runs)),
    models: Math.round(num(r.models)),
    avg_iq: Math.round(num(r.avg_iq)),
    med_iq: Math.round(num(r.med_iq)),
    best_iq: Math.round(num(r.best_iq)),
    lift: liftRaw == null || liftRaw === "" ? null : Math.round(num(liftRaw)),
    web_suspect: Boolean(r.web_suspect),
    juice_seen: Boolean(r.juice_seen),
    iq_suspect: Boolean(r.iq_suspect),
  };
}

function mapPair(r: Record<string, unknown>): PublicPairRow {
  return {
    model: String(r.model ?? ""),
    host: String(r.host ?? ""),
    med_iq: Math.round(num(r.med_iq)),
    best_iq: Math.round(num(r.best_iq)),
    runs: Math.round(num(r.runs)),
    avg_seconds: num(r.avg_seconds),
  };
}

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

async function queryModels(sql: Sql): Promise<PublicModelRow[]> {
  const rows = await sql.query(
    `select model,
            round(percentile_cont(0.5) within group (order by iq))::int as med_iq,
            round(percentile_cont(0.25) within group (order by iq))::int as p25_iq,
            max(iq)::int as best_iq,
            max(score)::int as best_score,
            round(avg(seconds))::int as avg_seconds,
            count(*)::int as runs,
            count(distinct host)::int as hosts,
            max(freshness) as freshness
     from bench_public_scores
     group by model
     order by med_iq desc, best_iq desc, avg_seconds asc
     limit 80`,
  );
  return rows.map(mapModel);
}

async function queryChannels(sql: Sql): Promise<PublicChannelRow[]> {
  const rows = await sql.query(
    `with host_n as (
        select model, count(distinct host)::int as hc
        from bench_public_scores
        group by model
      ),
      model_med as (
        select s.model, percentile_cont(0.5) within group (order by s.iq) as med
        from bench_public_scores s
        join host_n h on h.model = s.model and h.hc >= 2
        group by s.model
      ),
      scored as (
        select s.host, s.model, s.iq, s.web_suspect, s.juice, s.iq_suspect,
               (s.iq - m.med) as delta
        from bench_public_scores s
        left join model_med m on m.model = s.model
      )
      select host,
             count(*)::int as runs,
             count(distinct model)::int as models,
             round(avg(iq))::int as avg_iq,
             round(percentile_cont(0.5) within group (order by iq))::int as med_iq,
             max(iq)::int as best_iq,
             round(avg(delta))::int as lift,
             bool_or(web_suspect) as web_suspect,
             bool_or(juice is not null) as juice_seen,
             bool_or(iq_suspect) as iq_suspect
      from scored
      group by host
      order by med_iq desc
      limit 80`,
  );
  const mapped = rows.map(mapChannel);
  const byHost = new Map<string, PublicChannelRow>();
  for (const r of mapped) {
    const prev = byHost.get(r.host);
    if (!prev) {
      byHost.set(r.host, { ...r });
      continue;
    }
    const nextRuns = prev.runs + r.runs;
    prev.avg_iq = Math.round((prev.avg_iq * prev.runs + r.avg_iq * r.runs) / Math.max(1, nextRuns));
    prev.med_iq = Math.round((prev.med_iq * prev.runs + r.med_iq * r.runs) / Math.max(1, nextRuns));
    prev.runs = nextRuns;
    prev.models += r.models;
    prev.best_iq = Math.max(prev.best_iq, r.best_iq);
    if (prev.lift == null) prev.lift = r.lift;
    else if (r.lift != null) prev.lift = Math.round((prev.lift + r.lift) / 2);
    prev.web_suspect = prev.web_suspect || r.web_suspect;
    prev.juice_seen = prev.juice_seen || r.juice_seen;
    prev.iq_suspect = prev.iq_suspect || r.iq_suspect;
  }
  return [...byHost.values()].sort((a, b) => (b.lift ?? -999) - (a.lift ?? -999) || b.med_iq - a.med_iq);
}

async function queryPairs(sql: Sql): Promise<PublicPairRow[]> {
  const rows = await sql.query(
    `select model, host,
            round(percentile_cont(0.5) within group (order by iq))::int as med_iq,
            max(iq)::int as best_iq,
            count(*)::int as runs,
            round(avg(seconds))::int as avg_seconds
     from bench_public_scores
     group by model, host
     order by model, med_iq desc, best_iq desc
     limit 400`,
  );
  return rows.map(mapPair);
}

async function queryDims(sql: Sql): Promise<PublicDimRow[]> {
  try {
    const rows = await sql.query(
      `select dim, model,
              round(100 * sum((v->>'s')::float) / nullif(sum((v->>'m')::float), 0))::int as pct,
              count(*)::int as n
       from bench_public_scores,
            lateral jsonb_each(dims) as d(dim, v)
       where dims is not null
       group by dim, model
       having count(*) >= 1
       order by dim, pct desc, n desc`,
    );
    return rows.map((r) => ({
      dim: String(r.dim ?? ""),
      model: String(r.model ?? ""),
      pct: Math.round(num(r.pct)),
      n: Math.round(num(r.n)),
    }));
  } catch {
    return [];
  }
}

export const publicModelBoard = createServerFn({ method: "GET" }).handler(async () =>
  queryModels(await getSql()),
);

export const publicChannelBoard = createServerFn({ method: "GET" }).handler(async () =>
  queryChannels(await getSql()),
);

export const publicPairBoard = createServerFn({ method: "GET" }).handler(async () =>
  queryPairs(await getSql()),
);

export const publicDimBoard = createServerFn({ method: "GET" }).handler(async () =>
  queryDims(await getSql()),
);

export const publicBoardPack = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const [models, channels, pairs, dims] = await Promise.all([
    queryModels(sql),
    queryChannels(sql),
    queryPairs(sql),
    queryDims(sql),
  ]);
  return { models, channels, pairs, dims };
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
