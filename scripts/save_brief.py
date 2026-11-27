"""檢查盤前快報格式：python scripts/save_brief.py briefs/2026-11-27.md"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from build_site import parse_front_matter
from common import log

SIGNALS = ("積極逢低承接", "小額分批佈局", "觀望暫緩投入", "保守減碼避險")


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
