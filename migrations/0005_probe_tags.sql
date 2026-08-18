-- 公开榜携带渠道鉴定标签（不计分，仅展示）
alter table bench_public_scores add column if not exists freshness text;
alter table bench_public_scores add column if not exists juice integer;
alter table bench_public_scores add column if not exists web_suspect boolean not null default false;
alter table bench_public_scores add column if not exists iq_suspect boolean not null default false;
