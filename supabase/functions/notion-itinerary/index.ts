// =====================================================================
// notion-itinerary：讀「公開發佈」的 Notion 行程資料庫，整理成每天一站一站的 JSON。
//
// 為什麼要這一層：Notion 不允許網頁直接跨網域讀它的資料，所以由這個
// Supabase Edge Function 代讀，再回給 app。用的是 notion.site 公開頁面
// 本身在用的讀取方式（不是官方 API），不需要任何 Notion 金鑰。
//
// 呼叫：POST { url: "https://xxx.notion.site/<資料庫頁面id>?v=<view id>" }
// 只接受 *.notion.site 的網址，且要登入的使用者才能呼叫（Supabase 預設驗 JWT）。
//
// 預期的 Notion 結構（照目前的行程）：
//   資料庫每一列是一天：標題像「明洞｜Day2（日）」、有一個日期欄位
//   每天的頁面裡，引用區塊（> 1️⃣ 換匯）是一站，後面跟著的文字、callout
//   （NAVER 地圖連結、地址、營業時間）都算這一站的說明
// =====================================================================

export interface ItineraryLink {
  label: string
  url: string
}

export interface ItineraryStop {
  title: string
  /** 1️⃣ 這類編號；「住宿」「交通」這種小標就是 null */
  num: number | null
  lines: string[]
  mapUrl: string | null
  links: ItineraryLink[]
}

export interface ItineraryDay {
  id: string
  /** 原始標題，例如「明洞｜Day2（日）」 */
  title: string
  /** 地點，例如「明洞」 */
  place: string
  dayNo: number | null
  /** yyyy-mm-dd */
  date: string | null
  notes: string[]
  noteLinks: ItineraryLink[]
  stops: ItineraryStop[]
  notionUrl: string
}

export interface Itinerary {
  days: ItineraryDay[]
  fetchedAt: string
}

// deno-lint-ignore no-explicit-any
type Any = any

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Notion 的紀錄有時包兩層 value */
const unwrap = (x: Any) => x?.value?.value ?? x?.value

function dashed(id: string): string {
  const h = id.replace(/-/g, '')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** 解析公開網址：只接受 https://*.notion.site/... */
export function parseNotionUrl(raw: string): { origin: string; pageId: string; viewId: string | null } {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error('Notion 連結格式不正確')
  }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.notion.site')) {
    throw new Error('請貼 Notion「發佈到網路」後的 notion.site 連結')
  }
  const match = url.pathname.match(/([0-9a-f]{32})(?:$|[^0-9a-f])/i) ?? url.pathname.match(/([0-9a-f]{32})/i)
  if (!match) throw new Error('連結裡找不到 Notion 頁面 id')
  const v = url.searchParams.get('v')
  return {
    origin: url.origin,
    pageId: dashed(match[1]),
    viewId: v && /^[0-9a-f]{32}$/i.test(v.replace(/-/g, '')) ? dashed(v) : null,
  }
}

function api(origin: string) {
  return async (path: string, body: unknown) => {
    const res = await fetch(`${origin}/api/v3/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Notion 回應 ${res.status}（頁面是否還有公開發佈？）`)
    return res.json()
  }
}

/** 讀一整頁的區塊（最多 5 段） */
async function loadPage(post: ReturnType<typeof api>, pageId: string) {
  const blocks: Record<string, Any> = {}
  const collections: Record<string, Any> = {}
  let cursor: Any = { stack: [] }
  for (let chunk = 0; chunk < 5; chunk++) {
    const data = await post('loadPageChunk', { pageId, limit: 300, cursor, chunkNumber: chunk, verticalColumns: false })
    Object.assign(blocks, data.recordMap?.block ?? {})
    Object.assign(collections, data.recordMap?.collection ?? {})
    cursor = data.cursor
    if (!cursor?.stack?.length) break
  }
  return { blocks, collections }
}

/** Notion rich text → 純文字 + 連結（日期、頁面提及的「‣」拿掉） */
function richText(value: Any): { text: string; links: string[] } {
  if (!Array.isArray(value)) return { text: '', links: [] }
  let text = ''
  const links: string[] = []
  for (const seg of value) {
    const [s, anns] = seg as [string, Any[] | undefined]
    if (s !== '‣') text += s
    for (const a of anns ?? []) if (a?.[0] === 'a' && typeof a[1] === 'string') links.push(a[1])
  }
  return { text, links }
}

const URL_RE = /https?:\/\/[^\s)）」]+/g

function linkLabel(url: string): string {
  if (/naver\.me|map\.naver/.test(url)) return 'NAVER 地圖'
  if (/google\.[^/]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/.test(url)) return 'Google 地圖'
  if (/catchtable/.test(url)) return 'CATCHTABLE'
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return '連結'
  }
}

const isMapUrl = (url: string) => /naver\.me|map\.naver|google\.[^/]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/.test(url)

/** 把一段文字拆成行：去掉「[NAVER 地图]」這種標記，網址抽成連結 */
function splitLines(text: string, links: string[]) {
  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    let line = rawLine.trim()
    if (!line || /^\[NAVER\s*地[图圖]\]$/.test(line)) continue
    line = line.replace(/^\[NAVER\s*地[图圖]\]\s*/, '')
    for (const url of line.match(URL_RE) ?? []) links.push(url)
    line = line.replace(URL_RE, '').trim()
    if (line) lines.push(line)
  }
  return lines
}

/** 去掉開頭的 1️⃣ / 🔟 編號，回傳編號與標題 */
function stopTitle(text: string): { num: number | null; title: string } {
  const t = text.trim()
  const keycap = t.match(/^(\d)️?⃣\s*/)
  if (keycap) return { num: Number(keycap[1]), title: t.slice(keycap[0].length).trim() }
  if (t.startsWith('🔟')) return { num: 10, title: t.slice(2).trim() }
  return { num: null, title: t }
}

const STOP_TYPES = new Set(['quote', 'header', 'sub_header', 'sub_sub_header'])
const TEXT_TYPES = new Set(['text', 'callout', 'bulleted_list', 'numbered_list', 'to_do', 'toggle'])
const CONTAINER_TYPES = new Set(['column_list', 'column', 'callout', 'toggle', 'bulleted_list', 'numbered_list'])

/** 一天的頁面 → 一站一站 */
export function parseDayPage(rootId: string, blocks: Record<string, Any>) {
  const stops: ItineraryStop[] = []
  const notes = { lines: [] as string[], links: [] as string[] }
  let current: ItineraryStop | null = null

  const addTo = (lines: string[], links: string[]) => {
    if (current) {
      current.lines.push(...lines)
      for (const url of links) {
        if (!current.mapUrl && isMapUrl(url)) current.mapUrl = url
        else if (!current.links.some((l) => l.url === url) && url !== current.mapUrl) {
          current.links.push({ label: linkLabel(url), url })
        }
      }
    } else {
      notes.lines.push(...lines)
      notes.links.push(...links)
    }
  }

  const visit = (id: string, depth: number) => {
    const b = unwrap(blocks[id])
    if (!b || b.alive === false || depth > 6) return
    const type = b.type as string

    if (STOP_TYPES.has(type)) {
      const { text, links } = richText(b.properties?.title)
      const lines: string[] = []
      const [first, ...rest] = text.split('\n')
      const { num, title } = stopTitle(first ?? '')
      for (const url of title.match(URL_RE) ?? []) links.push(url)
      current = { title: title.replace(URL_RE, '').trim() || '（未命名）', num, lines, mapUrl: null, links: [] }
      stops.push(current)
      addTo(splitLines(rest.join('\n'), links), links)
    } else if (type === 'table') {
      const order: string[] = b.format?.table_block_column_order ?? []
      const header = Boolean(b.format?.table_block_column_header)
      const rows = (b.content ?? []).map((rid: string) => {
        const row = unwrap(blocks[rid])
        return order.map((col) => richText(row?.properties?.[col]).text.trim()).filter(Boolean)
      })
      const head = header ? rows.shift() : null
      const lines = rows.map((cells: string[]) =>
        head ? cells.map((c, i) => (head[i] ? `${head[i]}：${c}` : c)).join('　') : cells.join('　'),
      )
      addTo(lines, [])
      return
    } else if (type === 'bookmark') {
      const link = richText(b.properties?.link).text
      if (link) addTo([], [link])
    } else if (TEXT_TYPES.has(type)) {
      const { text, links } = richText(b.properties?.title)
      addTo(splitLines(text, links), links)
    }

    if (CONTAINER_TYPES.has(type) || id === rootId) {
      for (const child of b.content ?? []) visit(child, depth + 1)
    }
  }

  visit(rootId, 0)

  for (const stop of stops) stop.lines = [...new Set(stop.lines)]
  const noteLinks = [...new Set(notes.links)].map((url) => ({ label: linkLabel(url), url }))
  return { stops, notes: [...new Set(notes.lines)], noteLinks }
}

/** 「明洞｜Day2（日）」→ 地點「明洞」、Day 2 */
function parseDayTitle(title: string) {
  const dayMatch = title.match(/Day\s*(\d+)/i)
  const place = title
    .split(/[｜|]/)
    .map((s) => s.trim())
    .find((s) => s && !/Day\s*\d+/i.test(s))
  return { dayNo: dayMatch ? Number(dayMatch[1]) : null, place: place ?? title.trim() }
}

export async function buildItinerary(rawUrl: string): Promise<Itinerary> {
  const { origin, pageId, viewId } = parseNotionUrl(rawUrl)
  const post = api(origin)

  const root = await loadPage(post, pageId)
  const rootBlock = unwrap(root.blocks[pageId])
  const collectionId: string | undefined = rootBlock?.collection_id
  const spaceId: string | undefined = rootBlock?.space_id
  const view = viewId ?? rootBlock?.view_ids?.[0]
  if (!collectionId || !spaceId || !view) {
    throw new Error('這個連結不是 Notion 資料庫（請貼行程資料庫的公開連結）')
  }

  const result = await post('queryCollection', {
    source: { type: 'collection', id: collectionId, spaceId },
    collectionView: { id: view, spaceId },
    loader: {
      type: 'reducer',
      reducers: { collection_group_results: { type: 'results', limit: 100 } },
      searchQuery: '',
      userTimeZone: 'Asia/Taipei',
    },
  })

  const rowIds: string[] = result.result?.reducerResults?.collection_group_results?.blockIds ?? []
  const rowBlocks: Record<string, Any> = result.recordMap?.block ?? {}
  const schema: Record<string, Any> =
    unwrap(result.recordMap?.collection?.[collectionId])?.schema ??
    unwrap(root.collections[collectionId])?.schema ??
    {}
  const dateProp = Object.entries(schema).find(([, p]) => p?.type === 'date')?.[0]

  const days = await Promise.all(
    rowIds.map(async (id): Promise<ItineraryDay> => {
      const props = unwrap(rowBlocks[id])?.properties ?? {}
      const title = richText(props.title).text.trim()
      const dateValue = dateProp ? props[dateProp]?.[0]?.[1]?.find((a: Any) => a?.[0] === 'd')?.[1] : null
      const page = await loadPage(post, id)
      const parsed = parseDayPage(id, page.blocks)
      return {
        id,
        title,
        ...parseDayTitle(title),
        date: dateValue?.start_date ?? null,
        ...parsed,
        notionUrl: `${origin}/${id.replace(/-/g, '')}`,
      }
    }),
  )

  days.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.dayNo ?? 99) - (b.dayNo ?? 99))
  return { days, fetchedAt: new Date().toISOString() }
}

// ---------- Edge Function 進入點（本機 node 測試時不會執行） ----------
// deno-lint-ignore no-explicit-any
const DenoRef = (globalThis as any).Deno
if (DenoRef?.serve) {
  DenoRef.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    try {
      const { url } = await req.json()
      if (typeof url !== 'string' || !url) throw new Error('缺少 Notion 連結')
      const data = await buildItinerary(url)
      return new Response(JSON.stringify(data), {
        headers: { ...cors, 'content-type': 'application/json; charset=utf-8' },
      })
    } catch (e) {
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
        status: 400,
        headers: { ...cors, 'content-type': 'application/json; charset=utf-8' },
      })
    }
  })
}
