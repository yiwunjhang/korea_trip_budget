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
    check (kind in ('easywallet', 'cash', 'card', 'transit', 'prepaid', 'other')),
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

-- 舊版沒有 prepaid（Wowpass 這類儲值卡），重跑時把 kind 的檢查換成新版
alter table public.wallets drop constraint if exists wallets_kind_check;
alter table public.wallets add constraint wallets_kind_check
  check (kind in ('easywallet', 'cash', 'card', 'transit', 'prepaid', 'other'));

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

-- ---------- 固定分類 ----------
-- 旅伴之間要能比較「誰在什麼項目花多少」，所以分類全員固定，不開放自訂。
-- 清單要和前端 src/utils/categories.ts 的 FIXED_CATEGORIES 一致。
-- not valid：只檢查之後新增／修改的帳，舊資料不動（統計時不在清單內的會算到「其他」）。
create or replace function public.fixed_categories()
returns text[]
language sql
immutable
as $fn$
  select array['餐飲', '交通', '購物', '住宿', '門票娛樂', '通訊雜支', '其他']
$fn$;

do $do$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_category_fixed'
  ) then
    alter table public.transactions
      add constraint transactions_category_fixed
      check (category = any (array['餐飲', '交通', '購物', '住宿', '門票娛樂', '通訊雜支', '其他', '加值換匯']))
      not valid;
  end if;
end
$do$;

-- =====================================================================
-- 旅伴群組：各自用自己的帳號記帳（餘額、明細只有自己看得到），
-- 但群組成員可以看到彼此「每天 × 分類」的彙總金額。
--   trip_groups  群組（邀請碼）
--   trip_members 成員與顯示名稱
-- 加入／建立一律走 RPC（create_trip_group / join_trip_group），不開放直接 insert。
-- =====================================================================
create table if not exists public.trip_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null default '韓國旅行',
  invite_code text not null unique
    default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.trip_members (
  group_id uuid not null references public.trip_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  display_name text not null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists trip_members_user_idx on public.trip_members (user_id);

-- 是否為該群組成員。security definer 才不會在 trip_members 的 policy 裡自己查自己而無限遞迴。
create or replace function public.is_group_member(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.trip_members
    where group_id = p_group and user_id = auth.uid()
  )
$fn$;

alter table public.trip_groups enable row level security;
alter table public.trip_members enable row level security;

drop policy if exists "trip_groups_member_read" on public.trip_groups;
create policy "trip_groups_member_read" on public.trip_groups
  for select using (public.is_group_member(id));

drop policy if exists "trip_groups_member_update" on public.trip_groups;
create policy "trip_groups_member_update" on public.trip_groups
  for update using (public.is_group_member(id)) with check (public.is_group_member(id));

drop policy if exists "trip_groups_owner_delete" on public.trip_groups;
create policy "trip_groups_owner_delete" on public.trip_groups
  for delete using (created_by = auth.uid());

drop policy if exists "trip_members_member_read" on public.trip_members;
create policy "trip_members_member_read" on public.trip_members
  for select using (public.is_group_member(group_id));

-- 只能改自己的顯示名稱、只能自己退出
drop policy if exists "trip_members_self_update" on public.trip_members;
create policy "trip_members_self_update" on public.trip_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "trip_members_self_delete" on public.trip_members;
create policy "trip_members_self_delete" on public.trip_members
  for delete using (user_id = auth.uid());

-- 建立群組並把自己加進去，回傳群組 id
create or replace function public.create_trip_group(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_group uuid;
begin
  if v_uid is null then
    raise exception '未登入';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception '請輸入你的名字';
  end if;

  insert into public.trip_groups (name, created_by)
  values (coalesce(nullif(trim(p_name), ''), '韓國旅行'), v_uid)
  returning id into v_group;

  insert into public.trip_members (group_id, user_id, display_name)
  values (v_group, v_uid, trim(p_display_name));

  return v_group;
end
$fn$;

-- 用邀請碼加入群組（已在群組裡就只更新名字），回傳群組 id
create or replace function public.join_trip_group(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_group uuid;
begin
  if v_uid is null then
    raise exception '未登入';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception '請輸入你的名字';
  end if;

  select g.id into v_group
  from public.trip_groups g
  where g.invite_code = upper(trim(p_code));

  if v_group is null then
    raise exception '邀請碼不正確';
  end if;

  insert into public.trip_members (group_id, user_id, display_name)
  values (v_group, v_uid, trim(p_display_name))
  on conflict (group_id, user_id) do update set display_name = excluded.display_name;

  return v_group;
end
$fn$;

-- 群組花費彙總：每位成員 × 每天（首爾時間）× 分類。只回彙總數字，不回單筆明細。
-- 不是成員就回空集合。
create or replace function public.group_spending(p_group uuid)
returns table (
  member_id uuid,
  display_name text,
  day date,
  category text,
  krw numeric,
  twd numeric,
  entry_count bigint
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    m.user_id,
    m.display_name,
    (t.spent_at at time zone 'Asia/Seoul')::date,
    case when t.category = any (public.fixed_categories()) then t.category else '其他' end,
    sum(case t.kind when 'refund' then -t.amount_krw else t.amount_krw end),
    sum(case t.kind when 'refund' then -t.amount_twd else t.amount_twd end),
    count(*)
  from public.trip_members m
  join public.transactions t on t.user_id = m.user_id
  where m.group_id = p_group
    and public.is_group_member(p_group)
    and t.kind in ('expense', 'refund')
  group by 1, 2, 3, 4
$fn$;

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
      (uid, '悠遊付',   'easywallet', 'TWD', 0, 1),  -- 只算回饋額度，不算餘額
      (uid, '韓幣現金', 'cash',       'KRW', 0, 2),
      (uid, 'Wowpass',  'prepaid',    'KRW', 0, 3),  -- 用韓幣現金儲值
      (uid, '信用卡',   'card',       'TWD', 0, 4),  -- 只算已刷，不算餘額
      (uid, 'T-money',  'transit',    'KRW', 0, 5);  -- 只能用現金儲值
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
-- reset_default_wallets()：把錢包恢復成預設 5 種（悠遊付／韓幣現金／Wowpass／信用卡／T-money）。
--  - 預設錢包已存在（同名）就沿用，期初餘額與帳都保留，只把種類、幣別、排序改回預設並啟用
--  - 舊版的「韓元現金」視為「韓幣現金」，直接改名沿用
--  - 其他錢包：沒有帳就刪掉；有帳就停用（帳不會不見，只是記帳時不再出現）
-- invoker 權限，RLS 只讓它動自己的錢包。
-- =====================================================================
create or replace function public.reset_default_wallets()
returns void
language plpgsql
as $fn$
declare
  uid uuid := auth.uid();
  d record;
begin
  if uid is null then
    raise exception '未登入';
  end if;

  -- 舊名稱改成新名稱（新名稱還不存在時）
  update public.wallets w set name = '韓幣現金'
  where w.user_id = uid and w.name = '韓元現金'
    and not exists (select 1 from public.wallets x where x.user_id = uid and x.name = '韓幣現金');

  for d in
    select * from (values
      ('悠遊付',   'easywallet', 'KRW', 1),
      ('韓幣現金', 'cash',       'KRW', 2),
      ('Wowpass',  'prepaid',    'KRW', 3),
      ('信用卡',   'card',       'TWD', 4),
      ('T-money',  'transit',    'KRW', 5)
    ) as v(name, kind, currency, sort_order)
  loop
    -- 悠遊付是扣台幣
    if d.kind = 'easywallet' then d.currency := 'TWD'; end if;

    if exists (select 1 from public.wallets w where w.user_id = uid and w.name = d.name) then
      update public.wallets w
      set kind = d.kind, balance_currency = d.currency, sort_order = d.sort_order, is_active = true
      where w.user_id = uid and w.name = d.name;
    else
      insert into public.wallets (user_id, name, kind, balance_currency, opening_balance, sort_order)
      values (uid, d.name, d.kind, d.currency, 0, d.sort_order);
    end if;
  end loop;

  -- 不在預設清單的：有帳就停用，沒帳就刪
  update public.wallets w set is_active = false, sort_order = 90
  where w.user_id = uid
    and w.name not in ('悠遊付', '韓幣現金', 'Wowpass', '信用卡', 'T-money')
    and exists (
      select 1 from public.transactions t
      where t.wallet_id = w.id or t.funded_wallet_id = w.id
    );

  delete from public.wallets w
  where w.user_id = uid
    and w.name not in ('悠遊付', '韓幣現金', 'Wowpass', '信用卡', 'T-money')
    and not exists (
      select 1 from public.transactions t
      where t.wallet_id = w.id or t.funded_wallet_id = w.id
    );
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
revoke execute on function public.reset_default_wallets() from public, anon;
grant execute on function public.reset_default_wallets() to authenticated;

-- 旅伴群組：表格只開讀、改名、退出（新增走 RPC）
grant select, update, delete on public.trip_groups, public.trip_members to authenticated;

-- 函式預設 PUBLIC 可執行，先收回再只開給登入者（未登入的 anon 不能呼叫）
revoke execute on function
  public.create_trip_group(text, text),
  public.join_trip_group(text, text),
  public.group_spending(uuid),
  public.is_group_member(uuid)
  from public, anon;
grant execute on function
  public.create_trip_group(text, text),
  public.join_trip_group(text, text),
  public.group_spending(uuid),
  public.is_group_member(uuid),
  public.fixed_categories()
  to authenticated;
