# 台股研究室

這是一個靜態網站，內容有：每天 Claude 寫的公司分析報告、全市場上市櫃約 2,000 檔股票的選股篩選、分組，以及每家公司的 K 線、籌碼、財務與集保股權分散資料。

- **網站**：純 HTML/JS，架在 GitHub Pages（免費）
- **資料**：Python 腳本只抓官方公開資料，**不經過 Claude，不花 token**
- **自動化**：GitHub Actions 每天台灣時間 22:00 自動抓資料、更新網站，電腦不用開著

---

## 會不會很燒 token？

**不會。** 這個網站的成本分成兩塊：

| 工作 | 誰做 | 花 token 嗎 |
|---|---|---|
| 抓 K 線、法人、融資券、營收、EPS、股利、集保 | Python 腳本，在 GitHub Actions 上跑 | **不花**（直接呼叫證交所、櫃買中心、集保的公開 API） |
| 整理成網站、查詢、篩選、畫圖 | 腳本＋瀏覽器 | **不花** |
| 每天分析一家公司 | Claude | 只有這裡會用，大約就是**一般聊天一次的量** |

約 2,000 檔股票的數字資料全部交給程式處理。Claude 只負責寫分析文字。

如果把數字一筆一筆貼給 Claude 整理，2,000 檔每天會用掉幾十萬到上百萬 token，所以資料一定要交給程式處理。

---

## 資料來源（全部是公開資料，不需要任何帳號密碼）

| 資料 | 來源 | 更新頻率 |
|---|---|---|
| 日 K 線（開高低收量）、本益比、殖利率、淨值比 | 證交所 OpenAPI、櫃買中心 OpenAPI | 每交易日 |
| 三大法人買賣超 | 證交所 T86、櫃買中心 OpenAPI | 每交易日 |
| 融資融券餘額 | 證交所 MI_MARGN、櫃買中心 OpenAPI | 每交易日（約 21:00 公布） |
| 集保股權分散（千張大戶） | 集保結算所開放資料 | 每週（週五公布） |
| 月營收 | 證交所／櫃買中心 OpenAPI（公開資訊觀測站彙總） | 每月 10 日前 |
| 季報 EPS、營收、營業利益、淨利 | 同上 | 每季 |
| 股利 | 同上 | 董事會決議後 |
| 歷史資料回補 | FinMind 公開 API | 只需要跑一次 |

> 本專案**不會**登入你的券商帳戶，也不會抓券商網站。券商帳密不要放進任何地方。

---

## 第一次架設（約 15 分鐘，全部在 GitHub 網頁上完成）

1. 到 <https://github.com> 註冊帳號，建立一個新 repository（例如 `tw-stock`，選 **Public** 才能用免費 Pages）
2. 在 repo 頁面按 **Add file → Upload files**，把這個資料夾裡的所有檔案拖進去（包含 `.github` 資料夾、`data`、`reports`、`scripts`、`site`、`groups.json`）→ Commit
   - 小提醒：Windows 預設會隱藏 `.github` 這類開頭是點的資料夾，請在檔案總管「檢視 → 顯示 → 隱藏的項目」打勾
3. **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**
4. **Settings → Actions → General → Workflow permissions** 選 **Read and write permissions** → Save
5. **Actions** 分頁 → 左邊選「每日更新資料並發布網站」→ **Run workflow**
6. 跑完（約 2～3 分鐘）網址會是 `https://你的帳號.github.io/tw-stock/`

之後每天台灣時間 22:00 會自動更新，週六早上也會補抓週五的融資券與集保資料。

### 回補歷史 K 線

每日排程只會從「今天」開始往後累積。觀察清單的過去一年資料可以這樣補：
**Actions → 回補歷史資料（手動）→ Run workflow**，代號留空就是 `groups.json` 裡的股票加上有報告的公司。

- 想加快速度：到 <https://finmindtrade.com> 免費註冊拿 token，在 **Settings → Secrets and variables → Actions → New repository secret** 新增 `FINMIND_TOKEN`
- 全市場一次回補約 2,000 檔 × 6 次請求，會跑好幾個小時，建議只補你關心的股票

---

## 全自動每日流程（不用動手）

| 台灣時間 | 誰做 | 做什麼 | 花 token？ |
|---|---|---|---|
| 週一～五 22:00 | GitHub Actions | 抓全市場資料 → 存進 `data/` → 更新網站 | 不花 |
| 週一～五 23:00 | Claude 雲端排程（routine） | 照 [`ROUTINE.md`](ROUTINE.md) 挑一家公司 → 寫報告 → 推到 `reports/` | 用你的 Claude 訂閱額度，約一次對話 |
| 推送後約 1 分鐘 | GitHub Actions | 重建網站，新報告上線 | 不花 |

- 休市日：22:00 抓不到新的交易日資料，23:00 的排程看到資料不是今天就會直接結束，不寫報告
- 挑哪家公司：先看 `analysis_queue.txt`（想指定就在裡面一行寫一個代號），沒有的話依序挑 `groups.json` 裡最久沒分析的公司、成交量大且還沒分析過的公司
- 報告格式由 `scripts/save_report.py` 檢查，不合格就不會上線
- 雲端排程電腦關機也會跑；若當天訂閱額度用完，那天可能沒有報告，隔天照常

### 只需要做一次的設定

**你要親自做（我無法代勞）：**
1. 註冊 GitHub、建立 repo、上傳檔案、開啟 Pages 與 Actions 寫入權限（見上面「第一次架設」1～5 步）
2. 在 <https://claude.ai/code> 用同一個帳號連結 GitHub，並授權這個 repo
3. 把 repo 網址告訴 Claude，例如 `https://github.com/你的帳號/tw-stock`

**之後 Claude 可以幫你做：**
4. 建立雲端排程：每週一～五 23:00（UTC 15:00）執行 `ROUTINE.md`。建立前會給你確認一次，也可以在 <https://claude.ai/code/routines> 查看、暫停或刪除
5. 立刻試跑一次，確認報告有出現在網站上

---

## 手動寫報告（可選，約 2 分鐘）

1. 打開 [`PROMPT.md`](PROMPT.md)，複製提示詞，把代號、日期換掉後貼給 Claude
   - 建議先打開網站上那家公司的頁面，把籌碼、財務數字一起貼給 Claude，分析會更準
2. Claude 會回一份開頭有 `---` 欄位區塊的 Markdown
3. 在 GitHub repo 進入 `reports` 資料夾 → **Add file → Create new file**
   - 檔名：`2026-11-27-2330.md`（日期-代號.md）
   - 內容：貼上 Claude 的整份回覆 → **Commit**
4. 約 1 分鐘後網站自動更新

報告開頭的欄位（`rating` 看多/中性/看空、`tags` 標籤、`summary` 摘要）會用在網站的篩選與搜尋。

## 編輯分組

修改 `groups.json`（在 GitHub 上點檔案 → 鉛筆圖示），每個分組有 `name` 和 `codes`。
網站上每家公司頁的「☆ 加入自選」只存在那台瀏覽器，適合臨時觀察。

---

## 網站功能

- **首頁**：最新報告、漲跌家數、漲跌幅／外資／投信排行
- **分析報告**：全文關鍵字搜尋（多個字用空白分隔）、評等、標籤、產業、分組、日期區間
- **選股篩選**：約 30 個指標可設定範圍，例如漲跌、本益比、殖利率、EPS、營收年增/月增、外資/投信連買天數、5/20 日買賣超、融資增減、千張大戶比例與週變化、季線位置。另有快速條件、自訂欄位、排序、匯出 CSV；網址會記住條件
- **分組**：自訂清單、我的自選、市場別、產業別，並顯示平均漲跌、外資合計、有報告家數
- **公司頁**：K 線＋均線＋成交量、三大法人與融資券圖表、月營收與年增率、單季/累計 EPS、股利、集保持股分級、公司基本資料、該公司所有報告
- 全站搜尋（按 `/`）、深淺色切換、手機版

---

## 在自己電腦預覽（可選）

需要 Python 3（本機已安裝）。在這個資料夾開 PowerShell：

```powershell
py scripts/fetch_daily.py
```

```powershell
py scripts/build_site.py
```

```powershell
py -m http.server 8765 --directory site
```

然後打開 <http://localhost:8765>。不能直接雙擊 `index.html`，瀏覽器會擋本機檔案讀取。

## 檔案結構

```
reports/            每日分析報告（Markdown，你每天新增）
groups.json         自訂分組
PROMPT.md           給 Claude 的提示詞範本（手動用）
ROUTINE.md          雲端排程每天執行的工作說明
analysis_queue.txt  指定接下來要分析的公司（可留空）
scripts/
  prepare_analysis.py 挑公司＋產生資料包提示詞（不花 token）
  save_report.py      檢查報告格式後存進 reports/
  analyze_api.py      （備用方案）改用 Claude API 自動寫報告
  fetch_daily.py    每日抓資料 → data/
  backfill.py       一次性回補歷史（FinMind）
  build_site.py     data/ + reports/ → site/data/
data/               原始資料（每日快照，自動累積、進版控）
  daily/日期.json    當日全市場價格、本益比、法人、融資券
  revenue/ eps/ tdcc/ backfill/ companies.json dividends.json
site/               網站本體（index.html、app.js、style.css）
.github/workflows/  自動排程
```

## 已知限制

- 證交所網站（三大法人、融資券）偶爾會限制海外 IP 或高頻請求。GitHub Actions 主機在美國，如果某天這兩項抓不到，其他資料照常更新，Actions 紀錄裡會列出失敗的來源，隔天會自動再試。如果長期失敗，可以改在自己電腦用 Windows 工作排程器跑 `fetch_daily.py`
- 公開 OpenAPI 只提供「最新一天/一月/一季」，所以歷史資料是每天累積的；缺漏的日子可以用 `backfill.py` 補
- 官方季報 EPS 是年度累計數字，網站上的單季 EPS 是用累計數字相減算出來的
