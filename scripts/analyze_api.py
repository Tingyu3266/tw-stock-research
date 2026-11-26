"""【方案 A：GitHub Actions + Claude API】用 Claude API 自動寫今天的分析報告。

前置：先跑 prepare_analysis.py 產生 work/analysis_prompt.md
需要環境變數 ANTHROPIC_API_KEY（在 GitHub repo 的 Secrets 設定）。
  pip install anthropic
  python scripts/analyze_api.py

成本：一次約輸入 6～8 千 token、輸出 3～6 千 token。
以 Claude Opus 5.5（$4 / $20 每百萬 token）計，約 US$0.1～0.15 一篇，
一個月約 22 個交易日，大約 US$3。
"""
from __future__ import annotations

import sys

import anthropic

from common import ROOT, log
from save_report import main as save_main

MODEL = "claude-opus-5-5"


def main():
    prompt = (ROOT / "work" / "analysis_prompt.md").read_text(encoding="utf-8")
    client = anthropic.Anthropic()  # 讀 ANTHROPIC_API_KEY
    try:
        resp = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            output_config={"effort": "medium"},
            # 若主模型因安全分類器拒答，伺服器端自動改用備援模型重跑
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.RateLimitError as e:
        log("!! API 頻率限制，稍後再試：", e)
        sys.exit(1)
    except anthropic.APIStatusError as e:
        log("!! API 錯誤", e.status_code, e.message)
        sys.exit(1)
    except anthropic.APIConnectionError as e:
        log("!! 連不到 API：", e)
        sys.exit(1)

    if resp.stop_reason == "refusal":
        log("!! Claude 拒絕回答，今天不產生報告")
        sys.exit(1)
    if resp.stop_reason == "max_tokens":
        log("!! 回覆被截斷，今天不產生報告")
        sys.exit(1)
    text = "".join(b.text for b in resp.content if b.type == "text")
    out = ROOT / "work" / "analysis_output.md"
    out.write_text(text, encoding="utf-8")
    u = resp.usage
    log(f"Claude 完成：輸入 {u.input_tokens} / 輸出 {u.output_tokens} token")
    sys.argv = [sys.argv[0], str(out)]
    save_main()


if __name__ == "__main__":
    main()
