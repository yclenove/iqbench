create table if not exists bench_runs (
  id         text primary key,
  user_id    text not null,
  host       text not null,
  key_fp     text not null,
  bench_ver  integer not null default 3,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists bench_runs_user_idx on bench_runs (user_id, created_at desc);
create index if not exists bench_runs_scope_idx on bench_runs (user_id, host, key_fp);
