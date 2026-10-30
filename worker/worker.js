/**
 * Pit Garage 小後台（Cloudflare Worker）
 * 網頁送出任務 → 這裡檢查通關密碼 → 交給 Claude → 把回答傳回網頁
 *
 * 需要在 Cloudflare 設定兩個「密鑰」（Settings → Variables and Secrets）：
 *   ANTHROPIC_API_KEY  你的 Claude API 金鑰
 *   PASSCODE           自己設的通關密碼（網頁第一次送出任務時會問你）
 *   FINMIND_TOKEN      （選填）FinMind 台股資料金鑰，有放就能查完整台股資料
 *   GITHUB_TOKEN       準時鬧鐘用：GitHub 細粒度權杖（Actions 讀寫，只限 stock-agent）
 *   CF_API_TOKEN、CF_ACCOUNT_ID  （選填）網頁顯示 Cloudflare 用量用
 *
 * 通訊紀錄存在 Cloudflare 的 Durable Object（內建 SQLite 資料庫，免費方案可用），
 * 部署時會自動建立，不需要另外設定。
 */
import { DurableObject } from "cloudflare:workers";

/* ---------- 通訊紀錄資料庫（電腦、手機共用同一份） ---------- */
const CHAT_KEEP = 500; // 最多保留幾筆
export class ChatStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT, who TEXT, msg TEXT, cls TEXT)"
    );
    this.sql.exec("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)");
  }
  /* 私人資料（例如持股股數、成本），用 key 存一份 JSON */
  getValue(key) {
    const row = this.sql.exec("SELECT value FROM kv WHERE key = ?", key).toArray()[0];
    return row ? JSON.parse(row.value) : null;
  }
  setValue(key, value) {
    this.sql.exec("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key, JSON.stringify(value));
    return { ok: true };
  }
  append(items) {
    const now = taipeiStamp();
    let last = 0;
    for (const it of items) {
      const t = /^\d\d\/\d\d \d\d:\d\d$/.test(it.t || "") ? it.t : now;
      last = this.sql
        .exec("INSERT INTO chat (t, who, msg, cls) VALUES (?, ?, ?, ?) RETURNING id", t, it.who, it.msg, it.cls || "")
        .one().id;
    }
    this.sql.exec("DELETE FROM chat WHERE id <= ?", last - CHAT_KEEP);
    return { last, t: now };
  }
  history(after = 0, limit = 100) {
    return this.sql
      .exec("SELECT id, t, who, msg, cls FROM chat WHERE id > ? ORDER BY id DESC LIMIT ?", after, limit)
      .toArray()
      .reverse();
  }
  clear() {
    this.sql.exec("DELETE FROM chat");
    return { ok: true };
  }
}

function taipeiStamp() {
  const f = (o) => new Date().toLocaleString("zh-TW", { ...o, hour12: false, timeZone: "Asia/Taipei" });
  return f({ month: "2-digit", day: "2-digit" }) + " " + f({ hour: "2-digit", minute: "2-digit" });
}
const chatStore = (env) => env.CHAT.get(env.CHAT.idFromName("main"));

const ALLOWED_ORIGINS = ["https://j1577957-lab.github.io"]; // 只有你的網站可以呼叫
const SITE_DATA = "https://j1577957-lab.github.io/stock-agent/data/";
const MODEL = "claude-sonnet-5-5";

const CREW = {
  eng:   { name: "賽車工程師", job: "總指揮。一般問題你自己回答；也可以幫忙規劃、解釋、整理想法。" },
  stock: { name: "策略技師",   job: "台股與美股分析。台股請優先用 finmind 工具查真實數據（股價、三大法人、融資融券、本益比、月營收、財報、股利、新聞），不知道代號先用 find_stock 查；美股可用 finmind 的 USStockPrice 或上網搜尋。並參考系統提供的自選股掃描資料。回答要有具體數字，給出技術面、籌碼面、基本面重點，不保證漲跌，結尾提醒不構成投資建議。", web: true, stockData: true, finmind: true },
  crawl: { name: "爬蟲技師",   job: "上網搜尋、查新聞、整理網站資訊。回答時附上來源網站名稱。", web: true },
  cal:   { name: "行程技師",   job: "行程管理。注意：你目前還沒有被授權讀取使用者的 Google 行事曆，請誠實說明，並建議使用者到 Claude App 直接詢問（那邊已經連上行事曆），或給一般的時間安排建議。" },
  mail:  { name: "信件技師",   job: "信件管理。注意：你目前還沒有被授權讀取使用者的 Gmail，請誠實說明，並建議使用者到 Claude App 直接詢問（那邊已經連上 Gmail），或幫忙草擬信件內容。" },
  shop:  { name: "電商技師",   job: "蝦皮電商。目前還沒接上蝦皮，請說明這個崗位尚未上線。" },
};

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin) || origin?.startsWith("http://localhost");
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) },
  });
}

async function stockContext() {
  try {
    const [latest, signals] = await Promise.all(
      ["latest.json", "signals.json"].map((f) =>
        fetch(SITE_DATA + f, { cf: { cacheTtl: 60 } }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      )
    );
    const slim = {};
    for (const m of ["tw", "us"]) {
      if (!latest?.[m]) continue;
      slim[m] = {
        time: latest[m].time,
        stocks: latest[m].stocks.map((s) => ({
          name: s.name, symbol: s.symbol, price: s.price, change_pct: s.change_pct,
          ma20: s.ma20, rsi: s.rsi, vol_ratio: s.vol_ratio, score: s.score,
          reasons: s.reasons, blockers: s.blockers,
        })),
      };
    }
    const recent = (signals || []).slice(0, 5).map((s) => ({
      time: s.time, name: s.name, price: s.price, verdict: s.judge?.verdict, summary: s.judge?.summary,
    }));
    return `\n\n【系統自選股最新掃描】${JSON.stringify(slim)}\n【判斷 agent 最近結論】${JSON.stringify(recent)}`;
  } catch {
    return "";
  }
}

/* ---------- FinMind 工具 ---------- */
const FM_API = "https://api.finmindtrade.com/api/v4/data";
const FM_DATASETS = {
  TaiwanStockPrice: "台股日K（開高低收、成交量）",
  TaiwanStockPER: "本益比、股價淨值比、殖利率",
  TaiwanStockInstitutionalInvestorsBuySell: "三大法人買賣超（股數）",
  TaiwanStockMarginPurchaseShortSale: "融資融券",
  TaiwanStockShareholding: "外資持股比例",
  TaiwanStockMonthRevenue: "月營收",
  TaiwanStockFinancialStatements: "綜合損益表（EPS 等）",
  TaiwanStockBalanceSheet: "資產負債表",
  TaiwanStockCashFlowsStatement: "現金流量表",
  TaiwanStockDividend: "股利政策",
  TaiwanStockNews: "個股新聞",
  TaiwanStockTotalInstitutionalInvestors: "整體市場三大法人買賣超（不需 data_id）",
  USStockPrice: "美股日K（data_id 用代號，例如 NVDA）",
};
const FM_TOOLS = [
  {
    name: "finmind",
    description: "查詢 FinMind 金融資料庫。可用資料集：" +
      Object.entries(FM_DATASETS).map(([k, v]) => `${k}=${v}`).join("；") +
      "。台股 data_id 用 4~6 碼代號（例如 2330、00685L）。回傳最近的資料列（JSON）。",
    input_schema: {
      type: "object",
      properties: {
        dataset: { type: "string", enum: Object.keys(FM_DATASETS) },
        data_id: { type: "string", description: "股票代號，例如 2330" },
        start_date: { type: "string", description: "YYYY-MM-DD，預設 30 天前；財報、營收建議抓 1~2 年" },
        end_date: { type: "string", description: "YYYY-MM-DD，可省略" },
      },
      required: ["dataset"],
    },
  },
  {
    name: "find_stock",
    description: "用中文名稱或部分代號找台股代號，例如「台積電」「京元」。",
    input_schema: { type: "object", properties: { keyword: { type: "string" } }, required: ["keyword"] },
  },
];

async function fmGet(env, params) {
  const url = new URL(FM_API);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  if (env.FINMIND_TOKEN) url.searchParams.set("token", env.FINMIND_TOKEN);
  const r = await fetch(url, {
    headers: env.FINMIND_TOKEN ? { Authorization: "Bearer " + env.FINMIND_TOKEN } : {},
    cf: { cacheTtl: params.dataset === "TaiwanStockInfo" ? 86400 : 300 },
  });
  const d = await r.json().catch(() => ({}));
  if (d.status !== 200) throw new Error(d.msg || "FinMind 錯誤 " + r.status);
  return d.data || [];
}

async function runTool(env, name, input) {
  try {
    if (name === "find_stock") {
      const kw = String(input.keyword || "").trim();
      const all = await fmGet(env, { dataset: "TaiwanStockInfo" });
      const hits = all.filter((s) => s.stock_name?.includes(kw) || s.stock_id?.startsWith(kw));
      const seen = new Set();
      const uniq = hits.filter((s) => !seen.has(s.stock_id) && seen.add(s.stock_id)).slice(0, 10);
      return JSON.stringify(uniq.map((s) => ({ id: s.stock_id, name: s.stock_name, type: s.type, industry: s.industry_category })));
    }
    if (name === "finmind") {
      const start = input.start_date || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const rows = await fmGet(env, { dataset: input.dataset, data_id: input.data_id, start_date: start, end_date: input.end_date });
      const keep = input.dataset === "TaiwanStockInstitutionalInvestorsBuySell" ? 50 : 30;
      const text = JSON.stringify(rows.slice(-keep));
      return (rows.length > keep ? `（共 ${rows.length} 筆，只列最近 ${keep} 筆）` : "") + text.slice(0, 12000);
    }
    return "未知工具";
  } catch (e) {
    return "查詢失敗：" + e.message;
  }
}

async function askClaude(env, member, task) {
  let system =
    `你是「Pit Garage 指揮站」裡的${member.name}，替使用者（台灣人、程式新手）工作。${member.job}\n` +
    `回答規則：繁體中文、口語、精簡，200 字以內；不要用 Markdown 標題或表格，可以用「・」分點；` +
    `台灣時間現在是 ${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}。`;
  if (member.stockData) system += await stockContext();
  if (member.stockData && env.CHAT) {
    try {
      const h = await chatStore(env).getValue("holdings");
      if (h && Object.keys(h).length)
        system += `\n【使用者目前持股（股數、平均成本）】${JSON.stringify(h)}。問到持股時，用最新價格算損益並給建議。`;
    } catch {}
  }

  const messages = [{ role: "user", content: task }];
  const body = { model: MODEL, max_tokens: 1500, system, messages };
  const tools = [];
  if (member.finmind) tools.push(...FM_TOOLS);
  if (member.web) tools.push({ type: "web_search_20250305", name: "web_search", max_uses: 3 });
  if (tools.length) body.tools = tools;

  const call = (b) =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(b),
    });

  // 工具迴圈：Claude 要查資料 → 後台去查 → 結果交回 Claude，最多 6 輪
  for (let round = 0; round < 6; round++) {
    let r = await call(body);
    if (!r.ok && body.tools?.some((t) => t.type)) {   // 上網工具出問題時，拿掉上網再試一次
      body.tools = body.tools.filter((t) => !t.type);
      if (!body.tools.length) delete body.tools;
      r = await call(body);
    }
    if (!r.ok) throw new Error(`Claude API ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (data.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: data.content });
      const results = [];
      for (const b of data.content.filter((b) => b.type === "tool_use")) {
        results.push({ type: "tool_result", tool_use_id: b.id, content: await runTool(env, b.name, b.input) });
      }
      messages.push({ role: "user", content: results });
      continue;
    }
    if (data.stop_reason === "pause_turn") {            // 上網搜尋還沒做完，讓它繼續
      messages.push({ role: "assistant", content: data.content });
      continue;
    }
    return text;
  }
  return "查詢步驟太多，先停在這裡。可以把問題問得更具體一點再試一次。";
}

/* ---------- Cloudflare 用量（給網頁「用量與費用」小格） ----------
   需要 Secret：CF_API_TOKEN（權限 Account Analytics: Read）、CF_ACCOUNT_ID
   免費方案：Workers 每天 10 萬次請求（UTC 00:00＝台灣 08:00 歸零），Durable Objects 每天 10 萬次請求，費用 0 元 */
const FREE_DAILY = { workers: 100000, durable: 100000 };
async function cfGraphQL(env, query, variables) {
  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.CF_API_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const d = await r.json();
  if (d.errors?.length) throw new Error(d.errors[0].message);
  return d.data?.viewer?.accounts?.[0] || {};
}
const sumOf = (rows, key) => (rows || []).reduce((t, r) => t + (r.sum?.[key] || 0), 0);
async function cloudflareUsage(env) {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return { configured: false };
  const store = env.CHAT ? chatStore(env) : null;
  const cached = store && (await store.getValue("usage_cache"));
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.data;   // 5 分鐘內用快取

  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const q = `query($acct:String!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$acct}){
    w:workersInvocationsAdaptive(limit:1000,filter:{datetime_geq:$s,datetime_leq:$e}){sum{requests errors subrequests}}
    d:durableObjectsInvocationsAdaptiveGroups(limit:1000,filter:{datetime_geq:$s,datetime_leq:$e}){sum{requests}}}}}`;
  const run = (s) => cfGraphQL(env, q, { acct: env.CF_ACCOUNT_ID, s: s.toISOString(), e: now.toISOString() });
  const [today, mtd] = await Promise.all([run(day), run(month)]);
  const data = {
    configured: true,
    updated: taipeiStamp(),
    plan: "免費方案",
    cost_usd: 0,
    today: {
      workers: sumOf(today.w, "requests"), errors: sumOf(today.w, "errors"),
      subrequests: sumOf(today.w, "subrequests"), durable: sumOf(today.d, "requests"),
    },
    month: { workers: sumOf(mtd.w, "requests"), durable: sumOf(mtd.d, "requests") },
    limits: FREE_DAILY,
  };
  // 如果改用付費方案（每月 US$5，含 1000 萬次請求），超出部分每 100 萬次 US$0.30 —— 給使用者參考
  data.paid_estimate_usd = 5 + Math.max(0, data.month.workers - 10_000_000) / 1e6 * 0.3;
  if (store) await store.setValue("usage_cache", { at: Date.now(), data });
  return data;
}

/* ---------- 準時鬧鐘：GitHub 的排程常常延遲或跳過，改由 Cloudflare 準時叫醒 ----------
   需要 Secret：GITHUB_TOKEN（GitHub 細粒度權杖，只給 stock-agent 專案的 Actions 讀寫權限） */
const GH_REPO = "j1577957-lab/stock-agent";
async function dispatchWorkflow(env, file) {
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/${file}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "User-Agent": "pit-garage-worker",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!r.ok) console.log(`啟動 ${file} 失敗：${r.status} ${await r.text()}`);
  return r.ok;
}

export default {
  async scheduled(event, env, ctx) {
    if (!env.GITHUB_TOKEN) return console.log("尚未設定 GITHUB_TOKEN，略過");
    // 爬蟲技師：每小時第 7 分；策略技師：交易相關時段每 15 分（時間判斷交給 GitHub 那邊的程式）
    const file = event.cron === "7 * * * *" ? "news-crawler.yml" : "stock-agent.yml";
    ctx.waitUntil(dispatchWorkflow(env, file));
  },

  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
    if (request.method !== "POST") return json({ ok: true, msg: "Pit Garage 後台運作中" }, 200, origin);
    if (!ALLOWED_ORIGINS.includes(origin) && !origin.startsWith("http://localhost"))
      return json({ error: "不允許的來源" }, 403, origin);

    let input;
    try { input = await request.json(); } catch { return json({ error: "格式錯誤" }, 400, origin); }
    const { task, crew = "eng", passcode, action = "task" } = input || {};

    if (!env.PASSCODE || passcode !== env.PASSCODE) return json({ error: "通關密碼錯誤" }, 401, origin);

    // Cloudflare 用量（不含私人資料，但一樣要通關密碼，避免被亂刷）
    if (action === "usage") {
      try { return json(await cloudflareUsage(env), 200, origin); }
      catch (e) { return json({ error: "讀取用量失敗：" + e.message }, 500, origin); }
    }

    // 持股股數與成本（私人資料）
    if (action === "holdings_get" || action === "holdings_set") {
      if (!env.CHAT) return json({ error: "資料庫尚未啟用" }, 501, origin);
      const store = chatStore(env);
      if (action === "holdings_get") return json({ items: (await store.getValue("holdings")) || {} }, 200, origin);
      const items = {};
      for (const [sym, v] of Object.entries(input.items || {})) {
        const shares = Number(v?.shares), avg = Number(v?.avg);
        if (!/^[0-9A-Z.]{1,15}$/.test(sym) || !(shares >= 0) || !(avg >= 0)) continue;
        if (shares > 0) items[sym] = { shares, avg, updated: taipeiStamp() };
      }
      await store.setValue("holdings", items);
      return json({ ok: true, items }, 200, origin);
    }

    // 通訊紀錄：讀取 / 新增 / 清空
    if (action === "history" || action === "append" || action === "clear") {
      if (!env.CHAT) return json({ error: "通訊紀錄資料庫尚未啟用" }, 501, origin);
      try {
        const store = chatStore(env);
        if (action === "history") return json({ items: await store.history(Number(input.after) || 0) }, 200, origin);
        if (action === "clear") return json(await store.clear(), 200, origin);
        const items = (Array.isArray(input.items) ? input.items : []).slice(0, 20)
          .filter((x) => x && typeof x.who === "string" && typeof x.msg === "string")
          .map((x) => ({ who: x.who.slice(0, 40), msg: x.msg.slice(0, 6000), cls: x.cls === "done" ? "done" : "", t: String(x.t || "") }));
        if (!items.length) return json({ error: "沒有內容" }, 400, origin);
        return json(await store.append(items), 200, origin);
      } catch (e) {
        return json({ error: "通訊紀錄存取失敗：" + e.message }, 500, origin);
      }
    }

    if (!task || typeof task !== "string" || task.length > 2000)
      return json({ error: "任務內容是空的或太長" }, 400, origin);

    const member = CREW[crew] || CREW.eng;
    try {
      const reply = await askClaude(env, member, task);
      return json({ who: member.name, reply: reply || "（沒有回覆內容）" }, 200, origin);
    } catch (e) {
      return json({ error: "後台呼叫 Claude 失敗：" + e.message }, 502, origin);
    }
  },
};
