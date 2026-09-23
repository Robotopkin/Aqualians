-- AuraSea tables. Run once in the Supabase SQL editor.
-- The service role used by the server bypasses row level security.
-- The public anon key cannot read these tables.

create table if not exists users (
  id bigint generated always as identity primary key,
  address text not null unique,
  x_handle text not null unique,
  x_user_id text unique,
  role text not null,
  evidence text not null,
  aura double precision not null default 0,
  referrer_id bigint references users(id),
  referral_code text not null unique,
  register_message text,
  register_signature text,
  last_grant_on text,
  created_at text not null
);

create table if not exists sessions (
  token text primary key,
  user_id bigint not null references users(id),
  created_at text not null
);

create table if not exists nonces (
  nonce text primary key,
  created_at bigint not null
);

create table if not exists rounds (
  id text primary key,
  kind text not null,
  mode text not null,
  categories text not null,
  starts_at bigint not null,
  bets_close_at bigint not null,
  ends_at bigint not null,
  status text not null,
  place integer,
  baseline_json text,
  latest_json text,
  baseline_at bigint,
  latest_at bigint,
  reading_source text,
  result_json text
);

create table if not exists bets (
  id bigint generated always as identity primary key,
  round_id text not null references rounds(id),
  user_id bigint not null references users(id),
  category text not null,
  rank integer not null,
  amount double precision not null,
  role text not null,
  created_at text not null
);

create table if not exists ledger (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id),
  amount double precision not null,
  reason text not null,
  ref text,
  message text not null,
  signature text not null,
  payload text,
  created_at text not null
);

create table if not exists sector_cache (
  category text primary key,
  volume double precision not null,
  tx double precision not null,
  updated_at bigint not null,
  source text not null
);

create table if not exists category_history (
  id bigint generated always as identity primary key,
  category text not null,
  metric text not null,
  change_pct double precision not null,
  rank integer not null,
  round_id text not null,
  settled_at bigint not null
);

create table if not exists api_calls (
  id bigint generated always as identity primary key,
  endpoint text not null,
  status integer not null,
  credits integer,
  created_at bigint not null
);

create table if not exists meta (
  key text primary key,
  value text not null
);

create index if not exists bets_round on bets(round_id);
create index if not exists bets_user on bets(user_id);
create index if not exists ledger_user on ledger(user_id);
create index if not exists api_calls_time on api_calls(created_at);
create index if not exists history_lookup on category_history(category, metric, settled_at);
create index if not exists users_referrer on users(referrer_id);

alter table users enable row level security;
alter table sessions enable row level security;
alter table nonces enable row level security;
alter table rounds enable row level security;
alter table bets enable row level security;
alter table ledger enable row level security;
alter table sector_cache enable row level security;
alter table category_history enable row level security;
alter table api_calls enable row level security;
alter table meta enable row level security;
