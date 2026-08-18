create table if not exists bench_public_scores (
  id         text primary key,
  user_id    text not null,
  host       text not null,
  model      text not null,
  iq         integer not null,
  score      integer not null,
  max_score  integer not null,
  seconds    double precision not null,
  created_at timestamptz not null default now()
);
create index if not exists bench_public_model_idx on bench_public_scores (model, iq desc);
create index if not exists bench_public_host_idx on bench_public_scores (host, iq desc);
