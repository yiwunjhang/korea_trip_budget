# 韓國旅行記帳 🇰🇷

韓元／台幣雙幣別的旅行記帳系統。每筆花費都從**預算**和**錢包餘額**裡扣，
隨時看得到「還剩多少韓元、還剩多少台幣、悠遊付還剩多少」。

技術組成與 `quiz_game` 相同：**Vue 3 + TypeScript + Tailwind 4 + Pinia + vue-router(hash) + Supabase**。

## 快速開始

```bash
npm install
cp .env.example .env.local   # 填入 Supabase URL 與 anon key
npm run dev
```

1. 到 [supabase.com](https://supabase.com) 開一個專案。
2. 專案 → **SQL Editor** → 貼上 `supabase/schema.sql` 整份執行（可重複執行）。
3. 專案 → **Settings → API** 複製 URL 與 anon key，填進 `.env.local`。
4. `npm run dev`，用 Email + 密碼註冊一個帳號（只有你自己看得到自己的帳，靠 RLS 隔離）。
   - 開發時想省掉收驗證信：Supabase → Authentication → Providers → Email → 關掉 *Confirm email*。
5. 第一次登入會自動建立預設錢包（悠遊付／韓元現金／台幣現金／信用卡）與分類。

## 資料庫設計

| 物件 | 用途 |
| --- | --- |
| `trip_settings` | 這趟旅行的名稱、日期、韓元預算、台幣預算、預設匯率（一人一列） |
| `wallets` | 付款方式／錢包。`balance_currency` 決定餘額用韓元還是台幣計算，`opening_balance` 是出發前的餘額，`default_krw_per_twd` 可設錢包專屬匯率 |
| `categories` | 消費分類（可自訂，給選單用） |
| `transactions` | 每一筆帳。存**原始幣別 + 原始金額 + 當筆匯率**，`amount_krw` / `amount_twd` 由資料庫 generated column 自動換算 |
| `v_wallet_balances` | 錢包即時餘額＝期初 − 花費 ＋ 退款 ＋ 加值 − 幫別的錢包加值的成本 |
| `v_budget_summary` | 預算扣完剩多少（韓元、台幣各一組） |
| `v_daily_totals` / `v_category_totals` | 每日、每分類花費（以首爾時間切日） |
| `seed_defaults()` | 新帳號第一次登入時建立預設設定、錢包、分類 |

設計上的三個重點：

- **換算交給資料庫**：`amount_krw` / `amount_twd` 是 generated column，前端不可能寫入不一致的金額。
- **餘額不存快取**：所有餘額與預算剩額都由 view 即時算出，刪一筆帳餘額自動跟著回來，不會對不起來。
- **RLS 全開**：每張表都 `enable row level security`，policy 一律 `user_id = auth.uid()`，
  `user_id` 由 `default auth.uid()` 自動帶入；view 全部加 `security_invoker = true`，所以 view 也吃 RLS。

### 三種帳目（`transactions.kind`）

| kind | 意義 | 對花費統計 | 對錢包餘額 |
| --- | --- | --- | --- |
| `expense` | 花費 | ＋ | − |
| `refund` | 退款 | − | ＋ |
| `topup` | 加值／換匯（錢從一個錢包搬到另一個，例如台幣現金換韓元現金、悠遊付加值） | 不計入 | 收款錢包 ＋，`funded_wallet_id` 錢包 − |

### 匯率怎麼存

匯率一律用 `krw_per_twd`＝**1 台幣換多少韓元**（例：43）。
每筆帳都存下當時用的匯率，所以之後改預設匯率不會回頭改舊帳。
悠遊付／刷卡的實際扣款匯率常和現金換匯不同，可在「錢包」頁給該錢包設專屬匯率，記帳時自動帶入。

## 畫面

- **總覽**：韓元／台幣預算剩多少、今天花多少、各錢包餘額、記一筆、最近紀錄。
- **明細**：分類統計 + 可依錢包／分類篩選的完整清單。
- **錢包**：餘額、期初金額、專屬匯率、停用／刪除、新增錢包。
- **設定**：旅行名稱與日期、預算、預設匯率、分類管理、登出。

## 部署（GitHub Pages）

`.github/workflows/deploy.yml` 會在推上 `main` 時自動建置部署。
記得在 repo 的 **Settings → Secrets and variables → Actions → Variables** 設定
`VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY`，並把 Pages 來源設成 GitHub Actions。
