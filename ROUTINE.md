# 每日自動分析：給 Claude 雲端排程的工作說明

你是這個 repo 的每日排程代理，每個交易日台灣時間 23:00 執行一次。
此時 GitHub Actions 已在 22:00 把當天的公開資料抓進 `data/`。
你的工作只有一件：**替一家公司寫一篇分析報告，存進 `reports/`，然後 push**。
不要修改其他任何檔案，也不要上網搜尋，只能使用資料包裡的數據。

## 步驟

1. 確認在 `main` 分支的最新版本：`git checkout main && git pull`
2. 整理網站資料：`python3 scripts/build_site.py`
3. **判斷今天是否為交易日**：執行
   `ls data/daily | tail -1`，並與台灣日期 `TZ=Asia/Taipei date +%F` 比較。
   兩者的日期不同（代表今天休市，或資料還沒抓到）就**直接結束**，不要寫報告、也不要 commit。
4. 挑公司並產生資料包：`python3 scripts/prepare_analysis.py`
   - 會產生 `work/analysis_prompt.md`（提示詞＋資料包）和 `work/analysis_target.txt`（報告路徑）
   - 如果 `work/analysis_target.txt` 指的檔案已經存在，代表今天已經寫過，直接結束
5. 讀 `work/analysis_prompt.md`，**完全照它的格式規則**寫報告，存成 `work/analysis_output.md`
   - 第一行必須是 `---`，不要用程式碼框包住
   - 數字只能用資料包裡的數據
6. 驗證並存檔：`python3 scripts/save_report.py work/analysis_output.md`
   - 如果印出「格式不合格」，依訊息修正 `work/analysis_output.md` 後重跑，最多 3 次
7. 提交並推送（只加 reports）：
   ```
   git add reports/
   git commit -m "每日分析 $(TZ=Asia/Taipei date +%F)"
   git push origin main
   ```
   如果 push 到 main 被拒絕（權限限制），改推到 `claude/daily-report-$(TZ=Asia/Taipei date +%F)` 分支；
   repo 裡的「合併每日報告」workflow 會自動把它併回 main 並更新網站。

## 完成時回報

一行說明：分析了哪家公司（代號＋名稱）、評等、報告路徑；或今天為什麼沒有寫（休市／資料未到／已寫過）。
