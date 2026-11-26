/* מה בא לי – לוח בקרה: פילוח וניתוח משפחות (v1.60.0).
   Reads the "analytics" op (server 1.56.0): anonymous family profiles of families that allowed "פרטים כלליים לניתוח" and their
   place events. All slicing happens here, in the browser, so filters answer instantly. Uses PL (places.json) from admin.js. */
"use strict";
const AN = { raw: null, days: 90, f: { city: "", rg: "", kb: "", dog: "", md: "", kind: "" }, place: 0, near: 30, loading: false };
const KIND_N = { park: "פארקים וגינות", nature: "טבע ומסלולים", culture: "תרבות ומוזיאונים", water: "מים וחופים", play: "משחק ואטרקציות", animals: "בעלי חיים", market: "שווקים" };
const RG_N = { north: "צפון וגולן", haifa: "חיפה והקריות", center: "מרכז ושרון", jerusalem: "ירושלים והסביבה", south: "דרום וים המלח", eilat: "אילת והערבה", "": "לא ידוע" };
const MD_N = { car: "רכב", transit: "תחבורה ציבורית", walk: "הליכה" };
const ACC_N = { none: "ללא", stroller: "עגלה", wheel: "כיסא גלגלים" };
const EVW = { place: 1, nav: 3, want: 2, day_add: 2, visited: 4, like: 3, hide: 0, share: 1 };   // engagement weights for "top places"
const WD = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const anKm = (a, b) => { const r = x => x * Math.PI / 180, dLa = r(b.la - a.la), dLo = r(b.lo - a.lo), h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.la)) * Math.cos(r(b.la)) * Math.sin(dLo / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const anDrive = d => { const v = Math.min(80, 14 + 1.8 * d); return Math.max(5, Math.round((5 + 60 * d * 1.3 / v) / 5) * 5); };   // same estimate as the app (v1.54.1)
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const med = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, b) => b ? Math.round(100 * a / b) + "%" : "–";

/* ---------- data ---------- */
async function anLoad(force) {
  if (AN.loading || (AN.raw && !force)) return; AN.loading = true;
  $("#anMsg").textContent = "טוען נתוני פילוח…";
  try {
    await plLoad();
    const r = await call("analytics", { days: AN.days });
    if (!r || !r.ok) { $("#anMsg").textContent = errText(r, "טעינת הפילוח"); return; }
    const fp = new Map(r.fp.map(x => [x[0], { id: x[0], upd: x[1], c: x[2] || "לא ידוע", rg: x[3] || "", la: x[4], lo: x[5], ad: x[6], nk: x[7], kb: x[8], dog: x[9], acc: x[10], md: x[11], dr: x[12], w: x[13] }]));
    const byId = new Map((PL.list || []).map(p => [p.id, p]));
    const ev = r.ev.map(x => ({ t: x[0] * 1000, dev: x[1], e: x[2], pid: x[3], m: x[4], n: x[5], p: byId.get(x[3]) || null }));
    AN.raw = { fp, ev, byId, cut: r.cut };
    anFilters(); anRender();
  } catch (e) { $("#anMsg").textContent = "טעינת הפילוח נכשלה: " + (e && e.message || e); }
  finally { AN.loading = false; }
}
/* families and events that match the filters */
function anSlice() {
  const { fp, ev } = AN.raw, f = AN.f;
  const fam = [...fp.values()].filter(x => (!f.city || x.c === f.city) && (!f.rg || x.rg === f.rg) && (!f.kb || String(x.kb).split(",").includes(f.kb))
    && (f.dog === "" || String(x.dog) === f.dog) && (!f.md || x.md === f.md));
  const ids = new Set(fam.map(x => x.id));
  const e = ev.filter(x => ids.has(x.dev) && (!f.kind || (x.p && x.p.k === f.kind)));
  return { fam, ids, e };
}

/* ---------- filters ---------- */
function anOpts(sel, pairs, cur) { $(sel).innerHTML = pairs.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(l)}</option>`).join(""); }
function anFilters() {
  const fams = [...AN.raw.fp.values()], cnt = {};
  fams.forEach(x => { cnt[x.c] = (cnt[x.c] || 0) + 1; });
  anOpts("#anCity", [["", "כל היישובים"], ...Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([c, n]) => [c, `${c} (${n})`])], AN.f.city);
  anOpts("#anRg", [["", "כל האזורים"], ...Object.entries(RG_N).filter(([k]) => k).map(([k, v]) => [k, v])], AN.f.rg);
  anOpts("#anKb", [["", "כל הגילאים"], ["0-2", "0–2"], ["3-5", "3–5"], ["6-9", "6–9"], ["10-13", "10–13"], ["14+", "14+"]], AN.f.kb);
  anOpts("#anDog", [["", "עם או בלי כלב"], ["1", "עם כלב"], ["0", "בלי כלב"]], AN.f.dog);
  anOpts("#anMd", [["", "כל אמצעי ההגעה"], ...Object.entries(MD_N)], AN.f.md);
  anOpts("#anKind", [["", "כל סוגי המקומות"], ...Object.entries(KIND_N)], AN.f.kind);
}

/* ---------- render ---------- */
function anRender() {
  if (!AN.raw) return;
  const { fam, e } = anSlice(), all = AN.raw.fp.size;
  $("#anMsg").textContent = all ? `${nf.format(fam.length)} מתוך ${nf.format(all)} משפחות שאישרו פילוח · ${nf.format(e.length)} פעולות על מקומות ב-${AN.days} ימים${AN.raw.cut ? " (הוצגו 60,000 האחרונות)" : ""}.`
    : "עוד אין משפחות שאישרו \"פרטים כלליים לניתוח\". הנתונים יופיעו כאן אחרי שמשתמשים יאשרו (באפליקציה מגרסה 1.60).";
  const act = new Set(e.map(x => x.dev)), nav = e.filter(x => x.e === "nav" || x.e === "visited"), mins = nav.filter(x => x.m >= 0).map(x => x.m);
  const k = [[fam.length, "משפחות בפילוח"], [act.size, "פעילות בתקופה"], [Math.round(avg(fam.map(x => x.dr).filter(Boolean))) + " דק׳", "זמן נסיעה מועדף (ממוצע)"],
    [mins.length ? Math.round(avg(mins)) + " דק׳" : "–", "נסיעה בפועל ליעד (ממוצע)"], [mins.length ? Math.round(med(mins)) + " דק׳" : "–", "נסיעה בפועל (חציון)"],
    [fam.length ? (avg(fam.map(x => x.nk))).toFixed(1) : "–", "ילדים למשפחה"], [pct(fam.filter(x => x.dog).length, fam.length), "עם כלב"]];
  $("#anKpis").innerHTML = k.map(([v, l]) => `<div class="kpi"><b>${typeof v === "number" ? nf.format(v) : esc(v)}</b><span>${esc(l)}</span></div>`).join("");
  const top = anTopPlaces(e);
  anCities(fam); anMap(fam, top); anTop(top); anBiz(top); anOrigins(top); anUntapped(fam, e); anDist(fam, e);
}
/* places ranked by engagement, with families, minutes and home towns */
function anTopPlaces(e) {
  const fpm = AN.raw.fp, m = new Map();
  e.forEach(x => { if (!x.pid) return; const r = m.get(x.pid) || { pid: x.pid, p: x.p, n: (x.p && x.p.n) || x.n, c: { place: 0, nav: 0, want: 0, day_add: 0, visited: 0, like: 0, hide: 0, share: 0 }, fam: new Set(), mins: [], from: {} };
    if (x.e in r.c) r.c[x.e]++; r.fam.add(x.dev); if ((x.e === "nav" || x.e === "visited") && x.m >= 0) r.mins.push(x.m);
    const h = fpm.get(x.dev); if (h) (r.from[h.c] = r.from[h.c] || new Set()).add(x.dev); m.set(x.pid, r); });
  return [...m.values()].map(r => Object.assign(r, { score: Object.entries(r.c).reduce((a, [k, v]) => a + (EVW[k] || 0) * v, 0) - 3 * r.c.hide,
    origins: Object.entries(r.from).map(([c, s]) => [c, s.size]).sort((a, b) => b[1] - a[1]) })).filter(r => r.score > 0).sort((a, b) => b.score - a.score || b.fam.size - a.fam.size);
}
function anCities(fam) {
  const c = {}; fam.forEach(x => { c[x.c] = (c[x.c] || 0) + 1; });
  hbars("#anCities", Object.entries(c).sort((a, b) => b[1] - a[1]));
}
const kindOf = p => p ? (KIND_N[p.k] || p.k) : "";
const biz = p => p && !p.osm && ((+p.a || 0) > 0 || (+p.ch || 0) > 0);
function anTop(top) {
  const rows = top.slice(0, 25);
  $("#anTop").innerHTML = rows.length ? `<table><thead><tr><th>#</th><th>מקום</th><th>סוג</th><th class="num">משפחות</th><th class="num">פרטים</th><th class="num">ניווט</th><th class="num">רוצים לבקר</th><th class="num">ביקרנו</th><th class="num">👍</th><th class="num">👎</th><th class="num">נסיעה (ממוצע)</th><th>מגיעים בעיקר מ…</th></tr></thead><tbody>${rows.map((r, i) =>
    `<tr><td class="num">${i + 1}</td><td><button type="button" class="lnk" data-anp="${r.pid}">${esc(r.n)}</button>${r.p && r.p.c ? `<div class="small">${esc(r.p.c)}</div>` : ""}</td><td>${esc(kindOf(r.p))}</td><td class="num">${r.fam.size}</td><td class="num">${r.c.place}</td><td class="num">${r.c.nav}</td><td class="num">${r.c.want}</td><td class="num">${r.c.visited}</td><td class="num">${r.c.like}</td><td class="num">${r.c.hide}</td><td class="num">${r.mins.length ? Math.round(avg(r.mins)) + " דק׳" : "–"}</td><td>${esc(r.origins.slice(0, 3).map(([c, n]) => `${c} (${n})`).join(" · "))}</td></tr>`).join("")}</tbody></table>`
    : '<p class="empty">אין נתונים לסינון הזה</p>';
}
function anBiz(top) {
  const rows = top.filter(r => biz(r.p)).slice(0, 15);
  $("#anBiz").innerHTML = rows.length ? `<table><thead><tr><th>עסק</th><th>יישוב</th><th class="num">מחיר כניסה</th><th class="num">משפחות</th><th class="num">ניווט</th><th class="num">ביקרנו</th><th class="num">המרה לניווט</th><th>יישובי המוצא המובילים</th></tr></thead><tbody>${rows.map(r =>
    `<tr><td><button type="button" class="lnk" data-anp="${r.pid}">${esc(r.n)}</button></td><td>${esc(r.p.c || "")}</td><td class="num">${r.p.a ? "₪" + r.p.a : "–"}${r.p.ch ? ` / ₪${r.p.ch}` : ""}</td><td class="num">${r.fam.size}</td><td class="num">${r.c.nav}</td><td class="num">${r.c.visited}</td><td class="num">${pct(r.c.nav, r.c.place)}</td><td>${esc(r.origins.slice(0, 4).map(([c, n]) => `${c} (${n})`).join(" · "))}</td></tr>`).join("")}</tbody></table>`
    : '<p class="empty">אין עדיין פעילות על מקומות בתשלום בסינון הזה</p>';
}
/* where families come from, for one place */
function anOrigins(top) {
  const sel = $("#anPlace"), list = top.slice(0, 40);
  if (!AN.place || !list.some(r => r.pid === AN.place)) AN.place = list.length ? list[0].pid : 0;
  sel.innerHTML = list.map(r => `<option value="${r.pid}"${r.pid === AN.place ? " selected" : ""}>${esc(r.n)}</option>`).join("") || '<option value="">אין מקומות</option>';
  const r = list.find(x => x.pid === AN.place);
  if (!r) { $("#anFrom").innerHTML = '<li class="empty">אין נתונים</li>'; $("#anFromSum").textContent = ""; return; }
  hbars("#anFrom", r.origins);
  const fams = [...r.fam].map(id => AN.raw.fp.get(id)).filter(Boolean), kb = {};
  fams.forEach(x => String(x.kb).split(",").filter(Boolean).forEach(b => { kb[b] = (kb[b] || 0) + 1; }));
  $("#anFromSum").textContent = `${r.fam.size} משפחות · נסיעה ממוצעת ${r.mins.length ? Math.round(avg(r.mins)) + " דק׳" : "לא ידועה"} · עם כלב ${pct(fams.filter(x => x.dog).length, fams.length)} · גילאים: ${Object.entries(kb).sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b} (${n})`).join(", ") || "–"}`;
}
/* places close to where the families live that none of them engage with */
function anUntapped(fam, e) {
  const box = $("#anUntap");
  if (!fam.length || !PL.list) { box.innerHTML = '<p class="empty">אין משפחות בסינון</p>'; return; }
  const towns = {}; fam.forEach(x => { const t = towns[x.c] = towns[x.c] || { c: x.c, la: 0, lo: 0, n: 0 }; t.la += x.la; t.lo += x.lo; t.n++; });
  const T = Object.values(towns).map(t => ({ c: t.c, n: t.n, la: t.la / t.n, lo: t.lo / t.n })).sort((a, b) => b.n - a.n).slice(0, 8);
  const seen = new Set(e.map(x => x.pid)), hid = new Set((PL.ov && PL.ov.hid) || []);
  const near = new Map();
  PL.list.forEach(p => { if (p.la == null || p.anon || p.dup || hid.has(p.id) || (AN.f.kind && p.k !== AN.f.kind)) return;
    let best = null; T.forEach(t => { const m = anDrive(anKm(t, p)); if (m <= AN.near && (!best || m < best.m)) best = { t, m }; });
    if (best) near.set(p.id, { p, ...best }); });
  const reached = [...near.values()].filter(x => seen.has(x.p.id)).length, cold = [...near.values()].filter(x => !seen.has(x.p.id));
  cold.sort((a, b) => (a.p.osm ? 1 : 0) - (b.p.osm ? 1 : 0) || (biz(b.p) ? 1 : 0) - (biz(a.p) ? 1 : 0) || a.m - b.m);
  $("#anUntapSum").textContent = `${nf.format(near.size)} מקומות עד ${AN.near} דק׳ מ-${T.length} היישובים העיקריים בסינון; ${nf.format(reached)} מהם (${pct(reached, near.size)}) קיבלו פעילות, ${nf.format(cold.length)} לא. מקומות מהטבלה המקורית ועסקים מופיעים ראשונים.`;
  box.innerHTML = cold.length ? `<table><thead><tr><th>מקום</th><th>סוג</th><th>יישוב</th><th>הכי קרוב ל…</th><th class="num">נסיעה משוערת</th><th>מקור</th></tr></thead><tbody>${cold.slice(0, 30).map(x =>
    `<tr><td>${esc(x.p.n)}</td><td>${esc(kindOf(x.p))}</td><td>${esc(x.p.c || "")}</td><td>${esc(x.t.c)} (${x.t.n})</td><td class="num">${x.m} דק׳</td><td>${x.p.osm ? "OpenStreetMap" : biz(x.p) ? "עסק" : "הטבלה המקורית"}</td></tr>`).join("")}</tbody></table>` : '<p class="empty">כל המקומות הקרובים קיבלו פעילות</p>';
}
/* distributions */
function anDist(fam, e) {
  const kc = {}; e.forEach(x => { if (x.p && (x.e === "place" || x.e === "nav")) { const k = kindOf(x.p); kc[k] = (kc[k] || 0) + 1; } });
  hbars("#anKinds", Object.entries(kc).sort((a, b) => b[1] - a[1]));
  const B = [[0, 15, "עד 15 דק׳"], [16, 30, "16–30"], [31, 45, "31–45"], [46, 60, "46–60"], [61, 90, "61–90"], [91, 999, "יותר משעה וחצי"]];
  const bc = (a, f) => B.map(b => [b[2], a.filter(v => v >= b[0] && v <= b[1]).length]).filter(r => r[1] || f);
  hbars("#anMins", bc(e.filter(x => (x.e === "nav" || x.e === "visited") && x.m >= 0).map(x => x.m), 1));
  hbars("#anPref", bc(fam.map(x => x.dr).filter(Boolean), 1));
  const kb = {}; fam.forEach(x => String(x.kb).split(",").filter(Boolean).forEach(b => { kb[b] = (kb[b] || 0) + 1; }));
  hbars("#anKbc", ["0-2", "3-5", "6-9", "10-13", "14+"].map(b => [b, kb[b] || 0]));
  const wd = [0, 0, 0, 0, 0, 0, 0]; e.forEach(x => { wd[new Date(x.t).getDay()]++; });
  hbars("#anWd", WD.map((d, i) => [d, wd[i]]));
  const md = {}; fam.forEach(x => { const k = MD_N[x.md] || x.md; md[k] = (md[k] || 0) + 1; }); hbars("#anMd2", Object.entries(md).sort((a, b) => b[1] - a[1]));
  const ac = {}; fam.forEach(x => { const k = ACC_N[x.acc] || x.acc; ac[k] = (ac[k] || 0) + 1; }); hbars("#anAcc", Object.entries(ac).sort((a, b) => b[1] - a[1]));
  const n = t => e.filter(x => x.e === t).length;
  hbars("#anFunnel", [["פתיחת פרטים", n("place")], ["רוצים לבקר", n("want")], ["ניווט", n("nav")], ["ביקרנו", n("visited")], ["👍 להציע שוב", n("like")], ["👎 הסתרה", n("hide")]]);
}
/* map: every place as a faint dot (it draws the country), homes in teal, top destinations in orange, links between them */
function anMap(fam, top) {
  const cv = $("#anMap"), box = cv.parentElement; cv.style.width = "0px"; const W = Math.min(420, Math.max(240, (box.clientWidth || 360) - 16)), dpr = window.devicePixelRatio || 1;
  const towns = {}; fam.forEach(f => { const t = towns[f.c] = towns[f.c] || { la: 0, lo: 0, n: 0, c: f.c }; t.la += f.la; t.lo += f.lo; t.n++; });
  const T = Object.values(towns).map(t => ({ c: t.c, n: t.n, la: t.la / t.n, lo: t.lo / t.n })), tm = new Map(T.map(t => [t.c, t]));
  const D = top.filter(r => r.p && r.p.la != null).slice(0, 15);
  /* zoom to where the families and their destinations are (whole country when there is nothing yet) */
  const pts = T.concat(D.map(r => r.p)); let la0 = 33.4, la1 = 29.45, lo0 = 34.2, lo1 = 35.95;
  if (pts.length) { la0 = Math.max(...pts.map(p => p.la)); la1 = Math.min(...pts.map(p => p.la)); lo0 = Math.min(...pts.map(p => p.lo)); lo1 = Math.max(...pts.map(p => p.lo));
    const pad = Math.max(0.08, (la0 - la1) * 0.12); la0 += pad; la1 -= pad; lo0 -= pad; lo1 += pad; }
  const K = Math.cos((la0 + la1) / 2 * Math.PI / 180); let sLa = la0 - la1, sLo = (lo1 - lo0) * K;
  const ar = Math.min(1.8, Math.max(0.9, sLa / sLo));                       // height / width of the drawing
  if (sLa / sLo > ar) { const w = sLa / ar, c = (lo0 + lo1) / 2; lo0 = c - w / K / 2; lo1 = c + w / K / 2; } else { const h = sLo * ar, c = (la0 + la1) / 2; la0 = c + h / 2; la1 = c - h / 2; }
  const H = Math.round(W * ar); cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const css = getComputedStyle(document.documentElement), col = v => css.getPropertyValue(v).trim();
  const x = lo => (lo - lo0) / (lo1 - lo0) * W, y = la => (la0 - la) / (la0 - la1) * H;
  g.fillStyle = col("--muted"); g.globalAlpha = 0.35;
  (PL.list || []).forEach(p => { if (p.la != null && p.la < la0 && p.la > la1 && p.lo > lo0 && p.lo < lo1) g.fillRect(x(p.lo), y(p.la), 1.5, 1.5); });
  const maxL = Math.max(1, ...D.flatMap(r => r.origins.map(o => o[1])));
  g.strokeStyle = col("--warn"); D.forEach(r => r.origins.slice(0, 5).forEach(([c, n]) => { const t = tm.get(c); if (!t) return;
    g.globalAlpha = 0.2 + 0.5 * n / maxL; g.lineWidth = 0.8 + 2.6 * n / maxL; g.beginPath(); g.moveTo(x(t.lo), y(t.la)); g.lineTo(x(r.p.lo), y(r.p.la)); g.stroke(); }));
  g.globalAlpha = 1; const maxT = Math.max(1, ...T.map(t => t.n)), maxD = Math.max(1, ...D.map(r => r.fam.size));
  const dot = (cx, cy, r, fill) => { g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fillStyle = fill; g.fill(); g.lineWidth = 2; g.strokeStyle = col("--surface"); g.stroke(); };
  D.forEach(r => dot(x(r.p.lo), y(r.p.la), 4 + 7 * Math.sqrt(r.fam.size / maxD), col("--warn")));
  T.forEach(t => dot(x(t.lo), y(t.la), 5 + 10 * Math.sqrt(t.n / maxT), col("--sea")));
  /* labels: biggest towns first, skipped when they would overlap one already drawn */
  g.font = "600 12px Rubik, system-ui, sans-serif"; g.textAlign = "left"; const used = [];
  T.slice().sort((a, b) => b.n - a.n).forEach(t => { const txt = `${t.c} (${t.n})`, w = g.measureText(txt).width + 6, r0 = 5 + 10 * Math.sqrt(t.n / maxT);
    let bx = x(t.lo) + r0 + 3, by = y(t.la) - 8; if (bx + w > W) bx = x(t.lo) - r0 - 3 - w; bx = Math.max(2, bx);
    if (used.some(u => bx < u[2] && bx + w > u[0] && by < u[3] && by + 16 > u[1])) return; used.push([bx, by, bx + w, by + 16]);
    g.fillStyle = col("--surface"); g.globalAlpha = 0.85; g.fillRect(bx, by, w, 16); g.globalAlpha = 1; g.fillStyle = col("--ink"); g.fillText(txt, bx + 3, by + 12); });
  cv.setAttribute("aria-label", `מפה: ${T.length} יישובי מגורים ו-${D.length} יעדים מובילים. הפירוט בטבלאות שליד המפה.`);
}
/* CSV of the current slice (top places), Excel-friendly */
function anCsv() {
  if (!AN.raw) return; const { e } = anSlice(), top = anTopPlaces(e);
  const q = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const rows = [["מזהה", "מקום", "יישוב", "סוג", "משפחות", "פרטים", "ניווט", "רוצים לבקר", "יום כיף", "ביקרנו", "להציע שוב", "הסתרה", "נסיעה ממוצעת", "מגיעים מ"]]
    .concat(top.map(r => [r.pid, r.n, r.p && r.p.c, kindOf(r.p), r.fam.size, r.c.place, r.c.nav, r.c.want, r.c.day_add, r.c.visited, r.c.like, r.c.hide, r.mins.length ? Math.round(avg(r.mins)) : "", r.origins.map(([c, n]) => `${c}:${n}`).join(" ")]));
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + rows.map(r => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  a.download = `mabali-analytics-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- wiring ---------- */
(() => {
  const on = (sel, k) => $(sel).addEventListener("change", ev => { AN.f[k] = ev.target.value; anRender(); });
  on("#anCity", "city"); on("#anRg", "rg"); on("#anKb", "kb"); on("#anDog", "dog"); on("#anMd", "md"); on("#anKind", "kind");
  $("#anDays").addEventListener("change", ev => { AN.days = +ev.target.value; anLoad(true); });
  $("#anNear").addEventListener("change", ev => { AN.near = +ev.target.value; if (AN.raw) { const { fam, e } = anSlice(); anUntapped(fam, e); } });
  $("#anPlace").addEventListener("change", ev => { AN.place = +ev.target.value; if (AN.raw) anOrigins(anTopPlaces(anSlice().e)); });
  $("#anReset").addEventListener("click", () => { AN.f = { city: "", rg: "", kb: "", dog: "", md: "", kind: "" }; anFilters(); anRender(); });
  $("#anCsv").addEventListener("click", anCsv);
  $("#anCard").addEventListener("click", ev => { const b = ev.target.closest("[data-anp]"); if (!b) return; AN.place = +b.dataset.anp; anOrigins(anTopPlaces(anSlice().e)); $("#anFromH").scrollIntoView({ behavior: "smooth", block: "start" }); $("#anPlace").focus(); });
  addEventListener("resize", () => { clearTimeout(AN.rt); AN.rt = setTimeout(() => { if (AN.raw) { const { fam, e } = anSlice(); anMap(fam, anTopPlaces(e)); } }, 200); });
})();
window.anAfterLoad = () => { anLoad(); };
