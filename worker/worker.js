/**
 * Pit Garage 小後台（Cloudflare Worker）
 * 網頁送出任務 → 這裡檢查通關密碼 → 交給 Claude → 把回答傳回網頁
 *
 * 需要在 Cloudflare 設定兩個「密鑰」（Settings → Variables and Secrets）：
 *   ANTHROPIC_API_KEY  你的 Claude API 金鑰
 *   PASSCODE           自己設的通關密碼（網頁第一次送出任務時會問你）
 */

const ALLOWED_ORIGINS = ["https://j1577957-lab.github.io"]; // 只有你的網站可以呼叫
const SITE_DATA = "https://j1577957-lab.github.io/stock-agent/data/";
const MODEL = "claude-sonnet-5-5";

const CREW = {
  eng:   { name: "賽車工程師", job: "總指揮。一般問題你自己回答；也可以幫忙規劃、解釋、整理想法。" },
  stock: { name: "策略技師",   job: "台股與美股分析。可以上網查最新股價與新聞，並參考系統提供的自選股掃描資料。分析時給出技術面與消息面重點，不保證漲跌，結尾提醒不構成投資建議。", web: true, stockData: true },
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

async function askClaude(env, member, task) {
  let system =
    `你是「Pit Garage 指揮站」裡的${member.name}，替使用者（台灣人、程式新手）工作。${member.job}\n` +
    `回答規則：繁體中文、口語、精簡，200 字以內；不要用 Markdown 標題或表格，可以用「・」分點；` +
    `台灣時間現在是 ${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}。`;
  if (member.stockData) system += await stockContext();

  const body = {
    model: MODEL,
    max_tokens: 1200,
    system,
    messages: [{ role: "user", content: task }],
  };
  if (member.web) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];

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

  let r = await call(body);
  if (!r.ok && body.tools) {          // 上網工具出問題時，改用不上網再試一次
    delete body.tools;
    r = await call(body);
  }
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
    if (request.method !== "POST") return json({ ok: true, msg: "Pit Garage 後台運作中" }, 200, origin);
    if (!ALLOWED_ORIGINS.includes(origin) && !origin.startsWith("http://localhost"))
      return json({ error: "不允許的來源" }, 403, origin);

    let input;
    try { input = await request.json(); } catch { return json({ error: "格式錯誤" }, 400, origin); }
    const { task, crew = "eng", passcode } = input || {};

    if (!env.PASSCODE || passcode !== env.PASSCODE) return json({ error: "通關密碼錯誤" }, 401, origin);
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
