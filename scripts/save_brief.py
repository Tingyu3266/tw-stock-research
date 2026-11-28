"""檢查盤前快報格式：python scripts/save_brief.py briefs/2026-11-27.md"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from build_site import parse_front_matter
from common import log

SIGNALS = ("積極逢低承接", "小額分批佈局", "觀望暫緩投入", "保守減碼避險")
NEW_FORMAT_FROM = "2026-11-28"
SECTIONS = ("一、隔夜行情", "二、漲跌原因與利空預警", "三、台股開盤風向與關注焦點",
            "四、今晚重要預告", "五、今日資金投入評估")
PRIVATE = ("你的持股", "您的持股", "我的持股", "你持有", "您持有", "推播", "你的手機", "您的手機",
           "信箱", "Email", "email", "E-mail")


def main():
    p = Path(sys.argv[1])
    meta, body = parse_front_matter(p.read_text(encoding="utf-8"))
    errs = []
    if not meta:
        errs.append("開頭沒有 --- front matter ---")
    if meta.get("date") != p.stem:
        errs.append(f"date 應為 {p.stem}")
    if meta.get("signal") not in SIGNALS:
        errs.append(f"signal 必須是：{'、'.join(SIGNALS)}")
    for k in ("summary", "title"):
        if not str(meta.get(k, "")).strip():
            errs.append(f"缺少 {k}")
    if len(body.strip()) < 300:
        errs.append("內文太短")
    # 新格式（2026-11-28 起）：五段式；舊快報不檢查段落，免得重建網站時誤報
    if p.stem >= NEW_FORMAT_FROM:
        heads = re.findall(r"^##\s+(.+?)\s*$", body, re.M)
        for s in SECTIONS:
            if not any(h.startswith(s) for h in heads):
                errs.append(f"缺少段落「## {s}」（標題要一字不差）")
        if "今日燈號" not in body.split("## ", 1)[0]:
            errs.append("開頭要有「今日燈號」與重點")
        sec1 = re.search(r"^##\s+一、隔夜行情.*?(?=^##\s|\Z)", body, re.M | re.S)
        if sec1 and not re.search(r"^\|.*\|\s*$", sec1.group(0), re.M):
            errs.append("「一、隔夜行情」要有表格（項目｜收盤｜漲跌）")
        if not re.search(r"^##\s+資料來源", body, re.M) or "http" not in body:
            errs.append("缺少「## 資料來源」與連結")
    if "非投資建議" not in body:
        errs.append("要註明「非投資建議」")
    for w in PRIVATE:
        if w in body:
            errs.append(f"公開網站不可出現個人化字句：「{w}」（持股與推播相關內容只放在最後回覆）")
    for i, block in enumerate(re.findall(r"```chart\s*\n(.*?)\n```", body, re.S), 1):
        try:
            spec = json.loads(block)
            if spec.get("type") != "timeline" and not spec.get("source"):
                errs.append(f"第 {i} 張圖缺少 source")
        except json.JSONDecodeError as e:
            errs.append(f"第 {i} 張圖 JSON 錯誤：{e}")
    for e in errs:
        log("!! 格式不合格：", e)
    if errs:
        sys.exit(1)
    log("格式檢查通過", p)


if __name__ == "__main__":
    main()
