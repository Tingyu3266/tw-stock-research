/* 台股研究室 — 純前端單頁應用（無建置步驟） */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $("#app");
const S = { meta: null, rows: [], byCode: {}, reports: [], groups: [], detail: {}, charts: [] };

/* ------------------------------------------------------------ 工具 */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isNum = (v) => typeof v === "number" && isFinite(v);
function fmt(v, d = 2) {
  if (!isNum(v)) return "–";
  return v.toLocaleString("zh-TW", { minimumFractionDigits: d, maximumFractionDigits: d });
}
const fint = (v) => fmt(v, 0);
const cls = (v) => (!isNum(v) || v === 0 ? "flat" : v > 0 ? "up" : "down");
const signed = (v, d = 2, suf = "") => (isNum(v) ? `<span class="num ${cls(v)}">${v > 0 ? "+" : ""}${fmt(v, d)}${suf}</span>` : "–");
const yi = (thousand) => (isNum(thousand) ? fmt(thousand / 1e5, 2) : "–"); // 千元 → 億元
const ratingCls = (r) => (r === "看多" ? "bull" : r === "看空" ? "bear" : r ? "neutral" : "");
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
async function getJSON(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}
function parseHash() {
  const h = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = h.split("?");
  return { parts: path.split("/").filter(Boolean), q: new URLSearchParams(qs || "") };
}
function setQuery(q, replace = true) {
  const { parts } = parseHash();
  const s = q.toString();
  const url = "#/" + parts.join("/") + (s ? "?" + s : "");
  replace ? history.replaceState(null, "", url) : (location.hash = url);
}
function hl(text, q) {
  const t = esc(text);
  if (!q) return t;
  const terms = q.split(/\s+/).filter(Boolean).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return terms.length ? t.replace(new RegExp(`(${terms.map(esc).join("|")})`, "gi"), "<mark>$1</mark>") : t;
}
function snippet(text, q, n = 120) {
  if (!q) return text.slice(0, n);
  const i = text.toLowerCase().indexOf(q.split(/\s+/)[0].toLowerCase());
  if (i < 0) return text.slice(0, n);
  const s = Math.max(0, i - 40);
  return (s ? "…" : "") + text.slice(s, s + n) + "…";
}

/* ------------------------------------------------------------ 自選清單（存在瀏覽器） */
const WL_KEY = "tw-watchlist";
function getWL() { try { return JSON.parse(localStorage.getItem(WL_KEY) || "[]"); } catch { return []; } }
function setWL(a) { try { localStorage.setItem(WL_KEY, JSON.stringify(a)); } catch {} }
function toggleWL(code) {
  const a = getWL();
  const i = a.indexOf(code);
  i >= 0 ? a.splice(i, 1) : a.push(code);
  setWL(a);
  return i < 0;
}
function allGroups() {
  return [{ id: "mine", name: "⭐ 我的自選（本機）", desc: "在公司頁按 ☆ 加入，只存在這台瀏覽器", codes: getWL(), local: true }, ...S.groups];
}

/* ------------------------------------------------------------ 載入 */
async function boot() {
  try {
    const [meta, idx, reports, groups] = await Promise.all([
      getJSON("data/meta.json"), getJSON("data/index.json"), getJSON("data/reports.json"), getJSON("data/groups.json"),
    ]);
    S.meta = meta;
    S.rows = idx.rows.map((r) => Object.fromEntries(idx.fields.map((f, i) => [f, r[i]])));
    S.rows.forEach((r) => (S.byCode[r.code] = r));
    S.reports = reports;
    S.groups = groups;
    $("#built").textContent = ` 資料更新：${meta.built}（最新交易日 ${meta.latest}）`;
  } catch (e) {
    app.innerHTML = `<div class="card empty">讀不到網站資料（${esc(e.message)}）。<br>請先執行 <code>python scripts/build_site.py</code>，並用本機伺服器開啟（不要直接雙擊 html）。</div>`;
    return;
  }
  initSearch();
  window.addEventListener("hashchange", route);
  route();
}

function route() {
  S.charts.forEach((c) => { try { c.remove(); } catch {} });
  S.charts = [];
  const { parts, q } = parseHash();
  const page = parts[0] || "home";
  $$("nav.main a").forEach((a) => a.classList.toggle("active", a.dataset.nav === (page === "report" ? "reports" : page === "stock" ? "" : page)));
  window.scrollTo(0, 0);
  ({ home: pageHome, reports: pageReports, report: pageReport, screener: pageScreener, groups: pageGroups, stock: pageStock }[page] || pageHome)(parts, q);
}

/* ------------------------------------------------------------ 全站搜尋 */
function initSearch() {
  const inp = $("#q"), box = $("#suggest");
  let sel = 0, items = [];
  const render = () => {
    const v = inp.value.trim();
    if (!v) { box.classList.remove("show"); return; }
    const lv = v.toLowerCase();
    const st = S.rows.filter((r) => r.code.startsWith(v) || r.name.toLowerCase().includes(lv)).slice(0, 7);
    const nRep = S.reports.filter((r) => matchReport(r, v)).length;
    items = [...st.map((r) => ({ href: `#/stock/${r.code}`, html: `<span class="num">${r.code}</span> ${hl(r.name, v)} <span class="muted small">${esc(r.mkt)}・${esc(r.ind)}</span>` })),
      { href: `#/reports?q=${encodeURIComponent(v)}`, html: `🔎 在分析報告中搜尋「${esc(v)}」<span class="muted small">（${nRep} 篇）</span>` },
      { href: `#/screener?q=${encodeURIComponent(v)}`, html: `📊 在選股表中篩選「${esc(v)}」` }];
    sel = Math.min(sel, items.length - 1);
    box.innerHTML = items.map((it, i) => `<a href="${it.href}" class="${i === sel ? "sel" : ""}">${it.html}</a>`).join("");
    box.classList.add("show");
  };
  inp.addEventListener("input", () => { sel = 0; render(); });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { sel = Math.min(sel + 1, items.length - 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); render(); e.preventDefault(); }
    else if (e.key === "Enter" && items[sel]) { location.hash = items[sel].href; box.classList.remove("show"); inp.blur(); }
    else if (e.key === "Escape") { box.classList.remove("show"); inp.blur(); }
  });
  inp.addEventListener("blur", () => setTimeout(() => box.classList.remove("show"), 150));
  box.addEventListener("click", () => { box.classList.remove("show"); inp.value = ""; });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); inp.focus(); }
  });
}

/* ------------------------------------------------------------ 報告卡片 */
function repCard(r, q = "") {
  const st = S.byCode[r.code];
  return `<a class="card rep-card" href="#/report/${encodeURIComponent(r.id)}">
    <div class="rep-meta"><span class="num">${esc(r.date)}</span>
      <span><b class="num">${esc(r.code)}</b> ${esc(r.name)}</span>
      ${r.rating ? `<span class="badge ${ratingCls(r.rating)}">${esc(r.rating)}</span>` : ""}
      ${st ? `<span class="num">${fmt(st.c)}</span> ${signed(st.pct, 2, "%")}` : ""}</div>
    <div class="title">${hl(r.title, q)}</div>
    <div class="muted small">${hl(q ? snippet(r.summary + " " + r.text, q) : r.summary, q)}</div>
    <div class="chips">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
  </a>`;
}

/* ------------------------------------------------------------ 首頁 */
function pageHome() {
  const rows = S.rows.filter((r) => isNum(r.pct));
  const up = rows.filter((r) => r.pct > 0).length, down = rows.filter((r) => r.pct < 0).length;
  const topBy = (f, n = 8, asc = false) => [...S.rows].filter((r) => isNum(r[f]) && r.v > 500).sort((a, b) => (asc ? a[f] - b[f] : b[f] - a[f])).slice(0, n);
  const mini = (title, list, f, fmtf) => `<div class="card"><h3>${title}</h3><table><tbody>${list.map((r) =>
    `<tr><td class="l"><a class="code" href="#/stock/${r.code}">${r.code}</a> ${esc(r.name)}</td><td>${fmtf(r[f])}</td></tr>`).join("")}</tbody></table></div>`;
  app.innerHTML = `
    <h1>台股研究室</h1>
    <p class="sub">每日一家公司深度分析 ＋ 全市場 ${S.meta.stocks.toLocaleString()} 檔上市櫃股票資料。最新交易日 <b class="num">${esc(S.meta.latest)}</b>。</p>
    <div class="grid cols-4">
      <div class="card stat"><div class="label">分析報告</div><div class="value">${S.reports.length}</div><a class="small" href="#/reports">看全部 →</a></div>
      <div class="card stat"><div class="label">上漲 / 下跌家數</div><div class="value"><span class="up">${up}</span> / <span class="down">${down}</span></div><span class="small muted">共 ${rows.length} 檔有成交</span></div>
      <div class="card stat"><div class="label">月營收資料月份</div><div class="value">${esc(S.meta.revenue || "–")}</div><a class="small" href="#/screener?sort=revYoY">營收年增排行 →</a></div>
      <div class="card stat"><div class="label">集保股權分散</div><div class="value">${esc(S.meta.tdcc || "–")}</div><a class="small" href="#/screener?sort=b1000w">大戶增持排行 →</a></div>
    </div>
    <h2>最新分析報告</h2>
    <div class="grid cols-3">${S.reports.slice(0, 6).map((r) => repCard(r)).join("") || `<div class="card empty">還沒有報告。把 Claude 的分析存到 reports/ 資料夾即可。</div>`}</div>
    <h2>今日市場焦點 <span class="muted small">（成交量 &gt; 500 張）</span></h2>
    <div class="grid cols-4">
      ${mini("漲幅前 8", topBy("pct"), "pct", (v) => signed(v, 2, "%"))}
      ${mini("跌幅前 8", topBy("pct", 8, true), "pct", (v) => signed(v, 2, "%"))}
      ${mini("外資買超（張）", topBy("f1"), "f1", (v) => signed(v, 0))}
      ${mini("投信 5 日買超（張）", topBy("t5"), "t5", (v) => signed(v, 0))}
    </div>`;
}

/* ------------------------------------------------------------ 報告列表 */
function matchReport(r, q) {
  if (!q) return true;
  const hay = `${r.code} ${r.name} ${r.title} ${r.summary} ${r.tags.join(" ")} ${r.text}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}
function pageReports(_, q) {
  const tags = [...new Set(S.reports.flatMap((r) => r.tags))].sort();
  const inds = [...new Set(S.reports.map((r) => S.byCode[r.code]?.ind).filter(Boolean))].sort();
  app.innerHTML = `
    <h1>分析報告</h1><p class="sub">支援全文關鍵字、評等、標籤、日期、產業、分組交叉篩選。</p>
    <div class="card">
      <div class="filters">
        <div class="field wide"><label>關鍵字（空白分隔＝同時包含）</label><input id="f-q" type="search" placeholder="例：AI 毛利率"></div>
        <div class="field"><label>評等</label><select id="f-rating"><option value="">全部</option><option>看多</option><option>中性</option><option>看空</option></select></div>
        <div class="field"><label>產業</label><select id="f-ind"><option value="">全部</option>${inds.map((x) => `<option>${esc(x)}</option>`).join("")}</select></div>
        <div class="field"><label>分組</label><select id="f-group"><option value="">全部</option>${allGroups().map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("")}</select></div>
        <div class="field wide"><label>日期區間</label><div class="range"><input id="f-from" type="date"><span>~</span><input id="f-to" type="date"></div></div>
        <div class="field"><label>排序</label><select id="f-sort"><option value="new">日期新→舊</option><option value="old">日期舊→新</option><option value="code">代號</option></select></div>
      </div>
      <div class="presets" id="f-tags">${tags.map((t) => `<button class="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div>
    </div>
    <div class="toolbar"><span id="r-count" class="muted"></span><button class="btn sm" id="r-clear">清除條件</button></div>
    <div class="grid cols-3" id="r-list"></div>`;
  const ids = ["q", "rating", "ind", "group", "from", "to", "sort"];
  ids.forEach((k) => { const el = $(`#f-${k}`); el.value = q.get(k) || (k === "sort" ? "new" : ""); el.addEventListener("input", apply); });
  let selTags = new Set((q.get("tags") || "").split(",").filter(Boolean));
  $$("#f-tags .tag").forEach((b) => {
    b.classList.toggle("on", selTags.has(b.dataset.tag));
    b.addEventListener("click", () => { selTags.has(b.dataset.tag) ? selTags.delete(b.dataset.tag) : selTags.add(b.dataset.tag); b.classList.toggle("on"); apply(); });
  });
  $("#r-clear").addEventListener("click", () => { ids.forEach((k) => ($(`#f-${k}`).value = k === "sort" ? "new" : "")); selTags.clear(); $$("#f-tags .tag").forEach((b) => b.classList.remove("on")); apply(); });
  function apply() {
    const v = Object.fromEntries(ids.map((k) => [k, $(`#f-${k}`).value.trim()]));
    const g = v.group && allGroups().find((x) => x.id === v.group);
    let list = S.reports.filter((r) =>
      matchReport(r, v.q) && (!v.rating || r.rating === v.rating) && (!v.ind || S.byCode[r.code]?.ind === v.ind) &&
      (!g || g.codes.includes(r.code)) && (!v.from || r.date >= v.from) && (!v.to || r.date <= v.to) &&
      [...selTags].every((t) => r.tags.includes(t)));
    if (v.sort === "old") list.reverse();
    if (v.sort === "code") list.sort((a, b) => a.code.localeCompare(b.code));
    $("#r-count").textContent = `共 ${list.length} 篇`;
    $("#r-list").innerHTML = list.map((r) => repCard(r, v.q)).join("") || `<div class="card empty">沒有符合條件的報告</div>`;
    const nq = new URLSearchParams();
    ids.forEach((k) => v[k] && !(k === "sort" && v[k] === "new") && nq.set(k, v[k]));
    if (selTags.size) nq.set("tags", [...selTags].join(","));
    setQuery(nq);
  }
  apply();
}

/* ------------------------------------------------------------ 單篇報告 */
async function pageReport(parts) {
  const id = decodeURIComponent(parts[1] || "");
  const r = S.reports.find((x) => x.id === id);
  if (!r) { app.innerHTML = `<div class="card empty">找不到報告 ${esc(id)}</div>`; return; }
  const txt = await fetch(`reports/${encodeURIComponent(id)}.md`).then((x) => x.text());
  const body = txt.replace(/^﻿?---[\s\S]*?\n---\s*\n?/, "");
  const html = DOMPurify.sanitize(marked.parse(body));
  const st = S.byCode[r.code];
  const others = S.reports.filter((x) => x.code === r.code && x.id !== r.id);
  app.innerHTML = `
    <p class="small"><a href="#/reports">← 分析報告</a></p>
    <div class="rep-meta"><span class="num">${esc(r.date)}</span>${r.rating ? `<span class="badge ${ratingCls(r.rating)}">${esc(r.rating)}</span>` : ""}
      ${r.tags.map((t) => `<a class="tag" href="#/reports?tags=${encodeURIComponent(t)}">${esc(t)}</a>`).join("")}</div>
    <h1>${esc(r.title)}</h1>
    <p class="sub"><a href="#/stock/${esc(r.code)}"><b class="num">${esc(r.code)}</b> ${esc(r.name)}</a>　${esc(r.summary)}</p>
    <div class="layout-2">
      <article class="card md">${html}</article>
      <aside class="grid" style="align-content:start">
        ${st ? `<div class="card"><h3>${esc(st.name)} 最新數據</h3><table><tbody>
          <tr><td class="l">收盤（${esc(st.date)}）</td><td class="num">${fmt(st.c)} ${signed(st.pct, 2, "%")}</td></tr>
          <tr><td class="l">本益比 / 殖利率</td><td class="num">${fmt(st.pe)} / ${fmt(st.dy)}%</td></tr>
          <tr><td class="l">營收年增（${esc(st.revYm)}）</td><td>${signed(st.revYoY, 1, "%")}</td></tr>
          <tr><td class="l">外資 5 日（張）</td><td>${signed(st.f5, 0)}</td></tr>
          <tr><td class="l">投信 5 日（張）</td><td>${signed(st.t5, 0)}</td></tr>
          <tr><td class="l">千張大戶</td><td class="num">${fmt(st.b1000)}% ${signed(st.b1000w, 2)}</td></tr>
        </tbody></table><p><a class="btn sm" href="#/stock/${st.code}">看 K 線、籌碼、財務 →</a></p></div>` : ""}
        ${others.length ? `<div class="card"><h3>同公司其他報告</h3>${others.map((o) => `<div class="small"><a href="#/report/${encodeURIComponent(o.id)}">${esc(o.date)} ${esc(o.title)}</a></div>`).join("")}</div>` : ""}
      </aside>
    </div>`;
}

/* ------------------------------------------------------------ 選股篩選 */
const COLS = [
  // key, 標題, 格式, 可篩選範圍?, 說明
  ["code", "代號", "code"], ["name", "名稱", "text"], ["mkt", "市場", "text"], ["ind", "產業", "text"],
  ["c", "收盤", 2], ["pct", "漲跌%", "pct", true], ["v", "成交量(張)", 0, true], ["r20", "20日漲跌%", "pct", true],
  ["pe", "本益比", 2, true], ["pb", "股價淨值比", 2, true], ["dy", "殖利率%", 2, true], ["cash", "最近現金股利", 2, true],
  ["eps", "今年累計EPS", 2, true], ["eps4", "近四季EPS", 2, true],
  ["revYoY", "營收年增%", "pct", true], ["revMoM", "營收月增%", "pct", true], ["revCum", "累計營收年增%", "pct", true], ["rev", "月營收(億)", "yi", true],
  ["f1", "外資買賣(張)", "s0", true], ["f5", "外資5日", "s0", true], ["f20", "外資20日", "s0", true], ["fS", "外資連買賣天", "s0", true],
  ["t5", "投信5日", "s0", true], ["t20", "投信20日", "s0", true], ["tS", "投信連買賣天", "s0", true], ["d5", "自營5日", "s0", true],
  ["mb", "融資餘額", 0, true], ["mb5", "融資5日增減", "s0", true], ["ss", "融券餘額", 0, true],
  ["b1000", "千張大戶%", 2, true], ["b1000w", "大戶週增減", "s2", true], ["b400", "400張以上%", 2, true], ["holders", "股東人數", 0, true],
  ["rDate", "最近報告", "rep"],
];
const COLMAP = Object.fromEntries(COLS.map((c) => [c[0], c]));
const DEFAULT_COLS = ["code", "name", "ind", "c", "pct", "v", "pe", "dy", "revYoY", "eps4", "f5", "fS", "t5", "mb5", "b1000", "b1000w", "rDate"];
const PRESETS = [
  ["外資連買 ≥3 天", { fS_min: 3 }], ["投信連買 ≥3 天", { tS_min: 3 }], ["營收年增 >20%", { revYoY_min: 20 }],
  ["高殖利率 >5%", { dy_min: 5 }], ["低本益比 <12", { pe_min: 0.01, pe_max: 12 }], ["千張大戶週增", { b1000w_min: 0.3 }],
  ["融資減、外資買", { mb5_max: -1, f5_min: 1 }], ["站上季線", { above60: "1" }], ["有分析報告", { rep: "1" }],
];
function cell(r, c) {
  const [k, , f] = c, v = r[k];
  if (f === "code") return `<td class="l"><a class="code" href="#/stock/${v}">${v}</a></td>`;
  if (f === "text") return `<td class="l">${k === "name" ? `<a href="#/stock/${r.code}">${esc(v)}</a>` : esc(v)}</td>`;
  if (f === "pct") return `<td>${signed(v, 2)}</td>`;
  if (f === "s0") return `<td>${signed(v, 0)}</td>`;
  if (f === "s2") return `<td>${signed(v, 2)}</td>`;
  if (f === "yi") return `<td class="num">${yi(v)}</td>`;
  if (f === "rep") return `<td>${v ? `<a href="#/reports?q=${r.code}">${esc(v)}</a> <span class="badge ${ratingCls(r.rating)}">${esc(r.rating || "")}</span>` : ""}</td>`;
  if (k === "c") return `<td class="num ${cls(r.pct)}">${fmt(v, v >= 1000 ? 0 : 2)}</td>`;
  return `<td class="num">${fmt(v, f)}</td>`;
}
function pageScreener(_, q) {
  const inds = [...new Set(S.rows.map((r) => r.ind))].sort();
  const rangeCols = COLS.filter((c) => c[3]);
  const main = ["pct", "pe", "dy", "revYoY", "eps4", "fS", "tS", "f5", "b1000w"];
  const rangeField = (c) => `<div class="field"><label>${c[1]}</label><div class="range"><input class="rg" data-k="${c[0]}_min" type="number" step="any" placeholder="最小"><span>~</span><input class="rg" data-k="${c[0]}_max" type="number" step="any" placeholder="最大"></div></div>`;
  app.innerHTML = `
    <h1>選股篩選</h1><p class="sub">全市場上市櫃股票，條件可任意組合，網址會記住條件（可加入書籤或分享）。籌碼單位為「張」。</p>
    <div class="card">
      <div class="filters">
        <div class="field"><label>代號／名稱</label><input id="s-q" type="search" placeholder="2330 或 台積"></div>
        <div class="field"><label>市場</label><select id="s-mkt"><option value="">上市＋上櫃</option><option>上市</option><option>上櫃</option></select></div>
        <div class="field"><label>產業</label><select id="s-ind"><option value="">全部產業</option>${inds.map((x) => `<option>${esc(x)}</option>`).join("")}</select></div>
        <div class="field"><label>分組</label><select id="s-group"><option value="">全部</option>${allGroups().map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("")}</select></div>
        <div class="field"><label>其他</label><select id="s-rep"><option value="">不限</option><option value="1">有分析報告</option></select></div>
        <div class="field"><label>均線</label><select id="s-above60"><option value="">不限</option><option value="1">收盤在季線(60日)上</option><option value="2">收盤在月線(20日)上</option><option value="-1">收盤在季線下</option></select></div>
        ${main.map((k) => rangeField(COLMAP[k])).join("")}
      </div>
      <details class="adv"><summary>更多條件（${rangeCols.length - main.length} 項）</summary>
        <div class="filters">${rangeCols.filter((c) => !main.includes(c[0])).map(rangeField).join("")}</div></details>
      <div class="presets"><span class="muted small" style="align-self:center">快速條件：</span>${PRESETS.map((p, i) => `<button class="btn sm" data-p="${i}">${p[0]}</button>`).join("")}</div>
    </div>
    <div class="toolbar">
      <span id="s-count" class="muted"></span>
      <span class="chips"><button class="btn sm" id="s-cols">欄位</button><button class="btn sm" id="s-csv">匯出 CSV</button><button class="btn sm" id="s-clear">清除條件</button></span>
    </div>
    <div id="s-colpick" class="card" style="display:none;margin-bottom:10px"><div class="chips">${COLS.map((c) => `<label class="small"><input type="checkbox" value="${c[0]}"> ${c[1]}</label>`).join("")}</div></div>
    <div class="tbl-wrap"><table><thead id="s-head"></thead><tbody id="s-body"></tbody></table></div>
    <div class="pager" id="s-pager"></div>`;

  let sort = q.get("sort") || "v", dir = q.get("dir") || "desc", page = 1;
  let cols = (q.get("cols") || "").split(",").filter((k) => COLMAP[k]);
  if (!cols.length) cols = [...DEFAULT_COLS];
  if (!cols.includes(sort) && COLMAP[sort]) cols.splice(5, 0, sort);
  const simple = ["q", "mkt", "ind", "group", "rep", "above60"];
  simple.forEach((k) => { const el = $(`#s-${k}`); el.value = q.get(k) || ""; el.addEventListener("input", () => { page = 1; apply(); }); });
  $$(".rg").forEach((el) => { el.value = q.get(el.dataset.k) || ""; el.addEventListener("input", () => { page = 1; apply(); }); });
  if ($$(".adv .rg").some((el) => el.value)) $(".adv").open = true;
  $$("[data-p]").forEach((b) => b.addEventListener("click", () => {
    const p = PRESETS[+b.dataset.p][1];
    Object.entries(p).forEach(([k, v]) => { const el = $(`#s-${k}`) || $(`.rg[data-k="${k}"]`); if (el) el.value = v; });
    page = 1; apply();
  }));
  $("#s-clear").addEventListener("click", () => { simple.forEach((k) => ($(`#s-${k}`).value = "")); $$(".rg").forEach((el) => (el.value = "")); page = 1; apply(); });
  $("#s-cols").addEventListener("click", () => { const p = $("#s-colpick"); p.style.display = p.style.display === "none" ? "" : "none"; });
  $$("#s-colpick input").forEach((cb) => { cb.checked = cols.includes(cb.value); cb.addEventListener("change", () => { cols = COLS.map((c) => c[0]).filter((k) => $(`#s-colpick input[value="${k}"]`).checked); apply(); }); });

  let list = [];
  function apply() {
    const v = Object.fromEntries(simple.map((k) => [k, $(`#s-${k}`).value.trim()]));
    const ranges = $$(".rg").filter((el) => el.value !== "").map((el) => { const [k, m] = el.dataset.k.split("_"); return [k, m, parseFloat(el.value)]; });
    const g = v.group && allGroups().find((x) => x.id === v.group);
    const lq = v.q.toLowerCase();
    list = S.rows.filter((r) => {
      if (lq && !(r.code.startsWith(lq) || r.name.toLowerCase().includes(lq) || r.ind.includes(v.q))) return false;
      if (v.mkt && r.mkt !== v.mkt) return false;
      if (v.ind && r.ind !== v.ind) return false;
      if (g && !g.codes.includes(r.code)) return false;
      if (v.rep && !r.nRep) return false;
      if (v.above60 === "1" && !(r.c > r.ma60)) return false;
      if (v.above60 === "2" && !(r.c > r.ma20)) return false;
      if (v.above60 === "-1" && !(isNum(r.ma60) && r.c < r.ma60)) return false;
      for (const [k, m, x] of ranges) { const y = r[k]; if (!isNum(y)) return false; if (m === "min" ? y < x : y > x) return false; }
      return true;
    });
    const f = COLMAP[sort]?.[2];
    list.sort((a, b) => {
      let x = a[sort], y = b[sort];
      if (f === "text" || f === "code" || f === "rep") { x = x || ""; y = y || ""; return dir === "asc" ? String(x).localeCompare(y) : String(y).localeCompare(x); }
      if (!isNum(x)) return 1; if (!isNum(y)) return -1;
      return dir === "asc" ? x - y : y - x;
    });
    const per = 100, pages = Math.max(1, Math.ceil(list.length / per));
    page = Math.min(page, pages);
    $("#s-count").textContent = `符合 ${list.length.toLocaleString()} 檔（共 ${S.rows.length.toLocaleString()} 檔）`;
    const ccols = cols.map((k) => COLMAP[k]);
    $("#s-head").innerHTML = `<tr>${ccols.map((c) => `<th data-k="${c[0]}" class="${["code", "text", "rep"].includes(c[2]) ? "l" : ""} ${c[0] === sort ? "sorted" : ""}">${c[1]}${c[0] === sort ? (dir === "asc" ? " ▲" : " ▼") : ""}</th>`).join("")}</tr>`;
    $("#s-body").innerHTML = list.slice((page - 1) * per, page * per).map((r) => `<tr>${ccols.map((c) => cell(r, c)).join("")}</tr>`).join("") ||
      `<tr><td colspan="${ccols.length}" class="empty">沒有符合條件的股票</td></tr>`;
    $$("#s-head th").forEach((th) => th.addEventListener("click", () => {
      const k = th.dataset.k;
      if (sort === k) dir = dir === "asc" ? "desc" : "asc"; else { sort = k; dir = ["code", "text"].includes(COLMAP[k][2]) ? "asc" : "desc"; }
      apply();
    }));
    $("#s-pager").innerHTML = pages > 1 ? `<button class="btn sm" ${page <= 1 ? "disabled" : ""} data-pg="${page - 1}">上一頁</button><span class="small">${page} / ${pages}</span><button class="btn sm" ${page >= pages ? "disabled" : ""} data-pg="${page + 1}">下一頁</button>` : "";
    $$("[data-pg]").forEach((b) => b.addEventListener("click", () => { page = +b.dataset.pg; apply(); window.scrollTo(0, 0); }));
    const nq = new URLSearchParams();
    simple.forEach((k) => v[k] && nq.set(k, v[k]));
    $$(".rg").forEach((el) => el.value !== "" && nq.set(el.dataset.k, el.value));
    if (sort !== "v") nq.set("sort", sort);
    if (dir !== "desc") nq.set("dir", dir);
    if (cols.join() !== DEFAULT_COLS.join()) nq.set("cols", cols.join());
    setQuery(nq);
  }
  $("#s-csv").addEventListener("click", () => {
    const ccols = cols.map((k) => COLMAP[k]);
    const lines = [ccols.map((c) => c[1]).join(","), ...list.map((r) => ccols.map((c) => { const v = r[c[0]]; return v == null ? "" : `"${String(v).replace(/"/g, '""')}"`; }).join(","))];
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `選股_${S.meta.latest}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  });
  apply();
}

/* ------------------------------------------------------------ 分組 */
function groupStats(codes) {
  const rs = codes.map((c) => S.byCode[c]).filter(Boolean);
  const p = rs.filter((r) => isNum(r.pct));
  const avg = p.length ? p.reduce((s, r) => s + r.pct, 0) / p.length : null;
  return { n: rs.length, up: p.filter((r) => r.pct > 0).length, down: p.filter((r) => r.pct < 0).length, avg,
    f5: rs.reduce((s, r) => s + (r.f5 || 0), 0), rep: rs.filter((r) => r.nRep).length };
}
function groupRow(name, href, st, desc = "") {
  return `<tr><td class="l"><a href="${href}"><b>${esc(name)}</b></a>${desc ? `<div class="muted small">${esc(desc)}</div>` : ""}</td>
    <td class="num">${st.n}</td><td>${signed(st.avg, 2, "%")}</td><td class="num"><span class="up">${st.up}</span> / <span class="down">${st.down}</span></td>
    <td>${signed(st.f5, 0)}</td><td class="num">${st.rep}</td></tr>`;
}
function pageGroups() {
  const head = `<thead><tr><th class="l">分組</th><th>檔數</th><th>平均漲跌</th><th>漲/跌</th><th>外資5日合計(張)</th><th>有報告</th></tr></thead>`;
  const inds = {};
  S.rows.forEach((r) => (inds[r.ind] = inds[r.ind] || []).push(r.code));
  const indRows = Object.entries(inds).map(([k, codes]) => [k, groupStats(codes)]).sort((a, b) => (b[1].avg ?? -99) - (a[1].avg ?? -99));
  const mkts = ["上市", "上櫃"].map((m) => [m, groupStats(S.rows.filter((r) => r.mkt === m).map((r) => r.code))]);
  app.innerHTML = `
    <h1>分組</h1><p class="sub">自訂清單（編輯 <code>groups.json</code>）、我的自選（本機）、產業別、市場別。點分組名稱進入選股表。</p>
    <h2>自訂分組</h2>
    <div class="tbl-wrap"><table>${head}<tbody>${allGroups().map((g) => groupRow(g.name, `#/screener?group=${encodeURIComponent(g.id)}`, groupStats(g.codes), g.desc)).join("")}</tbody></table></div>
    <h2>市場別</h2>
    <div class="tbl-wrap"><table>${head}<tbody>${mkts.map(([m, st]) => groupRow(m, `#/screener?mkt=${encodeURIComponent(m)}`, st)).join("")}</tbody></table></div>
    <h2>產業別 <span class="muted small">（依今日平均漲跌排序）</span></h2>
    <div class="tbl-wrap"><table>${head}<tbody>${indRows.map(([k, st]) => groupRow(k, `#/screener?ind=${encodeURIComponent(k)}`, st)).join("")}</tbody></table></div>`;
}

/* ------------------------------------------------------------ 公司頁 */
function mkChart(el, opts = {}) {
  const c = LightweightCharts.createChart(el, {
    autoSize: true,
    layout: { background: { color: "transparent" }, textColor: css("--muted"), fontFamily: css("--font") },
    grid: { vertLines: { color: css("--line") }, horzLines: { color: css("--line") } },
    rightPriceScale: { borderColor: css("--line") }, timeScale: { borderColor: css("--line") },
    localization: { locale: "zh-TW" }, ...opts,
  });
  S.charts.push(c);
  return c;
}
function sma(k, n) {
  const out = []; let s = 0;
  k.forEach((x, i) => { s += x[4]; if (i >= n) s -= k[i - n][4]; if (i >= n - 1) out.push({ time: x[0], value: +(s / n).toFixed(2) }); });
  return out;
}
const TDCC_LV = ["1-999股", "1-5張", "5-10張", "10-15張", "15-20張", "20-30張", "30-40張", "40-50張", "50-100張", "100-200張", "200-400張", "400-600張", "600-800張", "800-1000張", "1000張以上"];

async function pageStock(parts) {
  const code = parts[1];
  const st = S.byCode[code];
  if (!st) { app.innerHTML = `<div class="card empty">找不到股票 ${esc(code)}</div>`; return; }
  app.innerHTML = `<div class="empty">載入 ${esc(code)} ${esc(st.name)}…</div>`;
  const d = S.detail[code] || (S.detail[code] = await getJSON(`data/s/${code}.json`));
  const info = d.info, reps = S.reports.filter((r) => r.code === code);
  const inWL = getWL().includes(code);
  const kv = (k, v) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`;
  app.innerHTML = `
    <p class="small"><a href="#/screener">← 選股篩選</a></p>
    <div class="stock-head">
      <h1>${esc(st.name)} <span class="num muted">${esc(code)}</span></h1>
      <span class="badge">${esc(st.mkt)}</span><a class="badge" href="#/screener?ind=${encodeURIComponent(st.ind)}">${esc(st.ind)}</a>
      <button class="star ${inWL ? "on" : ""}" id="star">${inWL ? "★ 已加入自選" : "☆ 加入自選"}</button>
    </div>
    <div class="stock-head"><span class="px ${cls(st.pct)}">${fmt(st.c)}</span><span>${signed(st.chg)} (${signed(st.pct, 2, "%")})</span>
      <span class="muted small">${esc(st.date)}　成交 ${fint(st.v)} 張</span></div>
    <div class="kv">
      ${kv("本益比", fmt(st.pe))}${kv("股價淨值比", fmt(st.pb))}${kv("殖利率", fmt(st.dy) + "%")}${kv("近四季 EPS", fmt(st.eps4))}
      ${kv("營收年增 " + esc(st.revYm || ""), signed(st.revYoY, 1, "%"))}${kv("20日漲跌", signed(st.r20, 2, "%"))}
      ${kv("外資 5 日（張）", signed(st.f5, 0))}${kv("投信 5 日（張）", signed(st.t5, 0))}
      ${kv("外資連續", st.fS ? signed(st.fS, 0, " 天") : "–")}${kv("融資 5 日增減", signed(st.mb5, 0))}
      ${kv("千張大戶", fmt(st.b1000) + "%")}${kv("大戶週增減", signed(st.b1000w))}
    </div>
    <div class="tabs" id="tabs">
      <button data-t="k" class="on">K 線</button><button data-t="chip">籌碼</button><button data-t="fin">財務</button>
      <button data-t="tdcc">股權分散</button><button data-t="info">公司資料</button><button data-t="rep">分析報告 (${reps.length})</button>
    </div>
    <div id="tab"></div>`;
  $("#star").addEventListener("click", (e) => { const on = toggleWL(code); e.target.classList.toggle("on", on); e.target.textContent = on ? "★ 已加入自選" : "☆ 加入自選"; });
  const tabs = { k: tabK, chip: tabChip, fin: tabFin, tdcc: tabTdcc, info: tabInfo, rep: tabRep };
  $$("#tabs button").forEach((b) => b.addEventListener("click", () => {
    $$("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
    S.charts.forEach((c) => { try { c.remove(); } catch {} }); S.charts = [];
    tabs[b.dataset.t]();
  }));
  const T = () => $("#tab");
  const noData = (msg) => `<div class="card empty">${msg}<br><span class="small">歷史資料會隨每日排程累積，或執行 <code>python scripts/backfill.py --codes ${esc(code)}</code> 回補。</span></div>`;

  function tabK() {
    if (d.k.length < 2) { T().innerHTML = noData("K 線資料不足"); return; }
    T().innerHTML = `<div class="card"><div class="legend"><span><i style="background:#e0a100"></i>MA5</span><span><i style="background:#7a5af8"></i>MA20</span><span><i style="background:#0ba5ec"></i>MA60</span><span class="muted">紅漲綠跌・成交量單位：張</span></div><div class="chart" id="ck"></div></div>`;
    const c = mkChart($("#ck"));
    const up = css("--up"), dn = css("--down");
    const cs = c.addCandlestickSeries({ upColor: up, downColor: dn, borderUpColor: up, borderDownColor: dn, wickUpColor: up, wickDownColor: dn });
    cs.setData(d.k.map((x) => ({ time: x[0], open: x[1] ?? x[4], high: x[2] ?? x[4], low: x[3] ?? x[4], close: x[4] })));
    const vs = c.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    cs.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.25 } });
    vs.setData(d.k.map((x, i) => ({ time: x[0], value: x[5] || 0, color: (i && x[4] < d.k[i - 1][4] ? dn : up) + "66" })));
    [[5, "#e0a100"], [20, "#7a5af8"], [60, "#0ba5ec"]].forEach(([n, col]) => {
      const s = sma(d.k, n);
      if (s.length) c.addLineSeries({ color: col, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }).setData(s);
    });
    const n = d.k.length;
    c.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 130), to: n + 2 });
  }

  function tabChip() {
    if (!d.chip.length) { T().innerHTML = noData("尚無籌碼資料"); return; }
    T().innerHTML = `
      <div class="card"><div class="seg" id="who"><button data-i="1" class="on">外資</button><button data-i="2">投信</button><button data-i="3">自營商</button><button data-i="0">三大法人合計</button></div>
        <div class="muted small">每日買賣超（張）</div><div class="chart sm" id="cc"></div></div>
      <div class="card" style="margin-top:14px"><h3>融資融券餘額（張）</h3><div class="legend"><span><i style="background:${css("--up")}"></i>融資餘額（右軸）</span><span><i style="background:${css("--down")}"></i>融券餘額（左軸）</span></div><div class="chart sm" id="cm"></div></div>
      <h2>近 20 日明細</h2>
      <div class="tbl-wrap"><table><thead><tr><th class="l">日期</th><th>外資</th><th>投信</th><th>自營商</th><th>合計</th><th>融資餘額</th><th>融券餘額</th></tr></thead>
      <tbody>${d.chip.slice(-20).reverse().map((x) => `<tr><td class="l num">${x[0]}</td><td>${signed(x[1], 0)}</td><td>${signed(x[2], 0)}</td><td>${signed(x[3], 0)}</td><td>${signed((x[1] || 0) + (x[2] || 0) + (x[3] || 0), 0)}</td><td class="num">${fint(x[4])}</td><td class="num">${fint(x[5])}</td></tr>`).join("")}</tbody></table></div>`;
    const c = mkChart($("#cc"));
    const hs = c.addHistogramSeries({ priceLineVisible: false });
    const draw = (i) => {
      hs.setData(d.chip.map((x) => { const v = i ? x[i] : (x[1] || 0) + (x[2] || 0) + (x[3] || 0); return { time: x[0], value: v || 0, color: v >= 0 ? css("--up") : css("--down") }; }));
      c.timeScale().fitContent();
    };
    draw(1);
    $$("#who button").forEach((b) => b.addEventListener("click", () => { $$("#who button").forEach((x) => x.classList.toggle("on", x === b)); draw(+b.dataset.i); }));
    const m = mkChart($("#cm"), { leftPriceScale: { visible: true, borderColor: css("--line") } });
    m.addLineSeries({ color: css("--up"), lineWidth: 2 }).setData(d.chip.filter((x) => isNum(x[4])).map((x) => ({ time: x[0], value: x[4] })));
    m.addLineSeries({ color: css("--down"), lineWidth: 2, priceScaleId: "left" }).setData(d.chip.filter((x) => isNum(x[5])).map((x) => ({ time: x[0], value: x[5] })));
    m.timeScale().fitContent();
  }

  function tabFin() {
    const rev = d.rev, eps = d.eps;
    T().innerHTML = `
      <div class="card"><h3>月營收（億元）與年增率</h3><div class="legend"><span><i style="background:${css("--accent")}"></i>月營收（右軸）</span><span><i style="background:#e0a100"></i>年增率 %（左軸）</span></div>
        ${rev.length ? `<div class="chart sm" id="cr"></div>` : noData("尚無月營收")}</div>
      <h2>月營收明細</h2>
      <div class="tbl-wrap"><table><thead><tr><th class="l">年月</th><th>營收(億)</th><th>月增%</th><th>年增%</th><th>累計年增%</th></tr></thead>
        <tbody>${rev.slice(-24).reverse().map((x) => `<tr><td class="l num">${x[0]}</td><td class="num">${yi(x[1])}</td><td>${signed(x[2], 1)}</td><td>${signed(x[3], 1)}</td><td>${signed(x[4], 1)}</td></tr>`).join("")}</tbody></table></div>
      <h2>每季 EPS（元）</h2>
      <div class="tbl-wrap"><table><thead><tr><th class="l">季度</th><th>單季 EPS</th><th>年度累計 EPS</th><th>累計營收(億)</th><th>累計營業利益(億)</th><th>累計稅後淨利(億)</th></tr></thead>
        <tbody>${eps.slice().reverse().map((x) => `<tr><td class="l num">${x[0]}</td><td class="num">${fmt(x[1])}</td><td class="num">${fmt(x[2])}</td><td class="num">${yi(x[3])}</td><td class="num">${yi(x[4])}</td><td class="num">${yi(x[5])}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">尚無資料</td></tr>`}</tbody></table></div>
      <h2>股利</h2>
      <div class="tbl-wrap"><table><thead><tr><th class="l">股利年度</th><th class="l">期別</th><th>現金股利(元)</th><th>股票股利(元)</th><th class="l">董事會日期</th></tr></thead>
        <tbody>${d.div.map((x) => `<tr><td class="l num">${x[0]}</td><td class="l">${esc(x[1])}</td><td class="num">${fmt(x[2], 4)}</td><td class="num">${fmt(x[3], 4)}</td><td class="l num">${esc(x[4])}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">尚無資料</td></tr>`}</tbody></table></div>
      <p class="muted small">本益比、股價淨值比、殖利率為交易所每日公布值；官方季報 EPS 為「年度累計」，單季數字由累計相減推得。</p>`;
    if (rev.length) {
      const c = mkChart($("#cr"), { leftPriceScale: { visible: true, borderColor: css("--line") } });
      c.addHistogramSeries({ color: css("--accent"), priceLineVisible: false }).setData(rev.map((x) => ({ time: x[0] + "-01", value: (x[1] || 0) / 1e5 })));
      c.addLineSeries({ color: "#e0a100", lineWidth: 2, priceScaleId: "left" }).setData(rev.filter((x) => isNum(x[3])).map((x) => ({ time: x[0] + "-01", value: x[3] })));
      c.timeScale().fitContent();
    }
  }

  function tabTdcc() {
    const td = d.tdcc;
    if (!td.length) { T().innerHTML = noData("尚無集保股權分散資料"); return; }
    const last = td[td.length - 1], prev = td[td.length - 2];
    T().innerHTML = `
      <div class="card"><h3>千張大戶持股比例（%）・每週</h3>${td.length >= 2 ? `<div class="chart sm" id="ct"></div>` : `<p class="muted small">目前只有 ${td.length} 週資料，下週起會有走勢圖。</p>`}</div>
      <h2>持股分級（${esc(last[0])}）　股東 ${fint(last[1])} 人</h2>
      <div class="tbl-wrap"><table><thead><tr><th class="l">持股級距</th><th>占集保%</th>${prev ? `<th>週增減</th>` : ""}<th class="l" style="width:40%"></th></tr></thead>
      <tbody>${TDCC_LV.map((lv, i) => `<tr><td class="l">${lv}</td><td class="num">${fmt(last[i + 2])}</td>${prev ? `<td>${signed(last[i + 2] - prev[i + 2])}</td>` : ""}
        <td class="l"><div style="height:8px;border-radius:4px;background:var(--accent);width:${Math.min(100, last[i + 2])}%"></div></td></tr>`).join("")}</tbody></table></div>`;
    if (td.length >= 2) {
      const c = mkChart($("#ct"));
      c.addLineSeries({ color: css("--accent"), lineWidth: 2 }).setData(td.map((x) => ({ time: x[0], value: x[16] })));
      c.timeScale().fitContent();
    }
  }

  function tabInfo() {
    const row = (k, v) => (v ? `<tr><td class="l muted">${k}</td><td class="l">${v}</td></tr>` : "");
    T().innerHTML = `<div class="card"><table><tbody>
      ${row("公司全名", esc(info.full))}${row("市場 / 產業", `${esc(info.mkt)} / ${esc(info.ind)}`)}${row("董事長", esc(info.chair))}${row("總經理", esc(info.gm))}
      ${row("上市櫃日期", esc(info.listed))}${row("實收資本額", isNum(info.cap) ? fmt(info.cap / 1e8, 2) + " 億元" : "")}${row("已發行股數", isNum(info.shares) ? fint(info.shares / 1000) + " 張" : "")}
      ${row("地址", esc(info.addr))}${row("網站", info.web ? `<a href="${esc(/^https?:/.test(info.web) ? info.web : "https://" + info.web)}" target="_blank" rel="noopener">${esc(info.web)}</a>` : "")}
      ${row("外部連結", `<a href="https://mops.twse.com.tw/mops/#/web/t05st03?companyId=${code}" target="_blank" rel="noopener">公開資訊觀測站</a>`)}
    </tbody></table></div>`;
  }

  function tabRep() {
    T().innerHTML = reps.length ? `<div class="grid cols-3">${reps.map((r) => repCard(r)).join("")}</div>` :
      `<div class="card empty">還沒有 ${esc(st.name)} 的分析報告。<br><span class="small">用 PROMPT.md 的提示詞請 Claude 分析，存成 <code>reports/日期-${esc(code)}.md</code>。</span></div>`;
  }
  tabK();
}

/* ------------------------------------------------------------ 深淺色 */
(function theme() {
  const KEY = "tw-theme";
  let t = null;
  try { t = localStorage.getItem(KEY); } catch {}
  if (t) document.documentElement.dataset.theme = t;
  $("#theme").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch {}
    route();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => !document.documentElement.dataset.theme && route());
})();

boot();
