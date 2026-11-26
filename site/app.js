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
  ({ home: pageHome, reports: pageReports, report: pageReport, screener: pageScreener, groups: pageGroups, stock: pageStock, portfolio: pagePortfolio, compare: pageCompare }[page] || pageHome)(parts, q);
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
  return `<a class="card rep-card" href="#/stock/${encodeURIComponent(r.code)}?r=${encodeURIComponent(r.id)}">
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
      ${homePortfolioCard()}
      <div class="card stat"><div class="label">上漲 / 下跌家數</div><div class="value"><span class="up">${up}</span> / <span class="down">${down}</span></div><span class="small muted">共 ${rows.length} 檔有成交</span></div>
      <div class="card stat"><div class="label">月營收資料月份</div><div class="value">${esc(S.meta.revenue || "–")}</div><a class="small" href="#/screener?sort=revYoY">營收年增排行 →</a></div>
      <div class="card stat"><div class="label">集保股權分散</div><div class="value">${esc(S.meta.tdcc || "–")}</div><a class="small" href="#/screener?sort=b1000w">大戶增持排行 →</a></div>
    </div>
    <h2>最新分析報告 <a class="small" href="#/reports">全部 ${S.reports.length} 篇 →</a></h2>
    <div class="grid cols-3">${S.reports.slice(0, 6).map((r) => repCard(r)).join("") || `<div class="card empty">還沒有報告。把 Claude 的分析存到 reports/ 資料夾即可。</div>`}</div>
    <h2>產業熱力圖 <span class="muted small">（成交值加權平均漲跌，格子越大成交值越高；點進去看該產業個股）</span></h2>
    ${industryHeatmap()}
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
/* 舊網址 #/report/{id} 轉到公司頁並顯示該篇報告 */
function pageReport(parts) {
  const id = decodeURIComponent(parts[1] || "");
  const r = S.reports.find((x) => x.id === id);
  if (!r) { app.innerHTML = `<div class="card empty">找不到報告 ${esc(id)}</div>`; return; }
  location.replace(`#/stock/${r.code}?r=${encodeURIComponent(id)}`);
}

/* 公司頁的「分析」區：官方數據圖在上，分析內容在下 */
async function renderAnalysis(el, code, d, rid) {
  const reps = S.reports.filter((x) => x.code === code);
  const r = reps.find((x) => x.id === rid) || reps[0];
  const band = bandBox(d);
  if (!r) {
    el.innerHTML = `<div class="card empty">還沒有這家公司的分析。<br><span class="small">排程每個交易日 20:00 依研究清單寫一家；想優先研究，把代號寫進 <code>analysis_queue.txt</code> 最上面。</span></div>${band}`;
    return;
  }
  el.innerHTML = `<div class="empty">載入分析…</div>`;
  const txt = await fetch(`reports/${encodeURIComponent(r.id)}.md`).then((x) => x.text());
  const body = txt.replace(/^﻿?---[\s\S]*?\n---\s*\n?/, "");
  const html = DOMPurify.sanitize(marked.parse(body));
  const others = reps.filter((x) => x.id !== r.id);
  el.innerHTML = `
    <h2 style="margin-top:4px">分析：${esc(r.title)}</h2>
    <div class="rep-meta" style="margin:-6px 0 10px"><span class="num">${esc(r.date)}</span>${r.rating ? `<span class="badge ${ratingCls(r.rating)}">${esc(r.rating)}</span>` : ""}
      ${r.tags.map((t) => `<a class="tag" href="#/reports?tags=${encodeURIComponent(t)}">${esc(t)}</a>`).join("")}
      ${others.length ? `<span>・其他日期：${others.map((o) => `<a href="#/stock/${code}?r=${encodeURIComponent(o.id)}">${esc(o.date)}</a>`).join("、")}</span>` : ""}</div>
    ${r.summary ? `<p class="card" style="margin:0 0 14px">${esc(r.summary)}</p>` : ""}
    <article class="card md" id="md">${html}</article>
    ${band}`;
  Charts.hydrate($("#md"));
}

/* ------------------------------------------------------------ 自動判讀（依官方數據、規則產生，不經 Claude） */
const sum = (a) => a.reduce((s, v) => s + (v || 0), 0);
const lotsTxt = (v) => `${v > 0 ? "買超" : v < 0 ? "賣超" : "持平"} ${fint(Math.abs(v))} 張`;
function streakOf(vals) {
  let n = 0;
  for (let i = vals.length - 1; i >= 0; i--) {
    const v = vals[i];
    if (!v) break;
    if (n === 0) n = v > 0 ? 1 : -1;
    else if ((v > 0) === (n > 0)) n += n > 0 ? 1 : -1;
    else break;
  }
  return n;
}
function verdict(score, labels = ["偏空", "中性", "偏多"]) {
  const k = score >= 2 ? 2 : score <= -2 ? 0 : 1;
  const cl = ["bear", "neutral", "bull"][k];
  return `<span class="badge ${cl}" style="font-size:14px">${labels[k]}</span>`;
}

function chipNarrative(d) {
  const ch = d.chip.filter((x) => x[1] != null);
  if (ch.length < 3) return "";
  const last = ch[ch.length - 1], c5 = ch.slice(-5), c20 = ch.slice(-20);
  const f5 = sum(c5.map((x) => x[1])), t5 = sum(c5.map((x) => x[2])), d5 = sum(c5.map((x) => x[3]));
  const f20 = sum(c20.map((x) => x[1])), t20 = sum(c20.map((x) => x[2]));
  const fS = streakOf(ch.map((x) => x[1])), tS = streakOf(ch.map((x) => x[2]));
  const k = d.k, kl = k.length;
  const vol5 = sum(k.slice(-5).map((x) => x[5]));
  const p5 = kl > 5 ? ((k[kl - 1][4] / k[kl - 6][4]) - 1) * 100 : null;
  const mb = d.chip.filter((x) => isNum(x[4]));
  const mb5 = mb.length > 5 ? mb[mb.length - 1][4] - mb[mb.length - 6][4] : null;
  const ss = d.chip.filter((x) => isNum(x[5]));
  const ss5 = ss.length > 5 ? ss[ss.length - 1][5] - ss[ss.length - 6][5] : null;
  const td = d.tdcc, bw = td.length >= 2 ? td[td.length - 1][16] - td[td.length - 2][16] : null;

  const facts = [
    `<b>${esc(last[0])} 當日</b>：外資${lotsTxt(last[1])}、投信${lotsTxt(last[2])}、自營商${lotsTxt(last[3] || 0)}。`,
    `<b>近 5 日</b>：外資${lotsTxt(f5)}${fS ? `（連續 ${Math.abs(fS)} 天${fS > 0 ? "買" : "賣"}）` : ""}、投信${lotsTxt(t5)}${tS ? `（連續 ${Math.abs(tS)} 天${tS > 0 ? "買" : "賣"}）` : ""}、自營商${lotsTxt(d5)}；三大法人合計${lotsTxt(f5 + t5 + d5)}，約占同期成交量 ${vol5 ? fmt(Math.abs(f5 + t5 + d5) / vol5 * 100, 1) : "–"}%。`,
    `<b>近 20 日</b>：外資${lotsTxt(f20)}、投信${lotsTxt(t20)}。`,
  ];
  if (mb5 != null) facts.push(`<b>融資</b>：近 5 日${mb5 >= 0 ? "增加" : "減少"} ${fint(Math.abs(mb5))} 張${ss5 != null ? `；<b>融券</b>${ss5 >= 0 ? "增加" : "減少"} ${fint(Math.abs(ss5))} 張` : ""}。`);
  if (bw != null) facts.push(`<b>千張大戶</b>：持股 ${fmt(td[td.length - 1][16])}%，較前一週 ${signed(bw)} 個百分點。`);

  let score = 0; const why = [];
  const inst = f5 + t5;
  if (vol5 && Math.abs(inst) / vol5 > 0.03) { score += inst > 0 ? 1 : -1; why.push(`外資＋投信 5 日${inst > 0 ? "合計買超" : "合計賣超"}，力道約占成交量 ${fmt(Math.abs(inst) / vol5 * 100, 1)}%，${inst > 0 ? "法人資金正在流入" : "法人正在調節"}。`); }
  else why.push("外資＋投信 5 日買賣超占成交量比例不高，法人沒有明顯方向。");
  if (f5 && t5 && (f5 > 0) !== (t5 > 0)) why.push(`外資與投信方向相反（外資${f5 > 0 ? "買" : "賣"}、投信${t5 > 0 ? "買" : "賣"}），代表法人看法分歧，${t5 > 0 ? "投信作帳或認養行情需留意持續性" : "外資買盤能否延續是關鍵"}。`);
  if (Math.abs(fS) >= 3) { score += fS > 0 ? 1 : -1; why.push(`外資已連續 ${Math.abs(fS)} 天${fS > 0 ? "買超，趨勢性買盤" : "賣超，賣壓尚未停止"}。`); }
  if (Math.abs(tS) >= 3) { score += tS > 0 ? 1 : -1; why.push(`投信連續 ${Math.abs(tS)} 天${tS > 0 ? "買超，常見於投信認養行情" : "賣超"}。`); }
  if (mb5 != null && p5 != null) {
    if (mb5 > 0 && inst < 0) { score -= 1; why.push("融資增加但法人賣出，籌碼有從法人流向散戶的跡象，通常較不健康。"); }
    else if (mb5 < 0 && inst > 0) { score += 1; why.push("融資減少、法人買進，籌碼往法人集中（俗稱「籌碼沉澱」），較為健康。"); }
  }
  if (bw != null && Math.abs(bw) >= 0.2) { score += bw > 0 ? 1 : -1; why.push(`千張大戶一週${bw > 0 ? "增加" : "減少"} ${fmt(Math.abs(bw))} 個百分點，${bw > 0 ? "大戶在收集籌碼" : "大戶在釋出持股"}。`); }
  if (p5 != null) why.push(`同期股價 ${signed(p5, 2, "%")}。${p5 > 0 && inst < 0 ? "股價上漲但法人賣，屬於「量價背離」，要小心追高。" : p5 < 0 && inst > 0 ? "股價下跌但法人逢低買進，可留意是否止跌。" : ""}`);

  return `<div class="card narrative"><h3>籌碼解讀 ${verdict(score)}</h3>
    <h4>這幾天誰在買賣</h4><ul>${facts.map((f) => `<li>${f}</li>`).join("")}</ul>
    <h4>分析</h4><ul>${why.map((f) => `<li>${f}</li>`).join("")}</ul>
    <h4>結論</h4><p>${score >= 2 ? "整體籌碼偏多：法人與大戶站在買方，短線籌碼面支撐較強。" : score <= -2 ? "整體籌碼偏空：法人或大戶持續調節，短線籌碼面壓力較大，宜等賣壓緩和。" : "籌碼面中性：買賣力道沒有明顯一方占優，建議搭配基本面與技術面判斷。"}</p>
    <p class="muted small">依證交所、櫃買中心、集保公開數據自動判讀（評分 ${score > 0 ? "+" : ""}${score}），每日更新；非投資建議。</p></div>`;
}

function finNarrative(d) {
  const rev = d.rev.filter((x) => isNum(x[1]));
  const eps = d.eps.filter((x) => isNum(x[1]));
  if (rev.length < 3 && eps.length < 2) return "";
  const facts = [], why = []; let score = 0;
  if (rev.length) {
    const r = rev[rev.length - 1];
    facts.push(`<b>${esc(r[0])} 月營收</b> ${yi(r[1])} 億元，月增 ${signed(r[2], 1, "%")}、年增 ${signed(r[3], 1, "%")}${isNum(r[4]) ? `，今年累計年增 ${signed(r[4], 1, "%")}` : ""}。`);
    const y3 = rev.slice(-3).map((x) => x[3]).filter(isNum), y3p = rev.slice(-6, -3).map((x) => x[3]).filter(isNum);
    const posRun = (() => { let n = 0; for (let i = rev.length - 1; i >= 0 && isNum(rev[i][3]); i--) { if (rev[i][3] > 0) n++; else break; } return n; })();
    if (y3.length === 3) {
      const a = sum(y3) / 3, b = y3p.length ? sum(y3p) / y3p.length : null;
      facts.push(`近 3 個月平均年增 ${signed(a, 1, "%")}${b != null ? `（前 3 個月 ${signed(b, 1, "%")}）` : ""}${posRun ? `，已連續 ${posRun} 個月年增` : ""}。`);
      if (a > 10) { score += 1; why.push(`營收維持雙位數年增，成長動能明確。`); } else if (a < 0) { score -= 1; why.push("近 3 個月營收平均年減，需求轉弱或基期偏高。"); } else why.push("營收成長溫和，屬於穩定期。");
      if (b != null) { if (a - b > 5) { score += 1; why.push("年增率比前一季度明顯拉高，成長在加速。"); } else if (b - a > 5) { score -= 1; why.push("年增率比前一季度明顯下滑，成長在放緩。"); } }
    }
  }
  if (eps.length >= 2) {
    const e = eps[eps.length - 1], prev = eps[eps.length - 2];
    const [y, q] = [e[0].slice(0, 4), e[0].slice(-1)];
    const ly = eps.find((x) => x[0] === `${+y - 1}Q${q}`);
    facts.push(`<b>${esc(e[0])} 單季 EPS</b> ${fmt(e[1])} 元，季增 ${prev[1] ? signed((e[1] / prev[1] - 1) * 100, 1, "%") : "–"}${ly && ly[1] ? `、年增 ${signed((e[1] / ly[1] - 1) * 100, 1, "%")}` : ""}${isNum(e[2]) ? `；今年累計 ${fmt(e[2])} 元` : ""}。`);
    if (ly && ly[1] > 0) { const g = (e[1] / ly[1] - 1) * 100; if (g > 10) { score += 1; why.push("單季獲利比去年同期成長超過一成，獲利跟上營收。"); } else if (g < -10) { score -= 1; why.push("單季獲利比去年同期衰退超過一成，要注意毛利率或費用是否惡化。"); } }
  }
  const b = d.band;
  if (b && b.pe) {
    const pos = b.peNow <= b.pe[0] ? "便宜" : b.peNow >= b.pe[2] ? "昂貴" : b.peNow <= b.pe[1] ? "合理偏低" : "合理偏高";
    facts.push(`<b>評價</b>：本益比 ${fmt(b.peNow)} 倍，近一年區間約 ${fmt(b.pe[0])}～${fmt(b.pe[2])} 倍（中位數 ${fmt(b.pe[1])}）。`);
    why.push(`以近一年本益比區間來看，目前位於「${pos}」區。`);
    if (pos === "便宜") score += 1; if (pos === "昂貴") score -= 1;
  }
  const lastDiv = d.div[0];
  if (lastDiv && b && b.close) facts.push(`<b>股利</b>：最近一次現金股利 ${fmt(lastDiv[2])} 元，以目前股價計算殖利率約 ${fmt(lastDiv[2] / b.close * 100)}%（單次配發）。`);
  return `<div class="card narrative"><h3>財務解讀 ${verdict(score, ["轉弱", "穩定", "成長"])}</h3>
    <h4>最新財務狀況</h4><ul>${facts.map((f) => `<li>${f}</li>`).join("")}</ul>
    <h4>分析</h4><ul>${why.map((f) => `<li>${f}</li>`).join("")}</ul>
    <h4>結論</h4><p>${score >= 2 ? "基本面處於成長期：營收與獲利同步向上，評價若未過熱，屬於體質較佳的狀態。" : score <= -2 ? "基本面轉弱：營收或獲利動能下滑，需等待止穩訊號（例如月營收年增轉正）。" : "基本面穩定：沒有明顯加速或惡化，股價較依賴產業消息與評價變化。"}</p>
    <p class="muted small">依公開資訊觀測站月營收與季報數據自動判讀，每月／每季更新；非投資建議。</p></div>`;
}

/* 價位參考：本益比河流＋技術面關鍵價位 */
function bandBox(d) {
  const b = d.band;
  if (!b) return "";
  const rows = [];
  let pos = "", gauge = "";
  if (b.price) {
    const [lo, mid, hi] = b.price;
    pos = b.close <= lo ? "便宜區" : b.close >= hi ? "昂貴區" : b.close <= mid ? "合理偏低" : "合理偏高";
    const min = Math.min(lo * 0.85, b.close), max = Math.max(hi * 1.15, b.close);
    const x = (v) => ((v - min) / (max - min)) * 100;
    gauge = `<div class="gauge"><div class="g-z" style="left:0;width:${x(lo)}%;background:var(--down-soft)"></div><div class="g-z" style="left:${x(lo)}%;width:${x(hi) - x(lo)}%;background:var(--neutral-soft)"></div><div class="g-z" style="left:${x(hi)}%;right:0;background:var(--up-soft)"></div>
      <div class="g-t" style="left:${x(lo)}%">${fmt(lo, 0)}</div><div class="g-t" style="left:${x(mid)}%">${fmt(mid, 0)}</div><div class="g-t" style="left:${x(hi)}%">${fmt(hi, 0)}</div>
      <div class="g-now" style="left:${x(b.close)}%"><span>現價 ${fmt(b.close, 0)}</span></div></div>
      <div class="g-leg small"><span>便宜區</span><span>合理區</span><span>昂貴區</span></div>`;
    rows.push(["便宜價（近一年本益比 20 百分位 × 近四季 EPS）", `${fmt(lo)}（${fmt(b.pe[0])} 倍）`]);
    rows.push(["合理價（中位數）", `${fmt(mid)}（${fmt(b.pe[1])} 倍）`]);
    rows.push(["昂貴價（80 百分位）", `${fmt(hi)}（${fmt(b.pe[2])} 倍）`]);
  }
  const ma = b.ma || {};
  [["20", "月線 MA20"], ["60", "季線 MA60"], ["120", "半年線 MA120"], ["240", "年線 MA240"], ["300", "MA300"]].forEach(([k, n]) => { if (ma[k]) rows.push([n, `${fmt(ma[k])}（現價${b.close >= ma[k] ? "在上方" : "在下方"}）`]); });
  rows.push(["近一年最高／最低", `${fmt(b.hi)}／${fmt(b.lo)}`]);
  const sup = Object.values(ma).filter((v) => v && v < b.close).sort((a, c) => c - a)[0];
  const res = Object.values(ma).filter((v) => v && v > b.close).sort((a, c) => a - c)[0];
  return `<div class="card narrative"><h3>價位參考（系統自動計算）${pos ? ` <span class="badge ${pos === "便宜區" ? "bull" : pos === "昂貴區" ? "bear" : "neutral"}" style="font-size:14px">${pos}</span>` : ""}</h3>
    ${gauge}
    <table><tbody>${rows.map(([k, v]) => `<tr><td class="l">${k}</td><td class="num">${v}</td></tr>`).join("")}</tbody></table>
    <p class="small">${b.price ? `目前股價 ${fmt(b.close)} 位於近一年本益比區間的「${pos}」。` : "近四季 EPS 為負或資料不足，無法用本益比估價。"}${sup ? `下方最近的均線支撐約 ${fmt(sup)}；` : ""}${res ? `上方最近的均線壓力約 ${fmt(res)}。` : ""}</p>
    <p class="muted small">本益比區間只反映過去一年市場給的評價，產業循環或獲利大幅變動時會失準；買賣理由與詳細推論請看上方分析報告的「買賣評估」。資料日 ${esc(b.date)}，每日更新，非投資建議。</p></div>`;
}

/* 報告頁上方的官方數據圖（證交所／櫃買中心資料，自動產生） */
function officialCharts(d) {
  const out = [];
  const rev = d.rev.slice(-13);
  if (rev.length > 2) out.push(Charts.render({ type: "bar", title: "月營收", unit: "億元", labels: rev.map((x) => x[0].slice(2).replace("-", "/")), values: rev.map((x) => +((x[1] || 0) / 1e5).toFixed(1)), source: `公開資訊觀測站，至 ${rev[rev.length - 1][0]}` }));
  const yoy = rev.filter((x) => isNum(x[3]));
  if (yoy.length > 2) out.push(Charts.render({ type: "bar", signed: true, title: "月營收年增率", unit: "%", labels: yoy.map((x) => x[0].slice(2).replace("-", "/")), values: yoy.map((x) => +x[3].toFixed(1)), source: "公開資訊觀測站" }));
  const eps = d.eps.filter((x) => isNum(x[1])).slice(-8);
  if (eps.length > 2) out.push(Charts.render({ type: "bar", title: "單季 EPS", unit: "元", labels: eps.map((x) => x[0].slice(2)), values: eps.map((x) => x[1]), source: "公開資訊觀測站（單季＝累計相減）" }));
  return out.length ? `<div class="official">${out.join("")}</div>` : "";
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
  ["volR", "量比(今/20日均)", 2, true], ["bull", "均線排列", "bull"], ["hiGap", "距一年高點%", "pct", true],
  ["r60", "60日漲跌%", "pct", true], ["r240", "一年漲跌%", "pct", true], ["zone", "本益比位置", "zone"],
  ["rDate", "最近報告", "rep"],
];
const COLMAP = Object.fromEntries(COLS.map((c) => [c[0], c]));
const DEFAULT_COLS = ["code", "name", "ind", "c", "pct", "v", "pe", "dy", "revYoY", "eps4", "f5", "fS", "t5", "mb5", "b1000", "b1000w", "rDate"];
const PRESETS = [
  ["外資連買 ≥3 天", { fS_min: 3 }], ["投信連買 ≥3 天", { tS_min: 3 }], ["營收年增 >20%", { revYoY_min: 20 }],
  ["高殖利率 >5%", { dy_min: 5 }], ["低本益比 <12", { pe_min: 0.01, pe_max: 12 }], ["千張大戶週增", { b1000w_min: 0.3 }],
  ["融資減、外資買", { mb5_max: -1, f5_min: 1 }], ["站上季線", { above60: "1" }], ["有分析報告", { rep: "1" }],
  ["今天爆量（量比≥2）", { volR_min: 2 }], ["均線多頭排列", { bull: "1" }], ["接近一年新高（3% 內）", { hiGap_min: -3 }],
  ["本益比便宜區", { zone: "-1" }], ["好股價跌深（營收年增>15%、距高點>25%）", { revYoY_min: 15, hiGap_max: -25 }],
];
const ZONE_TXT = { "-1": ["便宜", "bull"], 0: ["合理", "neutral"], 1: ["昂貴", "bear"] };
function cell(r, c) {
  const [k, , f] = c, v = r[k];
  if (f === "code") return `<td class="l"><a class="code" href="#/stock/${v}">${v}</a></td>`;
  if (f === "text") return `<td class="l">${k === "name" ? `<a href="#/stock/${r.code}">${esc(v)}</a>` : esc(v)}</td>`;
  if (f === "pct") return `<td>${signed(v, 2)}</td>`;
  if (f === "s0") return `<td>${signed(v, 0)}</td>`;
  if (f === "s2") return `<td>${signed(v, 2)}</td>`;
  if (f === "yi") return `<td class="num">${yi(v)}</td>`;
  if (f === "bull") return `<td>${v === 1 ? '<span class="up">多頭</span>' : v === -1 ? '<span class="down">空頭</span>' : v === 0 ? '<span class="muted">糾結</span>' : "–"}</td>`;
  if (f === "zone") return `<td>${v == null ? "–" : `<span class="badge ${ZONE_TXT[v][1]}">${ZONE_TXT[v][0]}</span>`}</td>`;
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
        <div class="field"><label>均線</label><select id="s-above60"><option value="">不限</option><option value="1">收盤在季線(60日)上</option><option value="2">收盤在月線(20日)上</option><option value="-1">收盤在季線下</option><option value="3">收盤在半年線(120日)上</option></select></div>
        <div class="field"><label>均線排列</label><select id="s-bull"><option value="">不限</option><option value="1">多頭排列</option><option value="0">糾結</option><option value="-1">空頭排列</option></select></div>
        <div class="field"><label>本益比位置（近一年）</label><select id="s-zone"><option value="">不限</option><option value="-1">便宜區</option><option value="0">合理區</option><option value="1">昂貴區</option></select></div>
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
  const simple = ["q", "mkt", "ind", "group", "rep", "above60", "bull", "zone"];
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
      if (v.above60 === "3" && !(r.c > r.ma120)) return false;
      if (v.bull !== "" && String(r.bull) !== v.bull) return false;
      if (v.zone !== "" && String(r.zone) !== v.zone) return false;
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
/* K 線設定：預設均線、顏色（固定順序）、日/週/月 K 合併 */
const DEFAULT_MA = [5, 20, 60, 120, 300];
const MA_COLORS = ["#e0a100", "#7a5af8", "#0ba5ec", "#e87ba4", "#1baf7a", "#eb6834", "#2a78d6", "#8a8a8a"];
const MA_NAMES = { d: { 5: "週線", 20: "月線", 60: "季線", 120: "半年線", 240: "年線" }, w: {}, m: {} };
function loadKPrefs() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem("tw-kprefs") || "null"); } catch {}
  if (!p || !Array.isArray(p.ma)) p = { p: "d", ma: DEFAULT_MA.map((n) => ({ n, on: true })) };
  if (!["d", "w", "m"].includes(p.p)) p.p = "d";
  return p;
}
function saveKPrefs(p) { try { localStorage.setItem("tw-kprefs", JSON.stringify(p)); } catch {} }
function aggK(k, p) {
  if (p === "d") return k;
  const key = (date) => {
    if (p === "m") return date.slice(0, 7);
    const t = new Date(date + "T00:00:00Z"), dow = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dow);
    return t.toISOString().slice(0, 10);
  };
  const out = [];
  let cur = null, ck = null;
  for (const x of k) {
    const kk = key(x[0]);
    if (kk !== ck) {
      if (cur) out.push(cur);
      ck = kk;
      cur = [x[0], x[1] ?? x[4], x[2] ?? x[4], x[3] ?? x[4], x[4], x[5] || 0];
    } else {
      cur[2] = Math.max(cur[2], x[2] ?? x[4]); cur[3] = Math.min(cur[3], x[3] ?? x[4]); cur[4] = x[4]; cur[5] += x[5] || 0;
    }
  }
  if (cur) out.push(cur);
  return out;
}
const TDCC_LV = ["1-999股", "1-5張", "5-10張", "10-15張", "15-20張", "20-30張", "30-40張", "40-50張", "50-100張", "100-200張", "200-400張", "400-600張", "600-800張", "800-1000張", "1000張以上"];

async function pageStock(parts, q) {
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
      <a class="star" href="#/portfolio?add=${code}">＋ 記一筆交易</a>
      <a class="star" href="#/compare?c=${code}">⇄ 比較</a>
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
      <button data-t="rep" class="on">分析${reps.length ? ` (${reps.length})` : ""}</button><button data-t="k">K 線</button><button data-t="chip">籌碼</button><button data-t="fin">財務</button>
      <button data-t="tdcc">股權分散</button><button data-t="info">公司資料</button>
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
    T().innerHTML = `<div class="card">
      <div class="kctl">
        <div class="seg" id="kper"><button data-p="d">日K</button><button data-p="w">週K</button><button data-p="m">月K</button></div>
        <div class="ma-pick" id="mapick"></div>
        <form class="ma-add" id="maadd"><input type="number" min="2" max="500" placeholder="天數" id="maN" aria-label="自訂均線天數"><button class="btn sm">＋ 新增均線</button></form>
      </div>
      <div class="kinfo" id="kinfo"></div>
      <div class="legend" id="kma"></div>
      <div class="chart" id="ck"></div>
      <div class="vol-head small"><span>成交量（張）</span><b class="num" id="kvol"></b></div>
      <div class="chart vol" id="cv"></div>
      <div class="muted small" id="knote"></div></div>`;
    const per = { d: "日", w: "週", m: "月" };
    let st0 = loadKPrefs();
    $$("#kper button").forEach((b) => b.addEventListener("click", () => { st0.p = b.dataset.p; saveKPrefs(st0); drawK(); }));
    $("#maadd").addEventListener("submit", (e) => {
      e.preventDefault();
      const n = Math.round(+$("#maN").value);
      if (n >= 2 && n <= 500 && !st0.ma.some((m) => m.n === n)) { st0.ma.push({ n, on: true }); st0.ma.sort((a, b) => a.n - b.n); saveKPrefs(st0); drawK(); }
      $("#maN").value = "";
    });
    drawK();

    function drawK() {
      S.charts.forEach((c) => { try { c.remove(); } catch {} }); S.charts = [];
      const K = aggK(d.k, st0.p);
      $$("#kper button").forEach((b) => b.classList.toggle("on", b.dataset.p === st0.p));
      const MAS = st0.ma.map((m, j) => ({ ...m, color: MA_COLORS[j % MA_COLORS.length], name: `MA${m.n}${MA_NAMES[st0.p][m.n] ? " " + MA_NAMES[st0.p][m.n] : ""}` }));
      $("#mapick").innerHTML = MAS.map((m, j) => `<label class="ma-chip${m.on ? " on" : ""}" style="--c:${m.color}"><input type="checkbox" data-j="${j}" ${m.on ? "checked" : ""}><i></i>${m.n}${per[st0.p]}${DEFAULT_MA.includes(m.n) ? "" : `<button type="button" class="ma-x" data-x="${j}" title="移除">×</button>`}</label>`).join("");
      $$("#mapick input").forEach((cb) => cb.addEventListener("change", () => { st0.ma[+cb.dataset.j].on = cb.checked; saveKPrefs(st0); drawK(); }));
      $$("#mapick .ma-x").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); st0.ma.splice(+b.dataset.x, 1); saveKPrefs(st0); drawK(); }));
      const on = MAS.filter((m) => m.on);
      const maData = on.map((m) => sma(K, m.n));
      const maAt = maData.map((s) => Object.fromEntries(s.map((p) => [p.time, p.value])));
      const idx = Object.fromEntries(K.map((x, i) => [x[0], i]));
      const short = on.filter((m) => m.n > K.length).map((m) => `MA${m.n}`);
      $("#knote").textContent = `紅漲綠跌。滑鼠移到 K 棒上可看明細，兩張圖同步捲動。勾選設定會記在這台瀏覽器。${short.length ? `目前只有 ${K.length} 根${per[st0.p]}K，${short.join("、")} 資料不足暫時畫不出來。` : ""}`;
      tabKDraw(K, on, maData, maAt, idx, per[st0.p]);
    }
  }

  function tabKDraw(K, MAS, maData, maAt, idx, unit) {
    const up = css("--up"), dn = css("--down");
    const info = (i) => {
      const x = K[i], p = i > 0 ? K[i - 1][4] : null;
      const chg = p ? x[4] - p : null, pct = p ? (chg / p) * 100 : null, amp = p && x[2] != null ? ((x[2] - x[3]) / p) * 100 : null;
      const col = (v) => (v == null ? "" : v > p ? "up" : v < p ? "down" : "");
      const cell = (k, v) => `<div><span class="k">${k}</span><span class="v num">${v}</span></div>`;
      $("#kinfo").innerHTML = `<div class="kdate num">${x[0]}${unit !== "日" ? `<span class="muted small">（${unit}K 起始日）</span>` : ""}</div>
        ${cell("開盤", `<span class="${col(x[1])}">${fmt(x[1])}</span>`)}${cell("最高", `<span class="${col(x[2])}">${fmt(x[2])}</span>`)}
        ${cell("最低", `<span class="${col(x[3])}">${fmt(x[3])}</span>`)}${cell("收盤", `<span class="${col(x[4])}">${fmt(x[4])}</span>`)}
        ${cell("漲跌", signed(chg))}${cell("幅度", signed(pct, 2, "%"))}${cell("振幅", amp == null ? "–" : fmt(amp) + "%")}
        ${cell("成交量", fint(x[5]) + " 張")}${cell(unit === "日" ? "昨收" : "前期收盤", fmt(p))}`;
      $("#kma").innerHTML = MAS.map((m, j) => `<span><i style="background:${m.color}"></i>${m.name} <b class="num">${maAt[j][x[0]] != null ? fmt(maAt[j][x[0]]) : "–"}</b></span>`).join("");
      $("#kvol").textContent = `${x[0]}　${fint(x[5])} 張`;
    };
    const c = mkChart($("#ck"), { timeScale: { visible: false, borderColor: css("--line") } });
    const cs = c.addCandlestickSeries({ upColor: up, downColor: dn, borderUpColor: up, borderDownColor: dn, wickUpColor: up, wickDownColor: dn });
    cs.setData(K.map((x) => ({ time: x[0], open: x[1] ?? x[4], high: x[2] ?? x[4], low: x[3] ?? x[4], close: x[4] })));
    MAS.forEach((m, j) => {
      if (maData[j].length) c.addLineSeries({ color: m.color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }).setData(maData[j]);
    });
    // 成交量獨立一張圖，與 K 線同步
    const v = mkChart($("#cv"));
    const vs = v.addHistogramSeries({ priceFormat: { type: "volume" }, priceLineVisible: false });
    vs.setData(K.map((x, i) => ({ time: x[0], value: x[5] || 0, color: (i && x[4] < K[i - 1][4] ? dn : up) + "aa" })));
    v.priceScale("right").applyOptions({ scaleMargins: { top: 0.1, bottom: 0 }, minimumWidth: 72 });
    c.priceScale("right").applyOptions({ minimumWidth: 72 });
    let syncing = false;
    const sync = (from, to) => from.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (!r || syncing) return; syncing = true; to.timeScale().setVisibleLogicalRange(r); syncing = false; });
    sync(c, v); sync(v, c);
    const n = K.length;
    c.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 130), to: n + 2 });
    info(n - 1);
    const onMove = (p) => { const i = p && p.time != null ? idx[p.time] : undefined; info(i == null ? n - 1 : i); };
    c.subscribeCrosshairMove(onMove); v.subscribeCrosshairMove(onMove);
  }

  function tabChip() {
    if (!d.chip.length) { T().innerHTML = noData("尚無籌碼資料"); return; }
    T().innerHTML = `
      <div class="card"><div class="seg" id="who"><button data-i="1" class="on">外資</button><button data-i="2">投信</button><button data-i="3">自營商</button><button data-i="0">三大法人合計</button></div>
        <div class="muted small">每日買賣超（張）</div><div class="chart sm" id="cc"></div></div>
      <div class="official" style="margin-top:14px">
        <div class="card"><h3>融資餘額（張）</h3><div class="chart sm" id="cm"></div></div>
        <div class="card"><h3>融券餘額（張）</h3><div class="chart sm" id="cs2"></div></div>
      </div>
      <h2>近 20 日明細</h2>
      <div class="tbl-wrap"><table><thead><tr><th class="l">日期</th><th>外資</th><th>投信</th><th>自營商</th><th>合計</th><th>融資餘額</th><th>融券餘額</th></tr></thead>
      <tbody>${d.chip.slice(-20).reverse().map((x) => `<tr><td class="l num">${x[0]}</td><td>${signed(x[1], 0)}</td><td>${signed(x[2], 0)}</td><td>${signed(x[3], 0)}</td><td>${signed((x[1] || 0) + (x[2] || 0) + (x[3] || 0), 0)}</td><td class="num">${fint(x[4])}</td><td class="num">${fint(x[5])}</td></tr>`).join("")}</tbody></table></div>
      ${chipNarrative(d, st)}`;
    const c = mkChart($("#cc"));
    const hs = c.addHistogramSeries({ priceLineVisible: false });
    const draw = (i) => {
      hs.setData(d.chip.map((x) => { const v = i ? x[i] : (x[1] || 0) + (x[2] || 0) + (x[3] || 0); return { time: x[0], value: v || 0, color: v >= 0 ? css("--up") : css("--down") }; }));
      c.timeScale().fitContent();
    };
    draw(1);
    $$("#who button").forEach((b) => b.addEventListener("click", () => { $$("#who button").forEach((x) => x.classList.toggle("on", x === b)); draw(+b.dataset.i); }));
    const m = mkChart($("#cm"));
    m.addLineSeries({ color: css("--s1"), lineWidth: 2 }).setData(d.chip.filter((x) => isNum(x[4])).map((x) => ({ time: x[0], value: x[4] })));
    m.timeScale().fitContent();
    const m2 = mkChart($("#cs2"));
    m2.addLineSeries({ color: css("--s2"), lineWidth: 2 }).setData(d.chip.filter((x) => isNum(x[5])).map((x) => ({ time: x[0], value: x[5] })));
    m2.timeScale().fitContent();
  }

  function tabFin() {
    const rev = d.rev, eps = d.eps;
    const charts = officialCharts(d);
    T().innerHTML = `
      ${charts || noData("尚無月營收或 EPS 資料")}
      <h2>月營收明細</h2>
      <div class="tbl-wrap"><table><thead><tr><th class="l">年月</th><th>營收(億)</th><th>月增%</th><th>年增%</th><th>累計年增%</th></tr></thead>
        <tbody>${rev.slice(-24).reverse().map((x) => `<tr><td class="l num">${x[0]}</td><td class="num">${yi(x[1])}</td><td>${signed(x[2], 1)}</td><td>${signed(x[3], 1)}</td><td>${signed(x[4], 1)}</td></tr>`).join("")}</tbody></table></div>
      <h2>每季 EPS（元）</h2>
      <div class="tbl-wrap"><table><thead><tr><th class="l">季度</th><th>單季 EPS</th><th>年度累計 EPS</th><th>累計營收(億)</th><th>累計營業利益(億)</th><th>累計稅後淨利(億)</th></tr></thead>
        <tbody>${eps.slice().reverse().map((x) => `<tr><td class="l num">${x[0]}</td><td class="num">${fmt(x[1])}</td><td class="num">${fmt(x[2])}</td><td class="num">${yi(x[3])}</td><td class="num">${yi(x[4])}</td><td class="num">${yi(x[5])}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">尚無資料</td></tr>`}</tbody></table></div>
      <h2>股利</h2>
      <div class="tbl-wrap"><table><thead><tr><th class="l">股利年度</th><th class="l">期別</th><th>現金股利(元)</th><th>股票股利(元)</th><th class="l">董事會日期</th></tr></thead>
        <tbody>${d.div.map((x) => `<tr><td class="l num">${x[0]}</td><td class="l">${esc(x[1])}</td><td class="num">${fmt(x[2], 4)}</td><td class="num">${fmt(x[3], 4)}</td><td class="l num">${esc(x[4])}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">尚無資料</td></tr>`}</tbody></table></div>
      <p class="muted small">本益比、股價淨值比、殖利率為交易所每日公布值；官方季報 EPS 為「年度累計」，單季數字由累計相減推得。</p>
      ${finNarrative(d, st)}`;
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
    </tbody></table></div>
    ${peersTable(code)}`;
  }

  function tabRep() {
    renderAnalysis(T(), code, d, q && q.get("r"));
  }
  tabRep();
}

/* ------------------------------------------------------------ 圖表點一下放大、再點一下縮回 */
document.addEventListener("click", (e) => {
  if (e.target.closest("details, summary, a, button, input")) return;
  const fig = e.target.closest("figure.cl");
  const open = $("figure.cl.zoom");
  if (open && open !== fig) { open.classList.remove("zoom"); document.body.classList.remove("zoomed"); return; }
  if (!fig) return;
  const on = fig.classList.toggle("zoom");
  document.body.classList.toggle("zoomed", on);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { const z = $("figure.cl.zoom"); if (z) { z.classList.remove("zoom"); document.body.classList.remove("zoomed"); } }
});

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
