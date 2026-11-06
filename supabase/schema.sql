-- =====================================================================
-- 韓國旅行記帳系統 Supabase 資料庫結構
-- 使用方式：登入 Supabase 專案 → SQL Editor → 貼上整份執行一次即可。
-- 可重複執行（全部為 if not exists / create or replace / drop policy if exists）。
--
-- 設計重點
--  1. 雙幣別：每筆交易存「原始幣別 + 原始金額 + 當筆匯率」，
--     amount_krw / amount_twd 由資料庫 generated column 自動換算，
--     前端不會（也不可能）自己算錯。
--  2. 用扣的方式：錢包有期初餘額，交易直接扣；預算也是扣。
--     餘額一律由 view 即時算出，不存快取欄位，避免對不起來。
--  3. 多錢包：悠遊付（扣台幣）、韓元現金、台幣現金、信用卡…
--     每個錢包自己決定「餘額用哪個幣別計算」。
--  4. 所有資料以 auth.uid() 隔離（RLS），user_id 由 default 自動帶入。
-- =====================================================================

-- ---------- trip_settings：這趟旅行的預算與預設匯率（一人一列） ----------
create table if not exists public.trip_settings (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  title text not null default '韓國旅行',
  start_date date,
  end_date date,
  -- 總預算：兩種幣別各自扣。只想管一邊的話，另一邊留 0 即可。
  budget_krw numeric(14, 2) not null default 0 check (budget_krw >= 0),
  budget_twd numeric(14, 2) not null default 0 check (budget_twd >= 0),
  -- 預設匯率：1 台幣 = ? 韓元（例：43 代表 1 TWD ≈ 43 KRW）
  krw_per_twd numeric(12, 6) not null default 43 check (krw_per_twd > 0),
  updated_at timestamptz not null default now()
);

alter table public.trip_settings enable row level security;

drop policy if exists "trip_settings_own" on public.trip_settings;
create policy "trip_settings_own" on public.trip_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- wallets：付款方式／錢包 ----------
-- kind 只是給 UI 分類與 icon 用；真正影響計算的是 balance_currency。
create table if not exists public.wallets (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  kind text not null default 'other'
    check (kind in ('easywallet', 'cash', 'card', 'transit', 'other')),
  -- 這個錢包的餘額用哪個幣別計：悠遊付 / 信用卡扣台幣 → TWD；韓元現金 → KRW
  balance_currency text not null check (balance_currency in ('KRW', 'TWD')),
  -- 期初餘額（出發前這個錢包裡有多少錢；信用卡可填額度或 0）
  opening_balance numeric(14, 2) not null default 0,
  -- 此錢包專屬匯率（悠遊付／刷卡的實際扣款匯率常和現金換匯不同）。
  -- 留 null 就沿用 trip_settings.krw_per_twd。
  default_krw_per_twd numeric(12, 6) check (default_krw_per_twd > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 交易用 (wallet_id, user_id) 複合外鍵指回來，確保不會把別人的錢包接上自己的帳
create unique index if not exists wallets_id_user_key on public.wallets (id, user_id);
create index if not exists wallets_user_idx on public.wallets (user_id, sort_order);

alter table public.wallets enable row level security;

drop policy if exists "wallets_own" on public.wallets;
create policy "wallets_own" on public.wallets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- categories：消費分類（可自訂，純粹給選單用） ----------
create table if not exists public.categories (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  -- 圖示 key（見 src/utils/categoryIcons.ts），舊資料存 emoji 也相容
  emoji text not null default 'other',
  sort_order int not null default 0
);

create unique index if not exists categories_user_name_key on public.categories (user_id, name);

alter table public.categories enable row level security;

drop policy if exists "categories_own" on public.categories;
create policy "categories_own" on public.categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- transactions：每一筆帳 ----------
-- kind 的意義：
--   expense 花費      → 錢包扣款、計入預算
--   refund  退款      → 錢包加回、從花費中扣掉
--   topup   加值/換匯 → 錢只是從一個錢包搬到另一個（例：台幣現金 → 韓元現金、
--                       悠遊付加值），不計入花費統計，只影響餘額。
create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null default 'expense' check (kind in ('expense', 'refund', 'topup')),
  spent_at timestamptz not null default now(),
  title text not null default '',
  category text not null default '其他',

  -- 付款（或收款）錢包
  wallet_id bigint not null,

  -- 原始帳單幣別與金額（在韓國付韓元就填 KRW 與韓元原價）
  currency text not null check (currency in ('KRW', 'TWD')),
  amount numeric(14, 2) not null check (amount > 0),
  -- 當筆成交匯率：1 台幣 = ? 韓元
  krw_per_twd numeric(12, 6) not null check (krw_per_twd > 0),

  -- 兩種幣別的金額由資料庫換算，永遠一致
  amount_krw numeric(14, 2) generated always as (
    case when currency = 'KRW' then amount else round(amount * krw_per_twd, 2) end
  ) stored,
  amount_twd numeric(14, 2) generated always as (
    case when currency = 'TWD' then amount else round(amount / krw_per_twd, 2) end
  ) stored,

  -- 僅 topup 使用：這筆加值/換匯的錢從哪個錢包出（null = 從台灣戶頭直接匯入，不扣任何錢包）
  funded_wallet_id bigint,

  note text not null default '',
  created_at timestamptz not null default now(),

  -- 複合外鍵：錢包必須屬於同一個使用者
  constraint transactions_wallet_fk
    foreign key (wallet_id, user_id) references public.wallets (id, user_id) on delete restrict,
  constraint transactions_funded_wallet_fk
    foreign key (funded_wallet_id, user_id) references public.wallets (id, user_id) on delete restrict,
  -- 只有 topup 能指定出錢錢包，且不能自己轉給自己
  constraint transactions_funded_only_topup
    check (funded_wallet_id is null or (kind = 'topup' and funded_wallet_id <> wallet_id))
);

create index if not exists transactions_user_time_idx
  on public.transactions (user_id, spent_at desc);
create index if not exists transactions_wallet_idx on public.transactions (wallet_id);
create index if not exists transactions_funded_wallet_idx on public.transactions (funded_wallet_id);

alter table public.transactions enable row level security;

drop policy if exists "transactions_own" on public.transactions;
create policy "transactions_own" on public.transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- 統計 view：一律加 security_invoker，讓 RLS 跟著呼叫者走（不會看到別人的帳）
-- =====================================================================

-- ---------- 每筆交易對「花費」與「錢包」的帶號影響 ----------
-- expense：花費 +1、錢包 -1 ／ refund：花費 -1、錢包 +1 ／ topup：花費 0、錢包 +1
create or replace view public.v_transaction_effects
with (security_invoker = true) as
select
  t.*,
  case t.kind when 'expense' then 1 when 'refund' then -1 else 0 end as spend_sign,
  case t.kind when 'expense' then -1 else 1 end as wallet_sign
from public.transactions t;

-- ---------- 錢包餘額：期初 − 花費 ＋ 退款 ＋ 加值 − 幫別的錢包加值的成本 ----------
create or replace view public.v_wallet_balances
with (security_invoker = true) as
with moves as (
  -- 這個錢包自己的收支（換算成錢包的計價幣別）
  select
    e.wallet_id as wallet_id,
    sum(
      e.wallet_sign *
      case w.balance_currency when 'KRW' then e.amount_krw else e.amount_twd end
    ) as delta
  from public.v_transaction_effects e
  join public.wallets w on w.id = e.wallet_id
  group by e.wallet_id
  union all
  -- 當這個錢包是「出錢的那一方」（替韓元現金換匯、替悠遊付加值）
  select
    e.funded_wallet_id as wallet_id,
    sum(-1 * case w.balance_currency when 'KRW' then e.amount_krw else e.amount_twd end) as delta
  from public.v_transaction_effects e
  join public.wallets w on w.id = e.funded_wallet_id
  where e.funded_wallet_id is not null
  group by e.funded_wallet_id
)
select
  w.id as wallet_id,
  w.user_id,
  w.name,
  w.kind,
  w.balance_currency,
  w.opening_balance,
  w.default_krw_per_twd,
  w.sort_order,
  w.is_active,
  coalesce(sum(m.delta), 0) as net_change,
  w.opening_balance + coalesce(sum(m.delta), 0) as balance,
  -- 只看「花掉的」有多少（退款已扣除），用來顯示「這個錢包用掉多少」
  coalesce(
    (select sum(
       e2.spend_sign *
       case w.balance_currency when 'KRW' then e2.amount_krw else e2.amount_twd end)
     from public.v_transaction_effects e2
     where e2.wallet_id = w.id and e2.spend_sign <> 0),
    0
  ) as spent
from public.wallets w
left join moves m on m.wallet_id = w.id
group by w.id, w.user_id, w.name, w.kind, w.balance_currency,
         w.opening_balance, w.default_krw_per_twd, w.sort_order, w.is_active;

-- ---------- 預算總覽：花多少、剩多少（兩種幣別各算一次） ----------
create or replace view public.v_budget_summary
with (security_invoker = true) as
select
  s.user_id,
  s.title,
  s.start_date,
  s.end_date,
  s.krw_per_twd,
  s.budget_krw,
  s.budget_twd,
  coalesce(x.spent_krw, 0) as spent_krw,
  coalesce(x.spent_twd, 0) as spent_twd,
  s.budget_krw - coalesce(x.spent_krw, 0) as remaining_krw,
  s.budget_twd - coalesce(x.spent_twd, 0) as remaining_twd,
  coalesce(x.entry_count, 0) as entry_count,
  coalesce(x.spend_days, 0) as spend_days
from public.trip_settings s
left join (
  select
    user_id,
    sum(spend_sign * amount_krw) as spent_krw,
    sum(spend_sign * amount_twd) as spent_twd,
    count(*) as entry_count,
    count(distinct (spent_at at time zone 'Asia/Seoul')::date) as spend_days
  from public.v_transaction_effects
  where spend_sign <> 0
  group by user_id
) x on x.user_id = s.user_id;

-- ---------- 每日花費（用首爾時間切日） ----------
create or replace view public.v_daily_totals
with (security_invoker = true) as
select
  user_id,
  (spent_at at time zone 'Asia/Seoul')::date as day,
  sum(spend_sign * amount_krw) as krw,
  sum(spend_sign * amount_twd) as twd,
  count(*) as entry_count
from public.v_transaction_effects
where spend_sign <> 0
group by user_id, (spent_at at time zone 'Asia/Seoul')::date;

-- ---------- 分類花費 ----------
create or replace view public.v_category_totals
with (security_invoker = true) as
select
  user_id,
  category,
  sum(spend_sign * amount_krw) as krw,
  sum(spend_sign * amount_twd) as twd,
  count(*) as entry_count
from public.v_transaction_effects
where spend_sign <> 0
group by user_id, category;

-- =====================================================================
-- seed_defaults()：第一次登入時建立預設設定、錢包與分類。
-- 不用 security definer，維持 invoker 讓 RLS 把關（寫的都是自己的資料）。
-- =====================================================================
create or replace function public.seed_defaults()
returns void
language plpgsql
as $fn$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception '未登入';
  end if;

  insert into public.trip_settings (user_id) values (uid)
  on conflict (user_id) do nothing;

  if not exists (select 1 from public.wallets where user_id = uid) then
    insert into public.wallets (user_id, name, kind, balance_currency, opening_balance, sort_order)
    values
      (uid, '悠遊付',   'easywallet', 'TWD', 0, 1),
      (uid, '韓元現金', 'cash',       'KRW', 0, 2),
      (uid, '台幣現金', 'cash',       'TWD', 0, 3),
      (uid, '信用卡',   'card',       'TWD', 0, 4);
  end if;

  if not exists (select 1 from public.categories where user_id = uid) then
    insert into public.categories (user_id, name, emoji, sort_order)
    values
      (uid, '餐飲', 'food', 1),
      (uid, '交通', 'transit', 2),
      (uid, '購物', 'shopping', 3),
      (uid, '住宿', 'hotel', 4),
      (uid, '門票娛樂', 'ticket', 5),
      (uid, '通訊雜支', 'phone', 6),
      (uid, '其他', 'other', 7);
  end if;
end $fn$;

-- =====================================================================
-- 權限：Supabase 的 public schema 預設就會授權給 authenticated，
-- 這裡再明確寫一次，避免專案的 default privileges 被改過而踩雷。
-- （資料安全靠上面的 RLS，不是靠這裡的 grant。）
-- =====================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.trip_settings, public.wallets, public.categories, public.transactions
  to authenticated;
grant select
  on public.v_transaction_effects, public.v_wallet_balances, public.v_budget_summary,
     public.v_daily_totals, public.v_category_totals
  to authenticated;
grant execute on function public.seed_defaults() to authenticated;
