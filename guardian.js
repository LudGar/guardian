window.GL = (() => {
  const KEY = '653607d8cd0c4fcea2606f86117e0026';
  const OWNER = '4611686018436765841';
  // Supabase project (Settings → API). Leave empty to disable card numbering.
  const SUPABASE_URL = 'https://uianbovauxagmzwxnwkp.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_D_VNxDNF0UQp59fIg1zvBQ_er1jFvrG';
  // Bungie app → OAuth Client ID (client type: Public). Leave empty to disable sign-in.
  const BUNGIE_CLIENT_ID = '55629';
  const ok = j => { if (j.ErrorCode !== 1) throw new Error(j.Message); return j.Response; };
  const get = url => fetch(url, { headers: { 'X-API-Key': KEY } }).then(r => r.json()).then(ok);
  const api = path => get('https://www.bungie.net/Platform' + path);
  const post = (path, body) => fetch('https://www.bungie.net/Platform' + path, { method: 'POST', headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).then(ok);
  const PLAT = { 1: { code: 'xb', label: 'Xbox' }, 2: { code: 'ps', label: 'PlayStation' }, 3: { code: 'pc', label: 'Steam' }, 6: { code: 'pc', label: 'Epic' } };
  const pick = ms => ms.find(m => m.crossSaveOverride && m.crossSaveOverride === m.membershipType) || ms.find(m => !m.crossSaveOverride) || ms[0];
  const parse = raw => {
    if (!raw) return null;
    raw = String(raw).trim();
    if (/^\d+-\d+$/.test(raw)) { const [t, id] = raw.split('-'); return { type: +t, id }; }
    if (/^.+#\d{1,4}$/.test(raw)) return { name: raw };
    return null;
  };
  const fromUrl = () => { const q = new URLSearchParams(location.search); return parse(q.get('p')) || parse(q.get('player')); };
  const cache = {};
  async function resolve(ref) {
    ref = ref || fromUrl();
    if (!ref) return null;
    if (ref.type && ref.id) return ref;
    if (cache[ref.name]) return cache[ref.name];
    const i = ref.name.lastIndexOf('#');
    const ms = await post('/Destiny2/SearchDestinyPlayerByBungieName/-1/', { displayName: ref.name.slice(0, i), displayNameCode: +ref.name.slice(i + 1) });
    if (!ms || !ms.length) throw new Error('Guardian not found');
    const m = pick(ms);
    return (cache[ref.name] = { type: m.membershipType, id: m.membershipId });
  }
  async function search(prefix) {
    const r = await post('/User/Search/GlobalName/0/', { displayNamePrefix: prefix });
    return (r.searchResults || []).filter(x => x.destinyMemberships && x.destinyMemberships.length).map(x => {
      const m = pick(x.destinyMemberships);
      return { name: x.bungieGlobalDisplayName, code: String(x.bungieGlobalDisplayNameCode).padStart(4, '0'), type: m.membershipType, id: m.membershipId, platforms: [...new Set(x.destinyMemberships.map(d => (PLAT[d.membershipType] || {}).label).filter(Boolean))] };
    });
  }
  const blank = base => ({
    raids: base.raids.map(r => [r[0], 0, [], '', 0]),
    dungeons: base.dungeons.map(r => [r[0], 0, [], '', 0]),
    missions: base.missions.map(r => [r[0], 0, [], '', 0]),
    profile: {}
  });
  const k = (id, s) => 'gl-' + s + '-' + id;
  // One-way hash: the database only ever sees this, never the membership ID or name.
  const hashes = {};
  const hashId = id => hashes[id] || (hashes[id] = crypto.subtle.digest('SHA-256', new TextEncoder().encode('guardian:' + id)).then(b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')));
  const reg = {};
  function register(p) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !p) return Promise.resolve(null);
    if (reg[p.id]) return reg[p.id];
    return (reg[p.id] = hashId(p.id).then(h => fetch(SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/register_guardian', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_hash: h })
    })).then(r => r.ok ? r.json() : null).then(rows => {
      const row = Array.isArray(rows) ? rows[0] : rows;
      return row ? { no: +row.card_no, total: +row.total } : null;
    }).catch(() => null));
  }
  const qs = p => p ? '?p=' + p.type + '-' + p.id : '';
  const reportUrl = (site, p) => p ? `https://${site}.report/${(PLAT[p.type] || PLAT[3]).code}/${p.id}` : `https://${site}.report`;
  // ---- Bungie sign-in (OAuth, public client) ----
  const AUTH = 'gl-auth';
  const auth = () => { try { const a = JSON.parse(localStorage.getItem(AUTH)); return a && a.exp > Date.now() ? a : null; } catch (e) { return null; } };
  const stored = () => { try { return JSON.parse(localStorage.getItem(AUTH)); } catch (e) { return null; } };
  // Owner check survives token expiry so owner UI doesn't vanish; saving still needs a fresh sign-in.
  const isOwner = p => { const a = stored(); return !!(a && p && a.ids && a.ids.includes(String(p.id))); };
  const expired = () => { const a = stored(); return !!(a && !(a.exp > Date.now())); };
  const canLogin = () => !!BUNGIE_CLIENT_ID;
  function login(returnTo) {
    if (!BUNGIE_CLIENT_ID) return alert('Sign-in is not configured yet.');
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('gl-oauth-state', state);
    sessionStorage.setItem('gl-oauth-return', returnTo || 'me');
    location.href = 'https://www.bungie.net/en/OAuth/Authorize?client_id=' + encodeURIComponent(BUNGIE_CLIENT_ID) + '&response_type=code&state=' + state;
  }
  function logout() { localStorage.removeItem(AUTH); }
  const landing = p => './Guardian Landing.dc.html' + qs(p);
  const ready = (async () => {
    const q = new URLSearchParams(location.search);
    const code = q.get('code'), state = q.get('state');
    if (!code || !state || state !== sessionStorage.getItem('gl-oauth-state')) return;
    sessionStorage.removeItem('gl-oauth-state');
    try {
      const t = await fetch('https://www.bungie.net/Platform/App/OAuth/Token/', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-API-Key': KEY },
        body: 'grant_type=authorization_code&code=' + encodeURIComponent(code) + '&client_id=' + encodeURIComponent(BUNGIE_CLIENT_ID)
      }).then(r => r.json());
      if (!t.access_token) throw new Error(t.error_description || 'Sign-in failed');
      const m = await fetch('https://www.bungie.net/Platform/User/GetMembershipsForCurrentUser/', { headers: { 'X-API-Key': KEY, Authorization: 'Bearer ' + t.access_token } }).then(r => r.json()).then(ok);
      const ms = m.destinyMemberships || [];
      const primary = ms.find(x => x.membershipId === m.primaryMembershipId) || (ms.length ? pick(ms) : null);
      const user = m.bungieNetUser || {};
      localStorage.setItem(AUTH, JSON.stringify({
        token: t.access_token, exp: Date.now() + (t.expires_in || 3600) * 1000 - 60000,
        ids: ms.map(x => String(x.membershipId)),
        me: primary ? { type: primary.membershipType, id: primary.membershipId } : null,
        name: user.cachedBungieGlobalDisplayName || user.displayName || ''
      }));
      const ret = sessionStorage.getItem('gl-oauth-return') || 'me';
      sessionStorage.removeItem('gl-oauth-return');
      const a = auth();
      location.replace(ret === 'me' ? (a && a.me ? landing(a.me) : './Guardian Search.dc.html') : ret);
    } catch (e) {
      console.warn('Sign-in:', e.message);
      history.replaceState(null, '', location.pathname);
    }
  })();
  // ---- Shared edits (Supabase) ----
  const hasDb = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  const sb = path => SUPABASE_URL.replace(/\/$/, '') + path;
  async function loadEdits(id) {
    if (!hasDb()) return null;
    try {
      const h = await hashId(id);
      const rows = await fetch(sb('/rest/v1/guardian_edits?select=data&id_hash=eq.' + h), { headers: { apikey: SUPABASE_ANON_KEY } }).then(r => r.ok ? r.json() : []);
      return rows && rows[0] ? rows[0].data : null;
    } catch (e) { return null; }
  }
  async function saveEdits(id, data) {
    const a = auth();
    if (!a) throw new Error(expired() ? 'Session expired — sign in again to save' : 'Sign in first');
    if (!hasDb()) return false;
    const r = await fetch(sb('/functions/v1/save-guardian'), {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'x-bungie-token': a.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ membershipId: String(id), data })
    });
    if (!r.ok) throw new Error(r.status === 403 ? 'Not your Guardian' : 'Save failed (' + r.status + ')');
    return true;
  }
  return { register, auth, stored, expired, isOwner, canLogin, login, logout, ready, hasDb, loadEdits, saveEdits, landing, KEY, OWNER, get, api, post, PLAT, parse, fromUrl, resolve, search, blank, k, qs, reportUrl };
})();
