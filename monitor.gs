/**
 * מה בא לי – שרת הניטור (גרסה 1.43.0)
 * קולט מהאפליקציה: נתוני שימוש אנונימיים (רק ממי שאישר), שגיאות טכניות, דיווחי תקלות ומשוב, והמלצות על מקומות.
 * מחזיר ללוח הבקרה (admin.html) סיכומים, ומאפשר לעדכן סטטוס לדיווחים – רק עם סיסמת המנהל.
 *
 * הקמה (פעם אחת):
 *  1. גיליון Google חדש ← הרחבות ← Apps Script. מוחקים את הקוד הקיים, מדביקים את כל הקובץ הזה ושומרים.
 *  2. הגדרות הפרויקט (גלגל השיניים) ← Script properties ← Add: שם ADMIN_KEY, ערך: סיסמה שתבחרו (12 תווים ומעלה).
 *  3. פריסה ← פריסה חדשה ← Web app. Execute as: Me, Who has access: Anyone ← פריסה ← אישור הרשאות.
 *  4. את הכתובת שמסתיימת ב-/exec שמים ב-CONFIG.monitorEndpoint באפליקציה ובלוח הבקרה.
 * אחרי שינוי בקוד: פריסה ← ניהול פריסות ← עריכה ← גרסה חדשה (הכתובת נשארת).
 */
const TZ = 'Asia/Jerusalem';
const T_EV = 'אירועים', T_REP = 'דיווחים', T_ERR = 'שגיאות', T_SUG = 'המלצות מקומות';
const H_EV = ['זמן', 'מזהה מכשיר', 'ביקור', 'אירוע', 'פרט', 'גרסה', 'סביבה', 'מסך'];
const H_REP = ['מספר', 'התקבל', 'סוג', 'מקום', 'תיאור', 'ליצירת קשר', 'פרטים טכניים', 'גרסה', 'מזהה מכשיר', 'סטטוס', 'הערות מנהל', 'עודכן'];
const H_ERR = ['זמן', 'מזהה מכשיר', 'הודעה', 'מקור', 'גרסה', 'דפדפן'];
const H_SUG = ['התקבל', 'שם המקום', 'יישוב/כתובת', 'סוג', 'קישור', 'בפנים/בחוץ', 'מחיר מבוגר', 'מחיר ילד', 'גילאים', 'כלבים', 'נגישות', 'למה ממליצים', 'איש קשר', 'משפחה', 'גרסה', 'סטטוס', 'הערות שלי'];
const REP_STATUS = ['חדש', 'בטיפול', 'טופל', 'נדחה'];
const SUG_STATUS = ['ממתין', 'בבדיקה', 'אושר – להוסיף', 'נדחה', 'כבר קיים'];
const REP_TYPES = ['תקלה', 'שאלה', 'בקשה', 'משוב', 'טעות במידע', 'ביקור'];
const EVENTS = ['open', 'tab', 'place', 'nav', 'day_add', 'visited', 'share', 'calendar', 'filter', 'tour', 'family_new', 'group'];

/* ---------- entry points ---------- */
function doGet() { return out_({ ok: true, app: 'mabali-monitor', v: "1.43.0" }); }

function doPost(e) {
  let d;
  try { d = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return out_({ ok: false, error: 'bad json' }); }
  if (d.website) return out_({ ok: true });                                   // spam trap
  try {
    if (d.kind === 'admin') return out_(admin_(d));
    if (!rate_(String(d.id || 'anon'), d.kind === 'events' ? (d.list || []).length : 1)) return out_({ ok: false, error: 'rate' });
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      if (d.kind === 'events') return out_(events_(d));
      if (d.kind === 'error') return out_(error_(d));
      if (d.kind === 'report') return out_(report_(d));
      if (d.kind === 'place') return out_(place_(d));
      return out_({ ok: false, error: 'unknown kind' });
    } finally { lock.releaseLock(); }
  } catch (err) { return out_({ ok: false, error: String(err) }); }
}

/* ---------- intake ---------- */
function events_(d) {
  const list = Array.isArray(d.list) ? d.list.slice(0, 50) : [];
  const now = new Date(), id = clean_(d.id, 40), s = clean_(d.s, 20), ver = clean_(d.ver, 12), env = clean_(d.env, 20), scr = clean_(d.scr, 12);
  const rows = list.filter(x => x && EVENTS.indexOf(x.e) >= 0).map(x => [now, id, s, x.e, clean_(x.d, 80), ver, env, scr]);
  if (rows.length) { const sh = sheet_(T_EV, H_EV); sh.getRange(sh.getLastRow() + 1, 1, rows.length, H_EV.length).setValues(rows); }
  return { ok: true, n: rows.length };
}
function error_(d) {
  sheet_(T_ERR, H_ERR).appendRow([new Date(), clean_(d.id, 40), clean_(d.msg, 300), clean_(d.src, 160), clean_(d.ver, 12), clean_(d.ua, 160)]);
  return { ok: true };
}
function report_(d) {
  const text = clean_(d.text, 1500);
  if (text.length < 3 && !d.place) return { ok: false, error: 'empty' };
  const type = REP_TYPES.indexOf(d.type) >= 0 ? d.type : 'משוב';
  const sh = sheet_(T_REP, H_REP);
  const ticket = 'R-' + String(Math.max(0, sh.getLastRow() - 1) + 1001);
  sh.appendRow([ticket, new Date(), type, clean_(d.place, 80), text, clean_(d.contact, 80), clean_(d.diag, 400), clean_(d.ver, 12), clean_(d.id, 40), 'חדש', '', '']);
  sh.getRange(sh.getLastRow(), 10).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(REP_STATUS, true).build());
  notify_(ticket, type, d.place, text);
  return { ok: true, ticket: ticket };
}
function place_(d) {
  const name = clean_(d.name, 80), city = clean_(d.city, 100), why = clean_(d.why, 800);
  if (!name || !city || why.length < 5) return { ok: false, error: 'missing fields' };
  const num = v => (v === '' || v == null || isNaN(+v)) ? '' : Math.max(0, Math.min(2000, Math.round(+v)));
  const link = /^https?:\/\//.test(String(d.link || '')) ? clean_(d.link, 300) : '';
  const sh = sheet_(T_SUG, H_SUG);
  sh.appendRow([new Date(), name, city, clean_(d.type, 40), link, clean_(d.io, 10), num(d.priceAdult), num(d.priceChild),
    clean_(d.ages, 40), clean_(d.dog, 12), clean_(d.access, 30), why, clean_(d.contact, 80), clean_(d.from, 40), clean_(d.ver, 12), 'ממתין', '']);
  sh.getRange(sh.getLastRow(), 16).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(SUG_STATUS, true).build());
  notify_('המלצה', 'מקום חדש', name, why);
  return { ok: true, row: sh.getLastRow() };
}
/** Optional e-mail on every new report: Script property NOTIFY_EMAIL. */
function notify_(ticket, type, place, text) {
  const to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (!to) return;
  try { MailApp.sendEmail(to, 'מה בא לי – ' + type + ' ' + ticket, (place ? 'מקום: ' + place + '\n' : '') + text); } catch (e) {}
}

/* ---------- admin ---------- */
function admin_(d) {
  const cache = CacheService.getScriptCache();
  const fails = +(cache.get('adm_fail') || 0);
  if (fails >= 20) return { ok: false, error: 'locked' };                    // 20 wrong passwords → 15 minutes closed
  const key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!key) return { ok: false, error: 'no admin key' };
  if (String(d.key || '') !== key) { cache.put('adm_fail', String(fails + 1), 900); return { ok: false, error: 'auth' }; }
  if (d.op === 'stats') return stats_(Math.max(7, Math.min(90, +d.days || 30)));
  if (d.op === 'status') return setStatus_(T_REP, 1, String(d.ticket || ''), 10, REP_STATUS, d.status, d.note, 11, 12);
  if (d.op === 'sugStatus') return setStatus_(T_SUG, 0, String(d.row || ''), 16, SUG_STATUS, d.status, d.note, 17, 0);
  return { ok: true };
}
function setStatus_(tab, keyCol, keyVal, stCol, allowed, status, note, noteCol, updCol) {
  const sh = sheet_(tab, tab === T_REP ? H_REP : H_SUG);
  let row = 0;
  if (keyCol) { const ids = sh.getRange(2, keyCol, Math.max(1, sh.getLastRow() - 1), 1).getValues(); for (let i = 0; i < ids.length; i++) if (ids[i][0] === keyVal) { row = i + 2; break; } }
  else row = Math.round(+keyVal);
  if (row < 2 || row > sh.getLastRow()) return { ok: false, error: 'not found' };
  if (allowed.indexOf(status) >= 0) sh.getRange(row, stCol).setValue(status);
  if (note != null) sh.getRange(row, noteCol).setValue(clean_(note, 800));
  if (updCol) sh.getRange(row, updCol).setValue(new Date());
  return { ok: true };
}
const day_ = t => Utilities.formatDate(new Date(t), TZ, 'yyyy-MM-dd');
function rows_(tab, head) { const sh = sheet_(tab, head); const n = sh.getLastRow() - 1; return n > 0 ? sh.getRange(2, 1, n, head.length).getValues() : []; }
function stats_(days) {
  const now = new Date(), since = now.getTime() - days * 864e5, d7 = now.getTime() - 7 * 864e5, d1 = now.getTime() - 864e5;
  const ev = rows_(T_EV, H_EV).filter(r => new Date(r[0]).getTime() >= since);
  const dayU = {}, dayS = {}, u1 = {}, u7 = {}, uAll = {}, s7 = {}, sAll = {}, uDays = {}, evc = {}, plc = {}, ver = {}, env = {}, tabs = {};
  ev.forEach(r => {
    const t = new Date(r[0]).getTime(), dd = day_(t), id = r[1], s = id + '|' + r[2], e = r[3], det = r[4];
    (dayU[dd] = dayU[dd] || {})[id] = 1; (dayS[dd] = dayS[dd] || {})[s] = 1;
    uAll[id] = 1; sAll[s] = 1; if (t >= d7) { u7[id] = 1; s7[s] = 1; } if (t >= d1) u1[id] = 1;
    (uDays[id] = uDays[id] || {})[dd] = 1;
    evc[e] = (evc[e] || 0) + 1;
    if ((e === 'place' || e === 'nav' || e === 'day_add' || e === 'visited') && det) { const p = plc[det] = plc[det] || { place: 0, nav: 0, day_add: 0, visited: 0 }; p[e]++; }
    if (e === 'tab' && det) tabs[det] = (tabs[det] || 0) + 1;
    if (r[5]) (ver[r[5]] = ver[r[5]] || {})[id] = 1;
    if (r[6]) (env[r[6]] = env[r[6]] || {})[id] = 1;
  });
  const daily = [];
  for (let i = days - 1; i >= 0; i--) { const dd = day_(now.getTime() - i * 864e5); daily.push({ d: dd, u: Object.keys(dayU[dd] || {}).length, s: Object.keys(dayS[dd] || {}).length }); }
  const cnt = o => Object.keys(o).length, sortObj = (o, f) => Object.keys(o).map(k => [k, f(o[k])]).sort((a, b) => b[1] - a[1]);
  const returning = Object.keys(uDays).filter(id => cnt(uDays[id]) >= 2).length;
  const reps = rows_(T_REP, H_REP).slice(-300).reverse().map(r => ({ ticket: r[0], at: r[1] ? new Date(r[1]).toISOString() : '', type: r[2], place: r[3], text: r[4], contact: r[5], diag: r[6], ver: r[7], status: r[9] || 'חדש', note: r[10] }));
  const errAgg = {};
  rows_(T_ERR, H_ERR).filter(r => new Date(r[0]).getTime() >= since).forEach(r => {
    const k = r[2] + ' @ ' + r[3]; const a = errAgg[k] = errAgg[k] || { msg: r[2], src: r[3], n: 0, users: {}, last: 0, ver: r[4] };
    a.n++; a.users[r[1]] = 1; const t = new Date(r[0]).getTime(); if (t > a.last) { a.last = t; a.ver = r[4]; }
  });
  const errors = Object.keys(errAgg).map(k => { const a = errAgg[k]; return { msg: a.msg, src: a.src, n: a.n, users: cnt(a.users), last: new Date(a.last).toISOString(), ver: a.ver }; }).sort((a, b) => b.n - a.n).slice(0, 40);
  const sugSh = sheet_(T_SUG, H_SUG); const sugN = sugSh.getLastRow() - 1;
  const sugs = sugN > 0 ? sugSh.getRange(2, 1, sugN, H_SUG.length).getValues().map((r, i) => ({ row: i + 2, at: r[0] ? new Date(r[0]).toISOString() : '', name: r[1], city: r[2], type: r[3], link: r[4], why: r[11], status: r[15] || 'ממתין', note: r[16] })).slice(-100).reverse() : [];
  return {
    ok: true, now: now.toISOString(), days: days,
    users: { d1: cnt(u1), d7: cnt(u7), all: cnt(uAll), returning: returning }, sessions: { d7: cnt(s7), all: cnt(sAll) },
    daily: daily, events: sortObj(evc, x => x), tabs: sortObj(tabs, x => x),
    places: Object.keys(plc).map(k => [k, plc[k].place, plc[k].nav, plc[k].day_add, plc[k].visited]).sort((a, b) => (b[1] + b[2] * 2) - (a[1] + a[2] * 2)).slice(0, 20),
    versions: sortObj(ver, cnt), envs: sortObj(env, cnt),
    reports: reps, errors: errors, suggestions: sugs
  };
}

/* ---------- helpers ---------- */
function rate_(id, n) {                                                        // at most 600 items per device per 10 minutes
  const c = CacheService.getScriptCache(), k = 'rl_' + id.slice(0, 40), v = +(c.get(k) || 0) + Math.max(1, n);
  if (v > 600) return false; c.put(k, String(v), 600); return true;
}
function sheet_(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name); sh.setRightToLeft(true);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#0A6B73').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}
function clean_(v, max) { return String(v == null ? '' : v).replace(/^[=+\-@\t\r]+/, '').trim().slice(0, max); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Optional: run once a month from the editor (or a monthly trigger) to keep only 180 days of usage events. */
function trimOldEvents() {
  const sh = sheet_(T_EV, H_EV), n = sh.getLastRow() - 1; if (n < 1) return;
  const cut = Date.now() - 180 * 864e5, v = sh.getRange(2, 1, n, 1).getValues();
  let k = 0; while (k < v.length && new Date(v[k][0]).getTime() < cut) k++;
  if (k) sh.deleteRows(2, k);
}
