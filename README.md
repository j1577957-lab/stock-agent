# 📈 個人股票 Agent｜零基礎設定教學

## 它會做什麼？

```
每 15 分鐘（盤中）
   │
   ▼
① 初篩（免費、不用 AI）── 用均線、量能、KD、MACD、RSI 打分數
   │  分數夠高、沒有追高或過熱
   ▼
② 分析 agent（Claude）── 上網查新聞，寫買進分析報告：進場價、停損、目標
   │
   ▼
③ 判斷 agent（Claude）── 嚴格的主管，挑毛病後決定「買進／觀望／不買」
   │  結論是「買進」
   ▼
④ 通知你：Telegram ＋ Email ＋ 網頁儀表板
```

另外，**盤前**和**盤後**各產生一份報告（台股、美股各一次）。

| 台灣時間 | 台股 | 美股（夏令／冬令） |
|---|---|---|
| 盤前報告 | 08:00–08:59 | 20:00／21:00 左右 |
| 盤中掃描 | 09:00–13:30 每 15 分鐘 | 21:30–04:00／22:30–05:00 每 15 分鐘 |
| 盤後報告 | 13:45 之後 | 04:10／05:10 之後 |

> ⚠️ 這是**輔助判斷的工具，不會自動下單**，也不保證獲利。AI 說「買進」只代表技術面條件符合，最後一定要自己決定。

---

## 你需要準備的 4 個帳號

| 帳號 | 用途 | 費用 |
|---|---|---|
| GitHub | 免費雲端主機，每 15 分鐘幫你跑程式＋放網頁 | 免費 |
| Claude API（Anthropic Console） | 分析 agent 和判斷 agent 的大腦 | 用多少付多少，預估每月約 NT$100–500 |
| Telegram | 手機即時通知 | 免費 |
| Gmail 應用程式密碼 | 寄 Email 給自己 | 免費 |

整個設定大約 40 分鐘。一步一步來，卡住就截圖問 Claude。

---

## 第 1 步：註冊 GitHub，建立專案

1. 打開 <https://github.com> → 右上角 **Sign up** → 用 Email 註冊。
2. 登入後，右上角 **＋** → **New repository**。
3. 填寫：
   - Repository name：`stock-agent`
   - 選 **Public**（公開才能免費用網頁儀表板；你的密碼、金鑰不會公開，放在 GitHub Secrets 裡）
   - 其他都不要勾
4. 按 **Create repository**。
5. **回到 Claude，告訴我你的 GitHub 帳號名稱**，我會直接把程式放進去。

> 想自己上傳也可以：解壓縮 `stock-agent.zip` → 在剛建好的頁面點 **uploading an existing file** → 把資料夾裡**所有檔案和資料夾**拖進去（包含 `.github` 這個資料夾）→ **Commit changes**。

---

## 第 2 步：打開網頁儀表板

1. 在 GitHub 專案頁面，點上方 **Settings**（齒輪）。
2. 左邊選 **Pages**。
3. Source 選 **Deploy from a branch**，Branch 選 **main**，資料夾選 **/docs** → **Save**。
4. 等 1–2 分鐘，網址會是：`https://你的帳號.github.io/stock-agent/`
   把它加到手機主畫面，就是你的指揮中心。

---

## 第 3 步：申請 Claude API 金鑰（AI 的大腦）

1. 打開 <https://console.anthropic.com> → 註冊登入。
2. 左邊 **Billing** → 綁信用卡、儲值 **US$5**（最低金額，先試用）。
3. 建議在 **Limits** 設定每月花費上限，例如 US$15，避免意外超支。
4. 左邊 **API Keys** → **Create Key** → 名字打 `stock-agent` → 複製那串 `sk-ant-...` 開頭的字。
   ⚠️ **這串只會顯示一次**，先貼到記事本。不要傳給任何人（包括聊天時貼給 Claude）。

---

## 第 4 步：建立 Telegram 通知機器人

1. 手機下載 Telegram 並註冊。
2. 搜尋 **@BotFather**（有藍色勾勾的）→ 按開始 → 輸入 `/newbot`。
3. 照指示取名字，例如 `我的股票Agent`，帳號名稱要以 bot 結尾，例如 `limin_stock_bot`。
4. BotFather 會給你一串 **Token**（像 `123456:ABC-xyz...`），複製到記事本。
5. 搜尋你剛建立的機器人 → 按開始 → 隨便傳一句「hi」。
6. 用瀏覽器打開下面網址（把 `<TOKEN>` 換成你的 Token）：
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
   畫面上找 `"chat":{"id":123456789` → 這串數字就是 **Chat ID**，複製到記事本。

---

## 第 5 步：Gmail 應用程式密碼

1. 打開 <https://myaccount.google.com/security> → 確認 **兩步驟驗證** 已開啟（沒開就先開）。
2. 打開 <https://myaccount.google.com/apppasswords>。
3. 名稱打 `stock-agent` → **建立** → 會出現 16 個英文字母的密碼，複製到記事本。

---

## 第 6 步：把金鑰放進 GitHub 保險箱（Secrets）

1. GitHub 專案頁面 → **Settings** → 左邊 **Secrets and variables** → **Actions**。
2. 按 **New repository secret**，一個一個新增下面 5 個（Name 要一字不差）：

| Name | Secret（內容） |
|---|---|
| `ANTHROPIC_API_KEY` | 第 3 步的 `sk-ant-...` |
| `TELEGRAM_BOT_TOKEN` | 第 4 步的 Token |
| `TELEGRAM_CHAT_ID` | 第 4 步的數字 |
| `GMAIL_ADDRESS` | 你的 Gmail 地址 |
| `GMAIL_APP_PASSWORD` | 第 5 步的 16 碼密碼 |
| `FINMIND_TOKEN` | （選填）FinMind 金鑰，見下方「FinMind 台股資料」 |

---

## 第 7 步：測試！

1. GitHub 專案頁面 → 上方 **Actions**。如果看到提示，按 **I understand my workflows, go ahead and enable them**。
2. 左邊點 **股票 Agent** → 右邊 **Run workflow**：
   - 模式填：`tw_post`
   - 勾選 **模擬模式**（不花錢）
   - 按綠色 **Run workflow**
3. 等 1–2 分鐘，出現綠色勾勾 ✅ 就成功了。Telegram 和 Email 會收到一份「模擬」報告，網頁儀表板也會有資料。
4. 再跑一次，這次**不要勾**模擬模式 → 會收到真正由 Claude 寫的報告。

🎉 完成！之後完全自動，不需要開電腦。

---

## FinMind 台股資料（選填，建議加）

加上之後，AI 分析台股時會多看到：**三大法人買賣超、融資融券、本益比／殖利率、月營收年增率、個股新聞**；Yahoo 抓不到股價時也會自動改用 FinMind。

1. 打開 <https://finmindtrade.com> → 右上角 **註冊**，到信箱完成驗證（驗證後每小時可查 600 次，免費）
2. 登入後進入 **會員中心／使用者資訊**，複製 **API Token**（很長一串英數字）
3. 到 GitHub Secrets 新增 `FINMIND_TOKEN`，貼上 Token
4. 指揮站後台也要用的話：到 Cloudflare Worker → Settings → Variables and Secrets，同樣新增 Secret `FINMIND_TOKEN`

---

## 日常怎麼用、怎麼改？

所有設定都在 **`config.yaml`**。在 GitHub 點開它 → 右上角鉛筆 ✏️ → 修改 → **Commit changes**。

- **加減股票**：照格式在 `watchlist` 裡加一行。台股上市用 `.TW`、上櫃用 `.TWO`。
- **更嚴格／更寬鬆**：`min_score` 改成 4 會更少通知，改成 2 會更多。
- **觀望也要通知**：`push_verdicts: ["買進", "觀望"]`。
- **省錢**：`use_web_search: false`（不上網查新聞）。
- **暫停**：Actions → 股票 Agent → 右上角 `...` → **Disable workflow**。

也可以直接跟 Claude 說「幫我把 2330 加進股票 agent」，讓 Claude 幫你改。

---

## 常見問題

**Q：為什麼通知時間不是剛好整點 15 分？**
GitHub 免費排程在尖峰時段常延遲 5–15 分鐘，這是正常的。

**Q：台股價格好像慢了？**
免費的 Yahoo 資料台股盤中約延遲 15–20 分鐘，美股接近即時。之後想要即時，可以改接券商 API。

**Q：每次都沒有股票通過？**
代表沒有符合條件的買點，這是好事——不亂買。想看更多候選可以把 `min_score` 降到 2。

**Q：Actions 出現紅色叉叉 ❌？**
點進去截圖給 Claude 看。最常見的原因是 Secrets 名稱打錯。

---

## 檔案說明（給好奇的你）

| 檔案 | 做什麼 |
|---|---|
| `config.yaml` | 你的設定（唯一需要改的檔案） |
| `agent/clock.py` | 判斷現在是盤前、盤中、盤後還是休息 |
| `agent/data.py` | 抓股價 |
| `agent/indicators.py` | 算指標、初篩打分數 |
| `agent/llm.py` | 分析 agent、判斷 agent、盤前盤後報告 |
| `agent/notify.py` | Telegram、Email、儀表板資料 |
| `agent/main.py` | 總指揮，把上面串起來 |
| `.github/workflows/stock-agent.yml` | 告訴 GitHub 每 15 分鐘執行一次 |
| `docs/index.html` | 網頁儀表板 |
