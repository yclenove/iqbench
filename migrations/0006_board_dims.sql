-- 公开榜按维度拆分，供维度榜 / 雷达用。旧行可空。
alter table bench_public_scores add column if not exists dims jsonb;
create index if not exists bench_public_dims_idx on bench_public_scores using gin (dims) where dims is not null;
