"""兩個 AI agent：
  1. 分析 agent（analyst）：拿到初篩通過的股票，寫一份買進分析報告
  2. 判斷 agent（judge）：像嚴格的投資主管，審查報告，決定「買進 / 觀望 / 不買」
另外還有盤前、盤後報告。
"""
from __future__ import annotations

import json
import os
import re

DISCLAIMER = "以上為資訊整理與技術面情境分析，不構成投資建議，請自行判斷並控制風險。"

ANALYST_SYSTEM = """你是一位台股與美股的技術分析師，替一位散戶投資人工作。
系統已經用技術指標初篩出一檔「可能可以買進」的股票。請用繁體中文寫一份簡潔的買進分析報告：
1. 技術面：趨勢、均線、量能、KD/MACD/RSI 代表什麼
2. 籌碼面與基本面（台股才有）：若資料裡有「籌碼與基本面」，解讀三大法人買賣超、融資增減、本益比、月營收年增率
3. 消息面：若可以上網，查這檔股票最近 1~3 天的重要新聞、法說會、財報、產業消息（美股也看盤前/大盤情緒）
4. 進場計畫：建議進場價位區間、停損價（必須給，通常設在月線或近期低點下方）、第一目標價、風險報酬比
5. 主要風險（至少 2 點）
不要誇大、不要保證獲利。資料不足就直說。全文 450 字以內。"""

JUDGE_SYSTEM = """你是一位嚴格、保守的投資決策主管（判斷 agent）。分析師交來一份買進報告和原始指標數據。
你的工作是挑毛病：檢查邏輯漏洞、追高風險、停損是否合理、風險報酬比是否至少 1:2、消息面是否有隱憂、法人是否在賣、融資是否暴增（散戶追高）。
寧可錯過，不要做錯。只輸出一個 JSON 物件，不要其他文字，格式：
{"verdict": "買進" 或 "觀望" 或 "不買",
 "confidence": 0到100的整數,
 "entry": "建議進場區間（文字）",
 "stop_loss": "停損價（文字）",
 "target": "目標價（文字）",
 "summary": "一句話結論（40字內）",
 "reasons": ["支持理由", "..."],
 "risks": ["風險", "..."]}"""

BRIEF_SYSTEM = """你是個人投資助理，用繁體中文替一位散戶寫{phase}報告，手機好讀、用表情符號小標題、整份 600 字以內。
內容：
{content}
每檔股票一行，標出值得注意的（⚠️）。最後一行固定寫：「""" + DISCLAIMER + "」"

PRE_CONTENT = """1. 🌍 市場氛圍：{market_hint}（可以上網查最新數據與新聞）
2. 📋 自選股今日計畫：根據提供的指標，哪些接近買點、哪些要小心、哪些觀望（台股請參考法人買賣超、融資增減、月營收）
3. 👀 今日觀察重點 2~3 點（財報、經濟數據、法說會等）"""

POST_CONTENT = """1. 📊 今日大盤收盤表現與原因（可以上網查）
2. 📋 自選股收盤檢討：漲跌、指標變化、法人與融資動向、今天盤中的 AI 判斷結果是否合理
3. 🔭 明日展望與要留意的價位"""


def _client():
    import anthropic

    return anthropic.Anthropic()


def has_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def _call(model: str, system: str, user: str, *, web: bool, max_tokens: int = 1500) -> str:
    client = _client()
    kwargs = dict(model=model, max_tokens=max_tokens, system=system,
                  messages=[{"role": "user", "content": user}])
    if web:
        kwargs["tools"] = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}]
    try:
        resp = client.messages.create(**kwargs)
    except Exception as e:
        if not web:
            raise
        print(f"  ! 上網搜尋功能失敗，改用不搜尋模式：{e}")
        kwargs.pop("tools")
        resp = client.messages.create(**kwargs)
    return "\n".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()


def analyst_report(stock: dict, snap: dict, market: str, cfg: dict, dry: bool) -> str:
    if dry:
        return f"【模擬報告】{stock['name']} 技術面轉強：{', '.join(snap['reasons'])}。停損參考月線 {snap['ma20']}。"
    user = (f"市場：{'台股' if market == 'tw' else '美股'}\n"
            f"股票：{stock['name']}（{stock['symbol']}）\n"
            f"初篩通過理由：{', '.join(snap['reasons'])}\n"
            f"指標數據：{json.dumps(snap, ensure_ascii=False)}")
    return _call(cfg["ai"]["analyst_model"], ANALYST_SYSTEM, user, web=cfg["ai"]["use_web_search"])


def judge(stock: dict, snap: dict, report: str, cfg: dict, dry: bool) -> dict:
    if dry:
        return {"verdict": "買進", "confidence": 60, "entry": f"{snap['price']} 附近",
                "stop_loss": f"{snap['ma20']}", "target": f"{round(snap['price'] * 1.08, 2)}",
                "summary": "【模擬】技術面轉強，可小量試單", "reasons": snap["reasons"],
                "risks": ["這是模擬結果，沒有真的呼叫 AI"]}
    user = (f"股票：{stock['name']}（{stock['symbol']}）\n"
            f"原始指標：{json.dumps(snap, ensure_ascii=False)}\n\n分析師報告：\n{report}")
    text = _call(cfg["ai"]["judge_model"], JUDGE_SYSTEM, user, web=False, max_tokens=1000)
    m = re.search(r"\{.*\}", text, re.S)
    try:
        result = json.loads(m.group(0)) if m else {}
    except json.JSONDecodeError:
        result = {}
    if result.get("verdict") not in ("買進", "觀望", "不買"):
        result = {"verdict": "觀望", "confidence": 0, "summary": "判斷 agent 回覆格式有誤，保守視為觀望",
                  "reasons": [], "risks": [text[:300]], "entry": "-", "stop_loss": "-", "target": "-"}
    return result


def brief(phase: str, market: str, snaps: list[dict], extra: str, cfg: dict, dry: bool) -> str:
    phase_name = {"pre": "盤前", "post": "盤後"}[phase]
    mkt = "台股" if market == "tw" else "美股"
    if dry:
        lines = [f"【模擬{mkt}{phase_name}報告】"]
        lines += [f"• {s['name']} {s.get('price')} ({s.get('change_pct')}%) 分數 {s.get('score')}" for s in snaps]
        return "\n".join(lines + [DISCLAIMER])
    hint = ("美股昨夜收盤、台指期夜盤、加權指數前一日" if market == "tw"
            else "美股期貨、台股今日收盤、亞洲與歐洲股市")
    content = (PRE_CONTENT.format(market_hint=hint) if phase == "pre" else POST_CONTENT)
    system = BRIEF_SYSTEM.format(phase=f"{mkt}{phase_name}", content=content)
    user = f"自選股指標：{json.dumps(snaps, ensure_ascii=False)}\n{extra}"
    return _call(cfg["ai"]["analyst_model"], system, user, web=cfg["ai"]["use_web_search"], max_tokens=2000)
