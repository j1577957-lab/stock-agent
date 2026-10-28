"""把結果送出去：Telegram、Email、網頁儀表板（docs/data 裡的 JSON）。"""
from __future__ import annotations

import html
import json
import os
import smtplib
from email.mime.text import MIMEText
from pathlib import Path

import requests

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "")


# ---------- Telegram ----------
def telegram(text: str) -> None:
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        print("  (未設定 Telegram，略過)")
        return
    for i in range(0, len(text), 3900):  # Telegram 單則上限 4096 字
        r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                          data={"chat_id": chat, "text": text[i:i + 3900], "parse_mode": "HTML",
                                "disable_web_page_preview": "true"}, timeout=20)
        if not r.ok:
            print(f"  ! Telegram 失敗：{r.text[:200]}")


# ---------- Email（用 Gmail 應用程式密碼）----------
def email(subject: str, body: str) -> None:
    user, pw = os.environ.get("GMAIL_ADDRESS"), os.environ.get("GMAIL_APP_PASSWORD")
    if not user or not pw:
        print("  (未設定 Email，略過)")
        return
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"], msg["From"], msg["To"] = subject, user, os.environ.get("EMAIL_TO", user)
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as s:
            s.login(user, pw.replace(" ", ""))
            s.send_message(msg)
    except Exception as e:
        print(f"  ! Email 失敗：{e}")


# ---------- 訊息格式 ----------
VERDICT_ICON = {"買進": "🟢", "觀望": "🟡", "不買": "🔴"}


def format_signal(sig: dict, as_html: bool) -> tuple[str, str]:
    e = html.escape if as_html else (lambda x: x)
    j = sig["judge"]
    icon = VERDICT_ICON.get(j["verdict"], "⚪")
    title = f"{icon} {j['verdict']}｜{sig['name']}（{sig['symbol']}）{sig['price']}"
    lines = [
        f"<b>{e(title)}</b>" if as_html else title,
        f"信心：{j.get('confidence', '-')} / 100",
        f"結論：{e(j.get('summary', ''))}",
        f"進場：{e(str(j.get('entry', '-')))}",
        f"停損：{e(str(j.get('stop_loss', '-')))}",
        f"目標：{e(str(j.get('target', '-')))}",
        "",
        "✅ 理由：" + e("；".join(j.get("reasons", []))),
        "⚠️ 風險：" + e("；".join(j.get("risks", []))),
        "",
        "📝 分析 agent 報告：",
        e(sig["report"]),
        "",
        e("以上為技術面情境分析，不構成投資建議。"),
    ]
    if DASHBOARD_URL:
        lines.append(f"📊 儀表板：{DASHBOARD_URL}")
    return title, "\n".join(lines)


# ---------- 網頁儀表板資料 ----------
def _load(name: str, default):
    try:
        return json.loads((DATA / name).read_text(encoding="utf-8"))
    except Exception:
        return default


def _save(name: str, obj) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")


def save_scan(market: str, mode: str, when: str, snaps: list[dict]) -> None:
    latest = _load("latest.json", {})
    latest[market] = {"mode": mode, "time": when, "stocks": snaps}
    _save("latest.json", latest)


def save_signal(sig: dict) -> None:
    items = _load("signals.json", [])
    items.insert(0, sig)
    _save("signals.json", items[:200])


def save_report(rep: dict) -> None:
    items = _load("reports.json", [])
    items.insert(0, rep)
    _save("reports.json", items[:60])


def load_state() -> dict:
    return _load("state.json", {})


def save_state(state: dict) -> None:
    _save("state.json", state)
