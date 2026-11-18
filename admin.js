/* מה בא לי – לוח בקרה (v1.43.0). Reads summaries from the monitoring web app (monitor.gs) with the admin password. */
"use strict";
const ENDPOINT = "https://script.google.com/macros/s/AKfycbyYGa4tGk3wNqetggcqH-ssOrMyZp-8LKPNiV_Yhm1ScBDMwAXcqO0nYRGCdvHjsD4n/exec";   // optional: the /exec address, so it doesn't need to be typed on every device
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = new Intl.NumberFormat("he-IL");
/* v1.49.0 security: the password is never stored. It is exchanged once for a session token that lives only in this tab
   (sessionStorage), ends after 15 minutes without activity, after 8 hours, or on "יציאה", and is cancelled on the server too. */
if (window.top !== window.self) { document.documentElement.innerHTML = ""; throw new Error("framed"); }   // no clickjacking
const ses = { get() { try { return sessionStorage.getItem("mb_tok") } catch (e) { return null } }, set(v) { try { sessionStorage.setItem("mb_tok", v) } catch (e) {} }, del() { try { sessionStorage.removeItem("mb_tok") } catch (e) {} } };
try { localStorage.removeItem("mb_key"); sessionStorage.removeItem("mb_key"); } catch (e) {}           // passwords kept by older versions
const IDLE_MS = 15 * 60000;
const EV = { open: "פתיחת האפליקציה", tab: "מעבר לשונית", place: "פתיחת פרטי מקום", nav: "ניווט למקום", day_add: "הוספה ליום כיף", visited: "סימון \"ביקרנו\"", share: "שיתוף", calendar: "הוספה ליומן", filter: "שינוי תאריך", tour: "סיור מודרך", family_new: "משפחה חדשה", group: "קבוצות" };
const TABS = { home: "לוגו (חזרה למסך הראשי)", find: "מה עושים", day: "יום כיף", groups: "קבוצות", hist: "המשפחה", about: "מידע" };
const ENVS = { web: "דפדפן", pwa: "ממסך הבית" };
const REP_STATUS = ["חדש", "בטיפול", "טופל", "נדחה"], SUG_STATUS = ["ממתין", "בבדיקה", "אושר – להוסיף", "נדחה", "כבר קיים"];
const S = { ep: "", tok: "", demo: false, data: null, filter: "פתוחות", idleT: 0 };

async function call(op, extra) {
  if (S.demo) return demoCall(op, extra);
  const r = await fetch(S.ep, { method: "POST", cache: "no-store", referrerPolicy: "no-referrer", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ kind: "admin", op, ua: navigator.userAgent.slice(0, 120) }, op === "login" ? {} : { token: S.tok }, extra || {})) });
  const j = await r.json();
  if (j && j.error === "session" && op !== "logout") endSession("החיבור פג. צריך להזין סיסמה שוב.");
  return j;
}
const ERRS = { auth: "סיסמה שגויה", locked: "יותר מדי ניסיונות שגויים. הכניסה חסומה ל-15 דקות.", "weak key": "הסיסמה בשרת קצרה מ-12 תווים. החליפו את ADMIN_KEY בסיסמה חזקה יותר.", legacy: "שרת הניטור בגרסה ישנה. הדביקו את monitor.gs החדש ב-Apps Script ועדכנו את הפריסה לגרסה חדשה.", "no admin key": "לא הוגדרה סיסמה בשרת: ב-Apps Script ← הגדרות הפרויקט ← Script properties מוסיפים ADMIN_KEY." };

/* v1.52.1: visible messages (also on phones) with the server's reason, and a server version check */
const NEED_V = "1.52.0";
function notify(msg, bad) { let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
  t.textContent = msg; t.className = bad ? "bad" : ""; t.hidden = false; clearTimeout(notify.t); notify.t = setTimeout(() => { t.hidden = true; }, bad ? 9000 : 3500); }
function errText(r, what) {
  const e = r && r.error;
  if (e === "unknown op") return `${what} נכשלה: שרת הניטור לא מכיר את הפעולה. צריך להדביק את monitor.gs החדש ב-Apps Script ולפרסם "גרסה חדשה" לפריסה הקיימת.`;
  if (e === "not found") return `${what} נכשלה: הפריט לא נמצא בגיליון (אולי כבר נמחק). רעננו את הלוח.`;
  if (e === "bad id") return `${what} נכשלה: מזהה המקום לא תקין.`;
  if (e === "session") return "החיבור פג. צריך להזין סיסמה שוב.";
  if (!r) return `${what} נכשלה: אין חיבור לשרת הניטור. בדקו את החיבור לאינטרנט ונסו שוב.`;
  return `${what} נכשלה${e ? " (" + e + ")" : ""}. נסו שוב.`;
}
const verNum = v => String(v || "0").split(".").reduce((a, x) => a * 1000 + (+x || 0), 0);
async function checkServer() {
  if (S.demo || !S.ep) return; let j = null;
  try { const r = await fetch(S.ep + "?t=" + Date.now(), { cache: "no-store" }); j = await r.json(); } catch (e) {}
  const b = $("#srvWarn"); if (!b) return;
  if (j && j.v && verNum(j.v) < verNum(NEED_V)) { b.hidden = false; b.textContent = `שרת הניטור בגרסה ${j.v}. עריכת מקומות ומחיקת פניות צריכות גרסה ${NEED_V} ומעלה: הדביקו את monitor.gs החדש ב-Apps Script, ואז פריסה ← ניהול פריסות ← עיפרון ← גרסה: חדשה ← פריסה.`; }
  else b.hidden = true;
}
/* ---------- login ---------- */
$("#ep").value = ENDPOINT || (() => { try { return localStorage.getItem("mb_ep") } catch (e) { return null } })() || "";   // the published address wins over one typed earlier
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault(); const ep = $("#ep").value.trim(), key = $("#pw").value;
  $("#loginErr").textContent = "";
  if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(ep)) { $("#loginErr").textContent = "כתובת השרת צריכה להתחיל ב-https://script.google.com/"; $("#ep").focus(); return; }
  if (!key) { $("#loginErr").textContent = "חסרה סיסמה"; $("#pw").focus(); return; }
  Object.assign(S, { ep, demo: false });
  $("#loginBtn").disabled = true; $("#loginBtn").textContent = "בודקים…";
  let r; try { r = await call("login", { key }); } catch (err) { r = { ok: false, error: "net" }; }
  $("#pw").value = "";                                                       // the password leaves the page right away
  $("#loginBtn").disabled = false; $("#loginBtn").textContent = "כניסה";
  if (!r || !r.ok || !r.token) { $("#loginErr").textContent = ERRS[r && r.ok && !r.token ? "legacy" : r && r.error] || "אין חיבור לשרת הניטור. בדקו את הכתובת ושהפריסה היא Web app עם גישה ל-Anyone."; $("#pw").focus(); return; }
  S.tok = r.token; ses.set(r.token); try { localStorage.setItem("mb_ep", ep) } catch (e) {}
  await load(true);
});
function endSession(msg) {
  clearTimeout(S.idleT); try { PL.ov = { ov: {}, hid: [] }; PL.list = null; PL.loading = null; $("#plList").innerHTML = ""; $("#plQ").value = ""; $("#edWrap").hidden = true; } catch (e) {} ses.del(); Object.assign(S, { tok: "", data: null, demo: false });
  ["#kpis", "#reps", "#events", "#tabs", "#places", "#errors", "#versions", "#envs", "#sugs", "#dailyTbl", "#logins"].forEach(x => { const e = $(x); if (e) e.innerHTML = ""; });
  document.querySelectorAll("#dailyWrap svg").forEach(e => e.remove());
  $("#dash").hidden = true; $("#login").hidden = false; $("#loginForm").hidden = false; $("#checking").hidden = true; $("#updated").textContent = "";
  $("#loginErr").textContent = msg || ""; $("#pw").value = ""; $("#pw").focus();
}
function touchIdle() { if (!S.tok && !S.demo) return; clearTimeout(S.idleT); S.idleT = setTimeout(async () => { if (S.tok) { try { await call("logout") } catch (e) {} } endSession("נותקת אחרי 15 דקות ללא פעילות."); }, IDLE_MS); }
["pointerdown", "keydown", "scroll", "touchstart"].forEach(ev => addEventListener(ev, touchIdle, { passive: true }));
$("#demoBtn").addEventListener("click", () => { Object.assign(S, { demo: true }); load(true); });
$("#logout").addEventListener("click", async () => { if (S.tok) { try { await call("logout") } catch (e) {} } endSession("יצאת מלוח הבקרה."); });
$("#refresh").addEventListener("click", () => load());
$("#range").addEventListener("change", () => load());

async function load(fromLogin) {
  $("#updated").textContent = "טוען…";
  let d;
  try { d = await call("stats", { days: +$("#range").value }); }
  catch (e) { d = { ok: false, error: "net" }; }
  if (!d || !d.ok) {
    const msg = ERRS[d && d.error] || "אין חיבור לשרת הניטור. בדקו את הכתובת ושהפריסה היא Web app עם גישה ל-Anyone.";
    $("#updated").textContent = "";
    if (d && d.error === "session") return false;
    if (fromLogin || $("#dash").hidden) { $("#loginErr").textContent = msg; } else { $("#updated").textContent = msg; }
    return false;
  }
  S.data = d; $("#login").hidden = true; $("#dash").hidden = false; $("#demoNote").hidden = !S.demo; touchIdle(); if (fromLogin || !checkServer.done) { checkServer.done = true; checkServer(); }
  $("#updated").textContent = "עודכן " + new Date(d.now).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  render(); return true;
}

/* ---------- render ---------- */
function render() {
  const d = S.data, open = d.reports.filter(r => r.status === "חדש" || r.status === "בטיפול").length;
  const ret = d.users.all ? Math.round(100 * d.users.returning / d.users.all) : 0;
  const errN = d.errors.reduce((a, e) => a + e.n, 0);
  const k = [[d.users.d1, "משתמשים ב-24 השעות האחרונות"], [d.users.d7, "משתמשים ב-7 ימים"], [d.users.all, `משתמשים ב-${d.days} ימים`],
    [ret + "%", `חזרו ביותר מיום אחד (${nf.format(d.users.returning)})`], [d.sessions.d7, "ביקורים ב-7 ימים"], [open, "פניות פתוחות", open > 0], [errN, "שגיאות טכניות בתקופה", errN > 0]];
  $("#kpis").innerHTML = k.map(([v, l, a]) => `<div class="kpi${a ? " alert" : ""}"><b>${typeof v === "number" ? nf.format(v) : esc(v)}</b><span>${esc(l)}</span></div>`).join("");
  daily(d.daily);
  hbars("#events", d.events.map(([k, v]) => [EV[k] || k, v]));
  hbars("#tabs", d.tabs.map(([k, v]) => [TABS[k] || k, v]));
  hbars("#versions", d.versions);
  hbars("#envs", d.envs.map(([k, v]) => [ENVS[k] || k, v]));
  places(d.places); errors(d.errors); reports(); sugs(d.suggestions); logins(d.logins || []);
}
function hbars(sel, rows) {
  const el = $(sel); if (!rows.length) { el.innerHTML = '<li class="empty">אין נתונים בתקופה</li>'; return; }
  const max = Math.max(...rows.map(r => r[1]), 1);
  el.innerHTML = rows.slice(0, 12).map(([k, v]) => `<li><span class="lab" title="${esc(k)}">${esc(k)}</span><span class="bar"><span class="fill" style="display:block;width:${Math.max(1, 100 * v / max)}%"></span></span><span class="val">${nf.format(v)}</span></li>`).join("");
}
function niceMax(v) { if (v <= 4) return 4; const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
function daily(rows) {
  const wrap = $("#dailyWrap"), W = Math.max(320, wrap.clientWidth || 700), H = 220, L = 34, R = 8, T = 10, B = 26;
  const max = niceMax(Math.max(...rows.map(r => r.u), 1)), n = rows.length, bw = (W - L - R) / n, gap = Math.min(4, bw * 0.25);
  const y = v => T + (H - T - B) * (1 - v / max), ticks = [0, max / 2, max];
  const sd = s => { const [Y, M, D] = s.split("-"); return `${+D}.${+M}`; };
  let g = `<svg class="daily" viewBox="0 0 ${W} ${H}" role="img" aria-label="משתמשים בכל יום, ${n} ימים" direction="ltr">`;
  ticks.forEach(t => { g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${nf.format(t)}</text>`; });
  const every = Math.ceil(n / 8);
  rows.forEach((r, i) => {
    const w = Math.max(1, Math.min(bw - gap, 44)), x = L + i * bw + (bw - w) / 2, top = y(r.u), h = H - B - top, rad = Math.min(4, w / 2, h);
    const path = h <= 0 ? "" : `M${x},${H - B}V${top + rad}Q${x},${top} ${x + rad},${top}H${x + w - rad}Q${x + w},${top} ${x + w},${top + rad}V${H - B}Z`;
    g += `<rect class="hit" data-i="${i}" x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" tabindex="-1"/><path class="b" d="${path}"/>`;
    if (i % every === (n - 1) % every) g += `<text class="axis" x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${sd(r.d)}</text>`;
  });
  wrap.querySelectorAll("svg").forEach(s => s.remove());
  wrap.insertAdjacentHTML("beforeend", g + "</svg>");
  const tip = $("#tip"), svg = wrap.querySelector("svg");
  svg.addEventListener("mousemove", e => {
    const h = e.target.closest(".hit"); if (!h) { tip.style.display = "none"; return; }
    const r = rows[+h.dataset.i], box = svg.getBoundingClientRect(), sx = box.width / W;
    tip.innerHTML = `<b>${esc(new Date(r.d + "T12:00").toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "numeric" }))}</b><br>${nf.format(r.u)} משתמשים · ${nf.format(r.s)} ביקורים`;
    tip.style.display = "block"; tip.style.left = ((+h.getAttribute("x") + bw / 2) * sx - tip.offsetWidth / 2) + "px"; tip.style.top = (y(r.u) * sx) + "px"; tip.style.transform = "translate(0,-110%)";
  });
  svg.addEventListener("mouseleave", () => { tip.style.display = "none"; });
  $("#dailyTbl").innerHTML = `<table><thead><tr><th>תאריך</th><th class="num">משתמשים</th><th class="num">ביקורים</th></tr></thead><tbody>${rows.slice().reverse().map(r => `<tr><td>${sd(r.d)}</td><td class="num">${r.u}</td><td class="num">${r.s}</td></tr>`).join("")}</tbody></table>`;
}
const when = iso => iso ? new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
function places(rows) {
  $("#places").innerHTML = rows.length ? `<table><thead><tr><th>מקום</th><th class="num">פרטים</th><th class="num">ניווט</th><th class="num">יום כיף</th><th class="num">ביקרנו</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td class="num">${r[1]}</td><td class="num">${r[2]}</td><td class="num">${r[3]}</td><td class="num">${r[4]}</td></tr>`).join("")}</tbody></table>` : '<p class="empty">אין נתונים בתקופה</p>';
}
function errors(rows) {
  $("#errors").innerHTML = rows.length ? `<table><thead><tr><th>הודעה</th><th>מיקום</th><th class="num">פעמים</th><th class="num">מכשירים</th><th>אחרונה</th><th>גרסה</th></tr></thead><tbody>${rows.map(r => `<tr><td dir="ltr" style="text-align:left">${esc(r.msg)}</td><td dir="ltr" style="text-align:left">${esc(r.src)}</td><td class="num">${r.n}</td><td class="num">${r.users}</td><td>${when(r.last)}</td><td>${esc(r.ver)}</td></tr>`).join("")}</tbody></table>` : '<p class="empty">אין שגיאות בתקופה</p>';
}
function reports() {
  const all = S.data.reports, groups = { "פתוחות": r => r.status === "חדש" || r.status === "בטיפול", "הכול": () => true };
  REP_STATUS.forEach(s => groups[s] = r => r.status === s);
  $("#repFilter").innerHTML = Object.keys(groups).map(k => `<button type="button" data-f="${esc(k)}" aria-pressed="${k === S.filter}">${esc(k)} (${all.filter(groups[k]).length})</button>`).join("");
  const rows = all.filter(groups[S.filter]);
  $("#reps").innerHTML = rows.length ? `<table><thead><tr><th>מספר</th><th>התקבל</th><th>סוג</th><th>מקום</th><th>תיאור</th><th>סטטוס והערה</th></tr></thead><tbody>${rows.map(r => `<tr>
    <td>${esc(r.ticket)}</td><td>${when(r.at)}</td><td>${esc(r.type)}</td><td>${esc(r.place)}</td>
    <td><div class="rep-text">${esc(r.text)}</div>${r.contact ? `<div class="small">ליצירת קשר: ${esc(r.contact)}</div>` : ""}${r.diag ? `<details><summary>פרטים טכניים</summary><div class="small" dir="ltr" style="text-align:left">${esc(r.diag)}</div></details>` : ""}</td>
    <td><span class="pill st-${esc(r.status)}">${esc(r.status)}</span><div class="rep-edit" style="margin-top:6px"><select aria-label="סטטוס ${esc(r.ticket)}" data-st="${esc(r.ticket)}">${REP_STATUS.map(s => `<option${s === r.status ? " selected" : ""}>${s}</option>`).join("")}</select><textarea aria-label="הערה ל-${esc(r.ticket)}" data-note="${esc(r.ticket)}" placeholder="הערה">${esc(r.note)}</textarea><button type="button" data-save="${esc(r.ticket)}">שמירה</button></div><div class="acts" style="margin-top:6px">${r.place || r.pid ? `<button type="button" data-fix="${esc(r.ticket)}">תיקון המקום</button>` : ""}<button type="button" class="danger" data-del="${esc(r.ticket)}">מחיקת הפנייה<span class="sr"> ${esc(r.ticket)}</span></button></div></td></tr>`).join("")}</tbody></table>` : '<p class="empty">אין פניות בסינון הזה</p>';
}
$("#repFilter").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; S.filter = b.dataset.f; reports(); });
$("#reps").addEventListener("click", async e => {
  const b = e.target.closest("[data-save]"); if (!b) return; const t = b.dataset.save;
  const st = document.querySelector(`[data-st="${CSS.escape(t)}"]`).value, note = document.querySelector(`[data-note="${CSS.escape(t)}"]`).value;
  b.disabled = true; b.textContent = "שומר…";
  let r; try { r = await call("status", { ticket: t, status: st, note }); } catch (err) { r = null; }
  b.disabled = false;
  if (r && r.ok) { const rep = S.data.reports.find(x => x.ticket === t); rep.status = st; rep.note = note; render(); notify(`${t} נשמר`); }
  else { b.textContent = "שמירה"; notify(errText(r, "השמירה"), true); }
});
function sugs(rows) {
  $("#sugs").innerHTML = rows.length ? `<table><thead><tr><th>התקבל</th><th>מקום</th><th>יישוב</th><th>סוג</th><th>למה ממליצים</th><th>סטטוס</th></tr></thead><tbody>${rows.map(r => `<tr><td>${when(r.at)}</td><td>${r.link && /^https?:\/\//.test(r.link) ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.name)}</a>` : esc(r.name)}</td><td>${esc(r.city)}</td><td>${esc(r.type)}</td><td class="rep-text">${esc(r.why)}</td>
    <td><select aria-label="סטטוס ${esc(r.name)}" data-sug="${r.row}">${SUG_STATUS.map(s => `<option${s === r.status ? " selected" : ""}>${s}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table>` : '<p class="empty">אין המלצות</p>';
}
$("#sugs").addEventListener("change", async e => {
  const s = e.target.closest("[data-sug]"); if (!s) return;
  let r; try { r = await call("sugStatus", { row: +s.dataset.sug, status: s.value }); } catch (err) { r = null; }
  if (r && r.ok) notify("הסטטוס נשמר"); else notify(errText(r, "השמירה"), true);
  if (r && r.ok) { const x = S.data.suggestions.find(x => x.row === +s.dataset.sug); if (x) x.status = s.value; }
});
let rsT; addEventListener("resize", () => { clearTimeout(rsT); rsT = setTimeout(() => { if (S.data) daily(S.data.daily); }, 150); });

function logins(rows) {
  $("#logins").innerHTML = rows.length ? `<table><thead><tr><th>זמן</th><th>אירוע</th><th>דפדפן</th></tr></thead><tbody>${rows.map(r => `<tr><td>${when(r.at)}</td><td>${/שגויה|חסימה/.test(r.what) ? `<span class="pill st-חדש">${esc(r.what)}</span>` : esc(r.what)}</td><td class="small" dir="ltr" style="text-align:left">${esc(String(r.ua || "").slice(0, 70))}</td></tr>`).join("")}</tbody></table>` : '<p class="empty">אין רישומים</p>';
}
/* ---------- places: search, quick edit, hide (v1.52.0) ---------- */
const KINDS = [["park", "פארקים וגינות"], ["water", "מים ובריכות"], ["nature", "טבע ומסלולים"], ["animals", "חיות"], ["pick", "קטיף"], ["play", "משחקיות ואטרקציות"], ["museum", "מוזיאונים"], ["culture", "תרבות ומורשת"], ["market", "שווקים"]];
const KIND = Object.fromEntries(KINDS);
const ED_FIELDS = [
  ["n", "שם המקום", "text", 80], ["c", "יישוב", "text", 60],
  ["k", "סוג", "sel", KINDS], ["io", "בפנים או בחוץ", "sel", [["out", "בחוץ"], ["in", "בפנים"]]],
  ["a", "מחיר מבוגר (₪)", "num", [0, 5000]], ["ch", "מחיר ילד/ה (₪)", "num", [0, 5000]],
  ["fu", "ילדים בחינם עד גיל", "num", [0, 18]], ["cm", "מחיר ילד/ה עד גיל", "num", [0, 18]],
  ["hr", "שעות פתיחה", "text", 200, "wide"], ["web", "אתר (https://…)", "url", 300, "wide"],
  ["dog", "כלבים", "sel", [["", "לא ידוע"], ["1", "מותר"], ["0", "אסור"]]], ["dogN", "הערה על כלבים", "text", 120],
  ["acc", "נגישות", "sel", [["", "לא ידוע"], ["2", "נגיש לכיסא גלגלים"], ["1", "נגיש לעגלות בלבד"], ["0", "לא נגיש"]]], ["fd", "אוכל במקום", "text", 120],
  ["note", "הערה שמוצגת בכרטיס", "area", 500, "wide"]];
const PL = { list: null, def: {}, ov: { ov: {}, hid: [] }, f: "all", cur: null, rep: null, loading: null };
async function plLoad() {
  if (PL.list) return true; if (PL.loading) return PL.loading;
  PL.loading = (async () => {
    $("#plMsg").textContent = "טוען את רשימת המקומות…";
    try { const r = await fetch("places.json?v=" + Date.now(), { cache: "no-cache" }); const j = await r.json(); PL.list = j.places; PL.def = j.def || {}; }
    catch (e) { $("#plMsg").textContent = "לא הצלחנו לטעון את רשימת המקומות (places.json)."; PL.loading = null; return false; }
    if (!S.demo) { try { const r = await fetch(S.ep + "?op=ov&t=" + Date.now(), { cache: "no-store" }); const j = await r.json(); if (j && j.ok) PL.ov = { ov: j.ov || {}, hid: j.hid || [] }; } catch (e) {} }
    $("#plMsg").textContent = `${nf.format(PL.list.length)} מקומות. נערכו: ${Object.keys(PL.ov.ov).length}, מוסתרים: ${PL.ov.hid.length}.`;
    return true;
  })();
  return PL.loading;
}
const plOrig = (p, k) => (p[k] !== undefined ? p[k] : (k in PL.def ? PL.def[k] : ""));
const plCur = (p, k) => { const o = PL.ov.ov[p.id]; return o && k in o ? o[k] : plOrig(p, k); };
const plHidden = p => PL.ov.hid.indexOf(p.id) >= 0;
const plEdited = p => !!PL.ov.ov[p.id] && Object.keys(PL.ov.ov[p.id]).length > 0;
const normH = s => String(s || "").toLowerCase().replace(/["'׳״`\-–]/g, "").replace(/\s+/g, " ").trim();
function plFindByName(name) { const n = normH(name); if (!n || !PL.list) return null; return PL.list.find(p => normH(plCur(p, "n")) === n || normH(p.n) === n) || null; }
function plRender() {
  if (!PL.list) return; const q = normH($("#plQ").value);
  let rows = PL.list;
  if (PL.f === "edited") rows = rows.filter(plEdited); else if (PL.f === "hidden") rows = rows.filter(plHidden);
  if (q.length >= 2) rows = rows.filter(p => normH(plCur(p, "n") + " " + plCur(p, "c")).includes(q));
  else if (PL.f === "all") { $("#plList").innerHTML = '<p class="empty">הקלידו לפחות 2 אותיות לחיפוש</p>'; return; }
  const tot = rows.length; rows = rows.slice(0, 40);
  const price = p => { const a = plCur(p, "a"), c = plCur(p, "ch"); return !a && !c ? "חינם" : `מבוגר ₪${a || 0} · ילד/ה ₪${c || 0}`; };
  $("#plList").innerHTML = rows.length ? `<table><thead><tr><th>מקום</th><th>יישוב</th><th>סוג</th><th>מחיר</th><th>פעולות</th></tr></thead><tbody>${rows.map(p => `<tr>
    <td>${esc(plCur(p, "n"))} ${plEdited(p) ? '<span class="pill ed">נערך</span>' : ""} ${plHidden(p) ? '<span class="pill hid">מוסתר</span>' : ""}${p.osm ? ' <span class="small">(OpenStreetMap)</span>' : ""}</td>
    <td>${esc(plCur(p, "c"))}</td><td>${esc(KIND[plCur(p, "k")] || "")}</td><td>${esc(price(p))}</td>
    <td><div class="acts"><button type="button" data-ed="${p.id}">עריכה<span class="sr"> ${esc(plCur(p, "n"))}</span></button><button type="button" class="${plHidden(p) ? "" : "danger"}" data-hide="${p.id}">${plHidden(p) ? "החזרה לאפליקציה" : "הסתרה"}<span class="sr"> ${esc(plCur(p, "n"))}</span></button></div></td></tr>`).join("")}</tbody></table>${tot > 40 ? `<p class="small">מוצגים 40 מתוך ${nf.format(tot)}. דייקו את החיפוש.</p>` : ""}` : '<p class="empty">לא נמצאו מקומות</p>';
}
let plT; $("#plQ").addEventListener("input", async () => { await plLoad(); clearTimeout(plT); plT = setTimeout(plRender, 150); });
$("#plQ").addEventListener("focus", () => plLoad(), { once: true });
$("#plFilter").addEventListener("click", async e => { const b = e.target.closest("button"); if (!b) return; PL.f = b.dataset.f; $("#plFilter").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); await plLoad(); plRender(); });
$("#plList").addEventListener("click", async e => {
  const ed = e.target.closest("[data-ed]"), hd = e.target.closest("[data-hide]");
  if (ed) { edOpen(+ed.dataset.ed, null, ed); return; }
  if (hd) { const p = PL.list.find(x => x.id === +hd.dataset.hide); if (!p) return; hd.disabled = true; await plSave(p, PL.ov.ov[p.id] || {}, !plHidden(p), ""); hd.disabled = false; plRender(); }
});
async function plSave(p, fields, hidden, note) {
  const empty = !Object.keys(fields).length && !hidden;
  let r; try { r = await call(empty ? "placeReset" : "placeSave", { id: p.id, name: plCur(p, "n"), fields, hidden, note }); } catch (e) { r = null; }
  if (!r || !r.ok) { notify(errText(r, hidden && !plHidden(p) ? "ההסתרה" : "השמירה"), true); PL.lastErr = errText(r, "השמירה"); return false; }
  if (empty) delete PL.ov.ov[p.id]; else PL.ov.ov[p.id] = r.fields || fields;
  PL.ov.hid = PL.ov.hid.filter(x => x !== p.id); if (hidden) PL.ov.hid.push(p.id);
  notify(`${plCur(p, "n")}: ${empty ? "חזר לנתונים המקוריים" : hidden ? "מוסתר מהאפליקציה" : "נשמר"}`);
  return true;
}
/* editor */
function edVal(p, k) { const v = plCur(p, k); return v == null ? "" : String(v); }
async function edOpen(id, rep, from) {
  await plLoad(); const p = PL.list && PL.list.find(x => x.id === id); if (!p) { notify("המקום לא נמצא ברשימה", true); return; }
  PL.cur = p; PL.rep = rep || null; PL.from = from || document.activeElement;
  $("#edT").textContent = "עריכת מקום: " + plCur(p, "n"); $("#edSub").textContent = `מזהה ${p.id}${p.osm ? " · מקור: OpenStreetMap" : ""} · השינויים מגיעים לכל המשתמשים בפתיחה הבאה של האפליקציה`;
  $("#edRep").hidden = !rep; if (rep) $("#edRep").textContent = `דיווח ${rep.ticket}: ${rep.text}`;
  $("#edForm").innerHTML = ED_FIELDS.map(([k, l, t, o, w]) => {
    const v = edVal(p, k), orig = plOrig(p, k), ch = PL.ov.ov[p.id] && k in PL.ov.ov[p.id];
    const ctl = t === "sel" ? `<select id="ed_${k}">${o.map(([a, b]) => `<option value="${esc(a)}"${String(v) === a ? " selected" : ""}>${esc(b)}</option>`).join("")}</select>`
      : t === "area" ? `<textarea id="ed_${k}" maxlength="${o}">${esc(v)}</textarea>`
      : t === "num" ? `<input type="number" id="ed_${k}" min="${o[0]}" max="${o[1]}" step="1" inputmode="numeric" value="${esc(v)}">`
      : `<input type="${t === "url" ? "url" : "text"}" id="ed_${k}" maxlength="${o}" value="${esc(v)}"${t === "url" ? ' dir="ltr"' : ""}>`;
    const ov = t === "sel" ? (o.find(x => x[0] === String(orig == null ? "" : orig)) || ["", ""])[1] : orig;
    return `<div class="${w || ""}"><label for="ed_${k}">${esc(l)}</label>${ctl}<div class="orig" id="edo_${k}">${ch ? "מקורי: " + esc(ov === "" ? "(ריק)" : ov) : ""}</div></div>`;
  }).join("");
  $("#edHidden").checked = plHidden(p); $("#edNote").value = ""; $("#edErr").textContent = "";
  $("#edReset").hidden = !(plEdited(p) || plHidden(p));
  $("#edDoneRow").hidden = !rep; if (rep) { $("#edDone").checked = true; $("#edDoneT").textContent = `לסמן את פנייה ${rep.ticket} כ"טופל"`; }
  $("#edWrap").hidden = false; $("#edT").focus();
}
function edClose() { $("#edWrap").hidden = true; const f = PL.from; PL.cur = null; if (f && f.isConnected) f.focus(); }
function edCollect() {
  const p = PL.cur, out = {};
  for (const [k, l, t, o] of ED_FIELDS) {
    const el = $("#ed_" + k); let v = el.value.trim();
    if (t === "num") { if (v === "") v = plOrig(p, k); else { v = +v; if (!(v >= o[0] && v <= o[1])) return { err: `${l}: מספר בין ${o[0]} ל-${o[1]}` }; } }
    else if (t === "url") { if (v && !/^https:\/\/[^\s"'<>]+$/.test(v)) return { err: "הכתובת צריכה להתחיל ב-https://" }; }
    else if (t === "sel" && (k === "dog" || k === "acc")) v = v === "" ? null : +v;
    if (k === "n" && !v) return { err: "חסר שם למקום" };
    const orig = plOrig(p, k);
    const same = (orig == null || orig === "") && (v == null || v === "") ? true : String(orig) === String(v);
    if (!same) out[k] = v;
  }
  return { fields: out };
}
$("#edSave").addEventListener("click", async () => {
  const c = edCollect(); if (c.err) { $("#edErr").textContent = c.err; return; }
  const p = PL.cur, rep = PL.rep; $("#edSave").disabled = true; $("#edSave").textContent = "שומרים…";
  const ok = await plSave(p, c.fields, $("#edHidden").checked, $("#edNote").value.trim());
  $("#edSave").disabled = false; $("#edSave").textContent = "שמירה";
  if (!ok) { $("#edErr").textContent = PL.lastErr || "השמירה נכשלה, נסו שוב"; return; }
  if (rep && $("#edDone").checked) { try { const r = await call("status", { ticket: rep.ticket, status: "טופל", note: (rep.note ? rep.note + " · " : "") + "המקום תוקן בלוח הבקרה" }); if (r && r.ok) { rep.status = "טופל"; rep.note = (rep.note ? rep.note + " · " : "") + "המקום תוקן בלוח הבקרה"; } } catch (e) {} }
  edClose(); plRender(); if (S.data) reports();
});
$("#edReset").addEventListener("click", async () => { const p = PL.cur; if (await plSave(p, {}, false, "")) { edClose(); plRender(); } });
$("#edCancel").addEventListener("click", edClose);
$("#edWrap").addEventListener("keydown", e => { if (e.key === "Escape") edClose(); });
$("#edWrap").addEventListener("click", e => { if (e.target === $("#edWrap")) edClose(); });
$("#edForm").addEventListener("submit", e => e.preventDefault());
/* reports: fix the place, hide it, delete the report */
async function repPlace(r) { await plLoad(); if (!PL.list) return null; if (r.pid) { const p = PL.list.find(x => x.id === +r.pid); if (p) return p; } return r.place ? plFindByName(r.place) : null; }
$("#reps").addEventListener("click", async e => {
  const fx = e.target.closest("[data-fix]"), dl = e.target.closest("[data-del]"), dy = e.target.closest("[data-delyes]"), dn = e.target.closest("[data-delno]");
  if (fx) { const r = S.data.reports.find(x => x.ticket === fx.dataset.fix); const p = r && await repPlace(r); if (!p) { notify(`לא מצאנו את "${r && r.place}" ברשימת המקומות. חפשו אותו ב"מקומות באפליקציה".`, true); $("#plQ").value = r ? r.place : ""; $("#plQ").focus(); plRender(); return; } edOpen(p.id, r, fx); return; }
  if (dl) { const box = dl.closest(".acts"); box.innerHTML = `<span class="small">למחוק את הפנייה לצמיתות?</span><button type="button" class="danger pri" data-delyes="${esc(dl.dataset.del)}">מחיקה</button><button type="button" data-delno="1">ביטול</button>`; box.querySelector("[data-delno]").focus(); return; }
  if (dn) { reports(); return; }
  if (dy) { const t = dy.dataset.delyes; dy.disabled = true; let r; try { r = await call("repDelete", { ticket: t }); } catch (err) { r = null; }
    if (r && r.ok) { S.data.reports = S.data.reports.filter(x => x.ticket !== t); render(); notify(`פנייה ${t} נמחקה`); const f = $("#repFilter button[aria-pressed=true]"); if (f) f.focus(); }
    else { notify(errText(r, "המחיקה"), true); reports(); } }
});

/* ---------- demo data ---------- */
let DEMO = null;
function demoCall(op, x) {
  if (op === "status") { const r = DEMO.reports.find(r => r.ticket === x.ticket); if (r) { r.status = x.status; r.note = x.note; } return { ok: true }; }
  if (op === "sugStatus") return { ok: true };
  if (op === "placeSave") return { ok: true, fields: x.fields };
  if (op === "placeReset") return { ok: true };
  if (op === "repDelete") { DEMO.reports = DEMO.reports.filter(r => r.ticket !== x.ticket); return { ok: true }; }
  const days = (x && x.days) || 30, now = Date.now(), daily = [];
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = days - 1; i >= 0; i--) { const dt = new Date(now - i * 864e5), we = dt.getDay() === 5 || dt.getDay() === 6, u = Math.round((we ? 14 : 6) + rnd() * 6 + (days - i) * 0.15); daily.push({ d: dt.toISOString().slice(0, 10), u, s: Math.round(u * (1.3 + rnd() * 0.5)) }); }
  const iso = h => new Date(now - h * 36e5).toISOString();
  if (!DEMO) DEMO = { reports: [
    { ticket: "R-1006", at: iso(2), type: "תקלה", place: "", text: "לחצתי על הוספה ליומן ולא קרה כלום", contact: "", diag: "גרסה 1.43.0 | אתר עצמאי | לשונית: day | מסך 390x844 | he-IL | Mozilla/5.0 (iPhone…)", ver: "1.43.0", status: "חדש", note: "" },
    { ticket: "R-1005", at: iso(9), type: "טעות במידע", place: "חוף דדו", text: "החניה כבר לא בחינם מאז נובמבר", contact: "", diag: "", ver: "1.43.0", status: "חדש", note: "" },
    { ticket: "R-1004", at: iso(30), type: "שאלה", place: "", text: "איך מוסיפים עוד ילד למשפחה?", contact: "050-0000000", diag: "", ver: "1.42.2", status: "בטיפול", note: "לחזור בטלפון" },
    { ticket: "R-1003", at: iso(55), type: "משוב", place: "", text: "מצאנו לאן לצאת: כן\nאפליקציה מעולה, הייתי שמח לסינון לפי צל", contact: "", diag: "", ver: "1.42.2", status: "טופל", note: "נוסף לרשימת רעיונות" },
    { ticket: "R-1002", at: iso(80), type: "ביקור", place: "גן החיות החינוכי", text: "היה צפוף בשבת בבוקר", contact: "", diag: "", ver: "1.42.1", status: "טופל", note: "" }] };
  return { ok: true, now: new Date(now).toISOString(), days,
    users: { d1: daily[days - 1].u, d7: 41, all: days <= 7 ? 41 : days <= 30 ? 96 : 140, returning: days <= 7 ? 15 : 38 }, sessions: { d7: 77, all: days <= 7 ? 77 : 410 }, daily,
    events: [["open", 410], ["place", 352], ["tab", 298], ["nav", 121], ["filter", 96], ["day_add", 58], ["visited", 44], ["share", 19], ["calendar", 15], ["tour", 12]],
    tabs: [["day", 120], ["hist", 81], ["about", 52], ["groups", 45]],
    places: [["גן החיות החינוכי", 61, 22, 9, 8], ["חוף דדו", 44, 18, 4, 7], ["פארק הכרמל – מסלול הנחל", 38, 9, 7, 3], ["מדעטק", 35, 14, 6, 5], ["בריכת קריית ים", 21, 8, 2, 4]],
    versions: [["1.43.0", 71], ["1.42.2", 22], ["1.42.1", 6]], envs: [["web", 74], ["pwa", 25]],
    reports: DEMO.reports,
    errors: [{ msg: "TypeError: Cannot read properties of null (reading 'focus')", src: "index.html:3121:40", n: 6, users: 3, last: iso(5), ver: "1.43.0" }],
    logins: [{ at: iso(1), what: "כניסה", ua: "Mozilla/5.0 (iPhone…)" }, { at: iso(26), what: "סיסמה שגויה", ua: "Mozilla/5.0 (Windows…)" }],
    suggestions: [{ row: 2, at: iso(20), name: "פארק גלי צ׳כוסלובקיה", city: "קריית ים", type: "פארק או גינה", link: "", why: "גינה מוצלת עם מתקנים לפעוטות", status: "ממתין", note: "" }] };
}

/* ---------- an open session in this tab survives a page reload; nothing else is remembered ---------- */
(async () => { const tok = ses.get(), ep = $("#ep").value; if (!tok || !ep) return;
  Object.assign(S, { ep, tok }); $("#loginForm").hidden = true; $("#checking").hidden = false;     // no form to click while checking
  const ok = await load(); if (!ok) endSession(S.tok ? "" : "החיבור פג. צריך להזין סיסמה שוב."); })();
