"""檢查 Claude 寫好的報告格式，合格才存進 reports/。

  python scripts/save_report.py work/analysis_output.md

檢查項目：開頭要有 front matter，必填 code/name/date/title/rating/summary，
code 要跟 work/analysis_target.txt 指定的公司一致，rating 只能是 看多/中性/看空。
不合格會印出原因並以錯誤碼 1 結束，不會寫入 reports/。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from build_site import parse_front_matter
from common import ROOT, log

REQUIRED = ["code", "name", "date", "title", "rating", "summary"]


def validate(text: str, target: str) -> list[str]:
    text = text.strip()
    text = re.sub(r"^```(?:markdown|md)?\s*\n(.*?)\n```\s*$", r"\1", text, flags=re.S)  # 去掉外層程式碼框
    errs = []
    meta, body = parse_front_matter(text + "\n")
    if not meta:
        return ["開頭沒有 --- front matter ---"]
    for k in REQUIRED:
        if not str(meta.get(k, "")).strip():
            errs.append(f"缺少欄位 {k}")
    m = re.search(r"(\d{4}-\d{2}-\d{2})-(\d{4})", target)
    if m and str(meta.get("code", "")).strip() != m.group(2):
        errs.append(f"code 應為 {m.group(2)}，實際為 {meta.get('code')}")
    if meta.get("rating") not in ("看多", "中性", "看空"):
        errs.append(f"rating 必須是 看多/中性/看空，實際為 {meta.get('rating')}")
    if len(body.strip()) < 300:
        errs.append("內文太短")
    for i, block in enumerate(re.findall(r"```chart\s*\n(.*?)\n```", body, re.S), 1):
        try:
            spec = json.loads(block)
        except json.JSONDecodeError as e:
            errs.append(f"第 {i} 張圖 JSON 格式錯誤：{e}")
            continue
        if spec.get("type") not in ("pie", "bar", "hbar", "line", "timeline"):
            errs.append(f"第 {i} 張圖 type 不支援：{spec.get('type')}")
        if spec.get("type") != "timeline" and not str(spec.get("source", "")).strip():
            errs.append(f"第 {i} 張圖缺少 source（資料來源）")
        if spec.get("type") in ("pie", "hbar") and len(spec.get("labels", [])) != len(spec.get("values", [])):
            errs.append(f"第 {i} 張圖 labels 與 values 數量不一致")
    return errs


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--check":
        # 只檢查 reports/ 裡已存在的報告（補寫段落後使用），不搬動檔案
        p = Path(sys.argv[2])
        errs = validate(p.read_text(encoding="utf-8"), p.name)
        for e in errs:
            log("!! 格式不合格：", e)
        if errs:
            sys.exit(1)
        log("格式檢查通過", p)
        return
    src = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "work" / "analysis_output.md")
    target = (ROOT / "work" / "analysis_target.txt").read_text(encoding="utf-8").strip()
    text = src.read_text(encoding="utf-8").strip()
    text = re.sub(r"^```(?:markdown|md)?\s*\n(.*?)\n```\s*$", r"\1", text, flags=re.S)
    errs = validate(text, target)
    if errs:
        for e in errs:
            log("!! 格式不合格：", e)
        sys.exit(1)
    out = ROOT / target
    out.write_text(text + "\n", encoding="utf-8")
    log("已存報告", out.relative_to(ROOT))


if __name__ == "__main__":
    main()
