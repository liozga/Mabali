// Mabali live check (v1.54.0): checks the public site and the live monitoring server, end to end, without writing anything.
// Runs every day from .github/workflows/live-check.yml; a failure e-mails the repo owner (GitHub's default for failed scheduled runs).
// Manual run: node tools/live_check.mjs [site URL]
const SITE = (process.argv[2] || 'https://liozga.github.io/Mabali/').replace(/\/?$/, '/');
const NEED_SERVER = '1.54.0';           // the monitor.gs version in this repo (fails until it is deployed on the app's URL)
const MIN_PLACES = 9000;
let fail = 0; const ok = (name, cond, info = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!cond) fail++; };
const ver = s => String(s || '0').split('.').map(Number); const ge = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return true; };
async function get(url, asJson) { const t0 = Date.now(); const r = await fetch(url, { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  const body = asJson ? await r.json() : await r.text(); return { status: r.status, body, ms: Date.now() - t0 }; }
async function step(name, fn) { try { await fn(); } catch (e) { ok(name, false, String(e && e.message || e)); } }

let appV = '', endpoint = '';
await step('site loads', async () => { const r = await get(SITE + '?t=' + Date.now());
  ok('site loads (HTTP 200)', r.status === 200, r.ms + ' ms');
  appV = (r.body.match(/const APP_VERSION\s*=\s*['"]([\d.]+)['"]/) || [])[1] || '';
  endpoint = (r.body.match(/monitorEndpoint\s*:\s*"(https:\/\/script\.google\.com\/macros\/s\/[^"]+\/exec)"/) || [])[1] || '';
  ok('site has an app version', !!appV, appV); ok('site has a monitoring endpoint', !!endpoint, endpoint.slice(0, 60) + '…'); });
await step('version.json', async () => { const r = await get(SITE + 'version.json?t=' + Date.now(), true);
  ok('version.json matches the app (self-update works)', r.body && r.body.v === appV, `version.json=${r.body && r.body.v} app=${appV}`); });
await step('places.json', async () => { const r = await get(SITE + 'places.json?t=' + Date.now(), true); const n = Array.isArray(r.body) ? r.body.length : (r.body && r.body.places || []).length;
  ok(`places.json has at least ${MIN_PLACES} places`, n >= MIN_PLACES, String(n)); });
for (const f of ['admin.html', 'admin.js', 'manifest.webmanifest', 'icons/apple-touch-icon-180.png'])
  await step(f, async () => { const r = await get(SITE + f); ok(`${f} is served`, r.status === 200); });
await step('admin endpoint', async () => { const r = await get(SITE + 'admin.js?t=' + Date.now()); const ep = (r.body.match(/ENDPOINT\s*=\s*['"]([^'"]+)['"]/) || [])[1] || '';
  ok('dashboard uses the same server as the app', !!endpoint && ep === endpoint); });
if (endpoint) {
  await step('server', async () => { const r = await get(endpoint, true);
    ok('server answers', r.body && r.body.ok === true && r.body.app === 'mabali-monitor', r.ms + ' ms');
    ok(`server code is ${NEED_SERVER} or newer (deployed on this URL)`, ge(r.body && r.body.v, NEED_SERVER), 'v=' + (r.body && r.body.v)); });
  await step('place corrections', async () => { const r = await get(endpoint + '?op=ov&t=' + Date.now(), true);
    ok('place corrections feed works', r.body && r.body.ok === true && typeof r.body.ov === 'object' && Array.isArray(r.body.hid), `${Object.keys(r.body.ov || {}).length} edited, ${(r.body.hid || []).length} hidden`); });
}
console.log(fail ? `\n${fail} check(s) failed` : '\nall live checks passed'); process.exit(fail ? 1 : 0);
