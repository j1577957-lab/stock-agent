# 股票 Agent｜給 Claude Code 的工作守則

## 關於使用者

- 沒有程式背景。回報時用白話中文、一步一步說明，少用術語；必須用到時順便解釋。
- 這是輔助判斷的工具，不會自動下單，也不構成投資建議。

## 專案在做什麼

- `agent/main.py`（策略技師）：盤前報告、盤中每 15 分鐘掃描、盤後報告、持股警示。
- `agent/news.py`（爬蟲技師－新聞）：每小時抓台股／美股新聞，用關鍵字判斷利多／利空。
- `agent/etf_active.py`（爬蟲技師－主動 ETF）：追蹤主動式 ETF 持股變化。
- `agent/status.py`：更新指揮站的技師狀態與通訊紀錄。
- `worker/worker.js`：Cloudflare 小後台（準時鬧鐘、下達任務、持股股數成本）。
- `docs/`：GitHub Pages 網站（`index.html` 指揮站、`stock.html` 股票看板、`data/` 資料檔）。
- `config.yaml`：平常唯一需要改的設定檔（觀察清單、持股、門檻、AI 模型、通知）。
- `.github/workflows/`：三個排程（stock-agent、news-crawler、etf-active）。主要靠 Cloudflare 鬧鐘叫醒，GitHub 排程只當備援。

## 可以直接做的事

- 修程式錯誤（bug）。修完要測試，並在回報裡說明改了什麼、為什麼。

## 一定要先問過使用者

- 新功能
- 觀察清單、持股、門檻（`config.yaml`）
- AI 提示詞
- 新聞篩選規則（例如過濾哪些網站）
- 排程時間
- 網站外觀：**不改網站外觀**。排程任務只更新 `docs/data/status.json` 的技師狀態和通訊紀錄。

## 絕對不要做

- 不碰金鑰和密碼（它們在 GitHub Secrets、Cloudflare Secrets）。
- 不把私人資料放進這個公開專案。持股只公開代號，股數和成本只存在 Cloudflare。
- 不強制推送（`git push --force`）。
- 不手動改 `docs/data/` 裡的資料檔，它們由程式自動產生。

## 改完怎麼測試

- 語法檢查：`python -m py_compile agent/*.py`
- 策略技師模擬（不送通知、不記成已完成）：
  `python -m agent.main <模式> --dry-run --demo-data`
  模式有 `tw_pre`、`tw_intraday`、`tw_post`、`us_pre`、`us_intraday`、`us_post`、`none`。
  模擬會改到 `docs/data/` 和 `docs/status.json`，測完要用 `git checkout -- docs` 還原，不要把測試資料推上去。
- 新聞分類測試：`python -m agent.news --test`
- worker 語法：`node --check worker/worker.js`
- 雲端環境通常連不到 Yahoo、FinMind，無法實測抓資料；這種情況要在回報裡說清楚，留給隔天巡檢看 log。

## 注意事項

- 三個 workflow 都會把資料推回 GitHub，可能互相撞車。每個技師回存資料時只寫自己負責的檔案。
- 時間一律用台灣時間（Asia/Taipei）說明給使用者聽；美股分冬令（11 月到 3 月）和夏令。
