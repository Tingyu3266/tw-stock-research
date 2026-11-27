"""共用工具：HTTP、日期轉換、數字解析、路徑。只使用 Python 標準函式庫。"""
from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SITE = ROOT / "site"

# Windows 主控台預設 cp950，避免印中文時亂碼或報錯
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# 證交所憑證缺少 Subject Key Identifier，Python 3.13+ 的嚴格模式會拒絕。
# 這裡仍然驗證憑證鏈與主機名稱，只關閉 X509 strict 旗標。
_CTX = ssl.create_default_context()
if hasattr(ssl, "VERIFY_X509_STRICT"):
    _CTX.verify_flags &= ~ssl.VERIFY_X509_STRICT

UA = "Mozilla/5.0 (compatible; tw-stock-site/1.0; public-data-fetcher)"


def http_get(url: str, params: dict | None = None, retries: int = 3, timeout: int = 60) -> str:
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,text/csv,*/*"})
            with urllib.request.urlopen(req, timeout=timeout, context=_CTX) as r:
                return r.read().decode("utf-8-sig", errors="replace")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = e
            time.sleep(3 * (i + 1))
    raise RuntimeError(f"GET 失敗 {url}: {last}")


def get_json(url: str, params: dict | None = None):
    txt = http_get(url, params)
    try:
        return json.loads(txt)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"非 JSON 回應 {url}: {txt[:200]!r}") from e


def roc_to_iso(s: str) -> str:
    """'1151125' -> '2026-11-25'；'11510' -> '2026-10'"""
    s = str(s).strip().replace("/", "")
    if len(s) == 7:
        return f"{int(s[:3]) + 1911:04d}-{s[3:5]}-{s[5:7]}"
    if len(s) == 5:
        return f"{int(s[:3]) + 1911:04d}-{s[3:5]}"
    if len(s) == 8:  # 西元 yyyymmdd
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
    return s


def num(v, default=None):
    """'1,234' / '+0.26' / '--' / '' -> float 或 default"""
    if v is None:
        return default
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", "").replace("%", "")
    if s in ("", "-", "--", "---", "N/A", "X", "除權息", "除息", "除權"):
        return default
    try:
        return float(s)
    except ValueError:
        return default


def is_stock_code(code: str) -> bool:
    """一般股票：4 碼數字（排除 ETF、權證、債券）。"""
    return len(code) == 4 and code.isdigit()


def is_etf(code: str) -> bool:
    """ETF：00 開頭，4～6 碼（例：0050、00878、00981A、00679B）"""
    return code.startswith("00") and 4 <= len(code) <= 6 and code[:4].isdigit()


def is_security(code: str) -> bool:
    """網站收錄的證券：一般股票＋ETF"""
    return is_stock_code(code) or is_etf(code)


def add_etf_names(names: dict[str, tuple[str, str]]):
    """把 ETF 名稱與市場別記到 data/etfs.json"""
    path = DATA / "etfs.json"
    cur = read_json(path, {})
    for code, (n, mkt) in names.items():
        if is_etf(code) and n:
            cur[code] = {"n": n.strip(), "mkt": mkt}
    write_json(path, cur)


def read_json(path: Path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path: Path, obj, compact: bool = True):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        txt = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    else:
        txt = json.dumps(obj, ensure_ascii=False, indent=1)
    path.write_text(txt, encoding="utf-8")


def log(*a):
    print(time.strftime("[%H:%M:%S]"), *a, flush=True)


# 證交所 / 櫃買產業代碼
INDUSTRY = {
    "01": "水泥工業", "02": "食品工業", "03": "塑膠工業", "04": "紡織纖維", "05": "電機機械",
    "06": "電器電纜", "08": "玻璃陶瓷", "09": "造紙工業", "10": "鋼鐵工業", "11": "橡膠工業",
    "12": "汽車工業", "14": "建材營造", "15": "航運業", "16": "觀光餐旅", "17": "金融保險",
    "18": "貿易百貨", "19": "綜合", "20": "其他", "21": "化學工業", "22": "生技醫療業",
    "23": "油電燃氣業", "24": "半導體業", "25": "電腦及週邊設備業", "26": "光電業",
    "27": "通信網路業", "28": "電子零組件業", "29": "電子通路業", "30": "資訊服務業",
    "31": "其他電子業", "32": "文化創意業", "33": "農業科技業", "34": "電子商務",
    "35": "綠能環保", "36": "數位雲端", "37": "運動休閒", "38": "居家生活", "80": "管理股票", "91": "存託憑證",
}

FINMIND_TOKEN = os.environ.get("FINMIND_TOKEN", "")
