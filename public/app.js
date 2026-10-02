// LapagKainan web client. Plain ES modules + Leaflet; talks to the same REST API the Android app will use.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const BANDS = { under50: 'Under ₱50', '50-100': '₱50–₱100', '100-200': '₱100–₱200', '200-500': '₱200–₱500', '500+': '₱500+' };
const TIER = { under50: '₱', '50-100': '₱', '100-200': '₱₱', '200-500': '₱₱₱', '500+': '₱₱₱₱' };
const TAG_GROUPS = {
  'Food type': ['Filipino', 'Japanese', 'Korean', 'Chinese', 'American', 'Mexican', 'Italian', 'Thai'],
  'Filipino food': ['Silog', 'Pares', 'Lugaw', 'Ihaw-Ihaw', 'Carinderia', 'Street Food', 'Halo-Halo', 'BBQ', 'Bakery', 'Café', 'Samgyup'],
  Vibe: ['Budget', 'Student-friendly', 'Open late', 'Spicy', 'Family-friendly', 'Hidden gem', 'Quick meal'],
};
const REASONS = { fake_spot: 'Fake food spot', wrong_location: 'Wrong location', duplicate: 'Duplicate', closed: '🔴 Appears closed', fake_review: 'Fake review',
  stolen_photo: 'Stolen photo', spam: 'Spam', offensive: 'Offensive content', promotional: 'Promotional / business manipulation', incorrect_info: 'Incorrect information', other: 'Other' };

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } },
};
let token = store.get('lk_token'), me = null;

async function api(method, url, body) {
  const res = await fetch('/api' + url, {
    method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong'), { status: res.status, data });
  return data;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200);
}
const ago = (ms) => {
  const m = (Date.now() - ms) / 6e4;
  if (m < 2) return 'just now'; if (m < 60) return `${Math.round(m)}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`; if (m < 43200) return `${Math.round(m / 1440)}d ago`;
  return `${Math.round(m / 43200)}mo ago`;
};
const dist = (m) => (m == null ? '' : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
const photoUrl = (id) => `/api/photos/${id}`;

async function needLogin() {
  if (me) return true;
  toast('Mag-login muna para makasali sa community 🍜'); openAuth(); return false;
}

// ---------- image prep: downscale in the browser so uploads stay small ----------
function readImage(file, max = 1280) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return reject(new Error('Pick an image file.'));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = url;
  });
}

// ---------- geolocation ----------
let userLoc = null;
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('GPS not available on this device.'));
    navigator.geolocation.getCurrentPosition(
      (p) => { userLoc = { lat: p.coords.latitude, lng: p.coords.longitude }; resolve(userLoc); },
      () => reject(new Error('Location is off. You can still browse — or allow GPS for "food near me".')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
  });
}

// ---------- map ----------
const state = { filters: { radius: 0, price: new Set(), tags: new Set(), min: {}, verified: false, recent: false, inactive: false }, q: '', mode: 'hybrid', spots: [] };
const map = L.map('map', { zoomControl: false }).setView([14.8, 120.95], 11);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
const markers = L.layerGroup().addTo(map);
let meMarker = null;

const pinIcon = (s) => L.divIcon({ className: '', html: `<div class="pin ${s.status !== 'active' ? 'off' : ''}"><span>${s.status === 'active' ? '🍜' : '🔴'}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });

function spotCardHtml(s) {
  const r = s.ratings.overall;
  return `<article class="spotCard" data-id="${s.id}">
    <div class="ph" style="${s.coverPhoto ? `background-image:url(${photoUrl(s.coverPhoto)})` : ''}">${s.coverPhoto ? '' : '🍜'}</div>
    <div style="min-width:0">
      <h4>${esc(s.name)}</h4>
      <div class="meta">📍 ${esc([s.municipality, s.province].filter(Boolean).join(', ') || 'Unknown area')}${s.distanceM != null ? ' · ' + dist(s.distanceM) : ''}</div>
      <div class="meta">${TIER[s.priceBand]} ${BANDS[s.priceBand]} ${r ? '· ⭐ ' + r : ''}</div>
      <div>${s.tags.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <div class="meta">${s.status === 'inactive' ? '<span class="badge off">🔴 INACTIVE</span> ' : ''}${s.verifiedVisits ? `<span class="badge ver">🟢 ${s.verifiedVisits} verified</span> ` : ''}❤️ ${s.likes} 💬 ${s.comments}</div>
    </div></article>`;
}
function bindCards(root) { $$('.spotCard', root).forEach((el) => el.addEventListener('click', () => openSpot(+el.dataset.id))); }

function activeFilterCount() {
  const f = state.filters;
  return (f.radius ? 1 : 0) + f.price.size + f.tags.size + Object.values(f.min).filter(Boolean).length + [f.verified, f.recent, f.inactive].filter(Boolean).length;
}
function buildParams(extra = {}) {
  const f = state.filters, p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (f.price.size) p.set('price', [...f.price].join(','));
  if (f.tags.size) p.set('tags', [...f.tags].join(','));
  for (const [k, v] of Object.entries(f.min)) if (v) p.set('min' + k, v);
  if (f.verified) p.set('verified', '1'); if (f.recent) p.set('recent', '1'); if (f.inactive) p.set('inactive', '1');
  Object.entries(extra).forEach(([k, v]) => p.set(k, v));
  return p;
}

let loadSeq = 0;
async function loadSpots({ fit = false } = {}) {
  const seq = ++loadSeq, f = state.filters;
  let extra = {};
  if (f.radius) {
    const c = userLoc || map.getCenter();
    extra = { lat: c.lat, lng: c.lng, radius: f.radius };
  } else if (!state.q) {
    const b = map.getBounds(); extra = { bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].join(',') };
    if (userLoc) Object.assign(extra, { lat: userLoc.lat, lng: userLoc.lng });
  } else if (userLoc) Object.assign(extra, { lat: userLoc.lat, lng: userLoc.lng });
  try {
    const { spots } = await api('GET', '/spots?' + buildParams(extra));
    if (seq !== loadSeq) return;
    state.spots = spots; renderSpots();
    if (fit && spots.length) map.fitBounds(L.latLngBounds(spots.map((s) => [s.lat, s.lng])), { padding: [60, 60], maxZoom: 16 });
    return spots;
  } catch (e) { toast(e.message); }
}
function renderSpots() {
  markers.clearLayers();
  state.spots.forEach((s) => L.marker([s.lat, s.lng], { icon: pinIcon(s) }).on('click', () => openSpot(s.id)).addTo(markers));
  const box = $('#cards');
  box.innerHTML = state.spots.length ? state.spots.map(spotCardHtml).join('')
    : `<div class="empty spotCard" style="width:auto"><div><b>Wala pang food spot dito.</b><br>May nakita ka bang solid na food spot? <a href="#" id="emptyLapag"><u>Lapag mo!</u></a></div></div>`;
  bindCards(box); $('#emptyLapag')?.addEventListener('click', (e) => { e.preventDefault(); openLapag(); });
  $('#fCount').textContent = activeFilterCount() ? `(${activeFilterCount()})` : '';
}
let moveT;
map.on('moveend', () => { clearTimeout(moveT); moveT = setTimeout(() => { if (!state.filters.radius && !state.q) loadSpots(); }, 350); });

function setMode(m) {
  state.mode = m; $('#view-map').dataset.mode = m;
  $$('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  setTimeout(() => map.invalidateSize(), 50);
}
$$('#modeSeg button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

async function locateMe() {
  const hint = $('#geoHint');
  try {
    const l = await getLocation();
    hint.hidden = true;
    meMarker?.remove(); meMarker = L.marker([l.lat, l.lng], { icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [16, 16] }), interactive: false }).addTo(map);
    state.q = ''; $('#q').value = '';
    if (!state.filters.radius) { state.filters.radius = 3000; $('#fRadius').value = '3000'; }
    map.setView([l.lat, l.lng], 15); await loadSpots();
    toast('Mga hidden gem malapit sa\'yo 📍');
  } catch (e) { hint.textContent = e.message; hint.hidden = false; setTimeout(() => (hint.hidden = true), 6000); }
}
$('#locateBtn').addEventListener('click', locateMe);

// ---------- filters ----------
function initFilters() {
  $('#fPrice').innerHTML = Object.entries(BANDS).map(([k, v]) => `<button class="chip" data-k="${k}">${v}</button>`).join('');
  $('#fTags').innerHTML = Object.values(TAG_GROUPS).flat().map((t) => `<button class="chip" data-k="${esc(t)}">${esc(t)}</button>`).join('');
  $$('select[data-min]').forEach((s) => (s.innerHTML = '<option value="">Any</option>' + [3, 3.5, 4, 4.5].map((n) => `<option value="${n}">${n}+</option>`).join('')));
  const toggle = (id, set) => $(id).addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    set.has(b.dataset.k) ? set.delete(b.dataset.k) : set.add(b.dataset.k); b.classList.toggle('on'); refresh();
  });
  toggle('#fPrice', state.filters.price); toggle('#fTags', state.filters.tags);
  $('#fRadius').addEventListener('change', (e) => {
    $('#customRadiusWrap').hidden = e.target.value !== 'custom';
    state.filters.radius = e.target.value === 'custom' ? +$('#fCustom').value * 1000 : +e.target.value; refresh();
  });
  $('#fCustom').addEventListener('change', (e) => { state.filters.radius = +e.target.value * 1000; refresh(); });
  $$('select[data-min]').forEach((s) => s.addEventListener('change', () => { state.filters.min[s.dataset.min] = s.value; refresh(); }));
  for (const [id, k] of [['#fVerified', 'verified'], ['#fRecent', 'recent'], ['#fInactive', 'inactive']]) $(id).addEventListener('change', (e) => { state.filters[k] = e.target.checked; refresh(); });
  $('#fReset').addEventListener('click', () => {
    Object.assign(state.filters, { radius: 0, verified: false, recent: false, inactive: false, min: {} });
    state.filters.price.clear(); state.filters.tags.clear();
    $$('#filters .chip.on').forEach((c) => c.classList.remove('on')); $$('#filters select').forEach((s) => (s.value = s.options[0].value));
    $$('#filters input[type=checkbox]').forEach((c) => (c.checked = false)); $('#customRadiusWrap').hidden = true; refresh();
  });
  $('#filtersOpen').addEventListener('click', () => $('#filters').classList.add('open'));
  $('#filtersClose').addEventListener('click', () => $('#filters').classList.remove('open'));
}
const refresh = () => loadSpots();

// ---------- search ----------
$('#searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#q').value.trim(); location.hash = '#map';
  state.q = q; state.filters.radius = /near me|malapit/i.test(q) ? 3000 : state.filters.radius;
  if (/near me|malapit/i.test(q)) { state.q = q.replace(/food|near me|malapit/gi, '').trim(); await locateMe(); return; }
  const spots = await loadSpots({ fit: true });
  if (q && spots && !spots.length) {
    // No community spots matched: treat as a place name and fly there (explore anywhere in the PH).
    try {
      const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(q)}`)).json();
      if (r[0]) {
        state.q = ''; const bb = r[0].boundingbox.map(Number);
        map.fitBounds([[bb[0], bb[2]], [bb[1], bb[3]]]); toast(`Exploring ${r[0].display_name.split(',')[0]} 🗺️`);
      } else toast('Walang nahanap. Try another word?');
    } catch { toast('Walang nahanap.'); }
  }
});

// ---------- spot sheet ----------
const sheet = $('#sheet'), sheetBody = $('.sheetBody', sheet);
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
function closeSheet() { sheet.hidden = true; sheetBody.innerHTML = ''; }
const stars = (n) => (n ? `⭐ ${n}` : '—');

async function openSpot(id) {
  sheet.hidden = false; sheetBody.innerHTML = '<p class="empty">Loading…</p>';
  let d; try { d = await api('GET', `/spots/${id}`); } catch (e) { closeSheet(); return toast(e.message); }
  const { spot: s, me: my } = d;
  const dirs = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
  sheetBody.innerHTML = `
  <button class="closeX" aria-label="Close">✕</button>
  ${d.photos.length ? `<div class="hero">${d.photos.slice(0, 6).map((p) => `<img loading="lazy" alt="Community photo" src="${photoUrl(p.id)}">`).join('')}</div>` : ''}
  <h2>🍜 ${esc(s.name)}</h2>
  <div class="meta">📍 ${esc([s.municipality, s.province].filter(Boolean).join(', ') || 'Unknown area')} · Discovered by <a href="#u/${esc(s.discoverer)}"><b>@${esc(s.discoverer)}</b></a> ${ago(s.createdAt)}</div>
  <div class="row" style="margin-top:6px">${s.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
  <p>${TIER[s.priceBand]} <b>${BANDS[s.priceBand]}</b>${s.hours ? ` · 🕒 ${esc(s.hours)}` : ''}</p>
  ${s.status === 'inactive' ? `<p class="badge off">🔴 INACTIVE — community reports say it may be closed. Still open? Tap "Still open".</p>` : ''}
  ${s.description ? `<p>${esc(s.description)}</p>` : ''}
  <div class="ratings"><span>Food ${stars(s.ratings.food)}</span><span>Value ${stars(s.ratings.value)}</span>
    <span>Service ${stars(s.ratings.service)}</span><span>Cleanliness ${stars(s.ratings.cleanliness)}</span></div>
  <div class="meta">${s.verifiedVisits ? `<span class="badge ver">🟢 ${s.verifiedVisits} verified visits</span> · ` : ''}❤️ ${s.likes} likes · 💬 ${s.reviewCount} reviews</div>
  <div class="actions">
    <a class="btn primary" target="_blank" rel="noopener" href="${dirs}">🧭 Get Directions</a>
    <button class="btn ${my.liked ? 'on' : ''}" id="aLike">❤️ ${my.liked ? 'Liked' : 'Like'}</button>
    <button class="btn ${my.saved ? 'on' : ''}" id="aSave">🔖 ${my.saved ? esc(my.saved) : 'Save'}</button>
    <button class="btn good" id="aHere">📍 I'm here</button>
    <button class="btn" id="aShare">↗ Share</button>
  </div>
  <div class="sec"><h3>Community Photos</h3>
    ${d.photos.length ? `<div class="photos">${d.photos.map((p) => `<img loading="lazy" alt="${esc(p.kind)} by ${esc(p.username)}" title="${esc(p.kind)} · @${esc(p.username)}" src="${photoUrl(p.id)}" data-pid="${p.id}">`).join('')}</div>` : '<p class="meta">Wala pang photos.</p>'}
    <button class="btn small" id="aPhoto" style="margin-top:8px">📸 Add photo</button> <input type="file" accept="image/*" id="photoFile" hidden></div>
  <div class="sec"><h3>Prices <small class="meta">(community-reported)</small></h3>
    ${d.prices.map((p) => `<div class="item row" style="justify-content:space-between"><span>${esc(p.item)} ........ <b>₱${+p.price}</b></span><small>${ago(p.created_at)} by @${esc(p.username)}</small></div>`).join('') || '<p class="meta">No price reports yet.</p>'}
    <form id="priceForm" class="row" style="margin-top:6px"><input name="item" placeholder="Item (e.g. Pares)" required maxlength="60" style="flex:2;min-width:0"><input name="price" type="number" min="0" step="0.5" placeholder="₱" required style="width:80px"><button class="btn small">Add</button></form></div>
  <div class="sec"><h3>Reviews</h3>
    ${d.reviews.map((r) => `<div class="item"><b>@${esc(r.username)}</b> ${r.verified ? '<span class="badge ver">🟢 Verified Visit</span>' : ''} <small>${ago(r.created_at)}</small>
      <div class="meta">Overall ⭐${r.overall} · Food ${r.food} · Value ${r.value} · Service ${r.service} · Clean ${r.cleanliness}</div>
      ${r.body ? `<div>${esc(r.body)}</div>` : ''}<button class="btn ghost small" data-report="review:${r.id}">Report</button></div>`).join('') || '<p class="meta">Wala pang review. Kumain ka na ba dito?</p>'}
    <button class="btn small" id="aReview">✍️ ${my.reviewed ? 'Edit my review' : 'Write a review'}</button></div>
  <div class="sec"><h3>Comments</h3>
    ${d.comments.map((c) => `<div class="item"><b>@${esc(c.username)}</b>: ${esc(c.body)} <small>${ago(c.created_at)}</small> <button class="btn ghost small" data-report="comment:${c.id}">Report</button></div>`).join('')}
    <form id="commentForm" class="row" style="margin-top:6px"><input name="body" placeholder="Share what you know (hours, tips…)" required maxlength="600" style="flex:1;min-width:0"><button class="btn small">Post</button></form></div>
  <div class="sec"><h3>Help keep this accurate</h3><div class="actions">
    <button class="btn small ${my.signal === 'open' ? 'on' : ''}" id="aOpen">✅ Still open</button>
    <button class="btn small ${my.signal === 'closed' ? 'on' : ''}" id="aClosed">🔴 Appears closed</button>
    <button class="btn small" data-report="spot:${s.id}">🚩 Report</button></div></div>`;

  const reload = () => openSpot(id);
  $('.closeX', sheetBody).onclick = closeSheet;
  const guard = (fn) => async (e) => { e?.preventDefault?.(); if (!(await needLogin())) return; try { await fn(e); } catch (er) { toast(er.message); } };
  $('#aLike').onclick = guard(async () => { await api(my.liked ? 'DELETE' : 'POST', `/spots/${id}/like`, my.liked ? undefined : {}); await reload(); loadSpots(); });
  $('#aSave').onclick = guard(async () => {
    if (my.saved) { await api('DELETE', `/spots/${id}/save`); return reload(); }
    const lists = ['Want to Try', 'Visited', 'Favorites'];
    const pick = await choose('Save to…', lists, true); if (!pick) return;
    await api('PUT', `/spots/${id}/save`, { list: pick }); toast('Saved 🔖'); reload();
  });
  $('#aShare').onclick = async () => {
    const url = `${location.origin}/#spot/${id}`;
    try { navigator.share ? await navigator.share({ title: s.name, text: 'Hidden food exists somewhere 🍜', url }) : (await navigator.clipboard.writeText(url), toast('Link copied')); } catch { /* cancelled */ }
  };
  $('#aPhoto').onclick = guard(() => $('#photoFile').click());
  $('#photoFile').onchange = guard(async (e) => {
    const kind = await choose('What kind of photo?', ['food', 'exterior', 'menu', 'interior']); if (!kind) return;
    await api('POST', `/spots/${id}/photos`, { photo: await readImage(e.target.files[0]), kind }); toast('Photo added 📸'); reload();
  });
  $('#priceForm').onsubmit = guard(async (e) => { const f = new FormData(e.target); await api('POST', `/spots/${id}/prices`, { item: f.get('item'), price: +f.get('price') }); reload(); });
  $('#commentForm').onsubmit = guard(async (e) => { await api('POST', `/spots/${id}/comments`, { body: new FormData(e.target).get('body') }); reload(); });
  $('#aReview').onclick = guard(() => openReview(s, my, reload));
  $('#aHere').onclick = guard(() => openImHere(s, reload));
  $('#aOpen').onclick = guard(async () => { await api('POST', `/spots/${id}/signal`, { kind: 'open' }); toast('Salamat! Noted.'); reload(); loadSpots(); });
  $('#aClosed').onclick = guard(async () => { const r = await api('POST', `/spots/${id}/signal`, { kind: 'closed' }); toast(r.status === 'inactive' ? '🔴 Marked INACTIVE by the community' : 'Salamat sa report.'); reload(); loadSpots(); });
  $$('[data-report]', sheetBody).forEach((b) => (b.onclick = guard(() => openReport(...b.dataset.report.split(':')))));
  map.panTo([s.lat, s.lng]);
}

// ---------- modal helpers ----------
const modal = $('#modal'), modalBody = $('.modalBody', modal);
function openModal(html) { modalBody.innerHTML = `<button class="closeX" aria-label="Close">✕</button>${html}`; modal.hidden = false; $('.closeX', modalBody).onclick = closeModal; }
function closeModal() { modal.hidden = true; modalBody.innerHTML = ''; modal._cleanup?.(); modal._cleanup = null; }
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
function choose(title, options, allowCustom = false) {
  return new Promise((resolve) => {
    openModal(`<h3>${esc(title)}</h3><div class="actions" id="choices">${options.map((o) => `<button class="btn" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      ${allowCustom ? '<form id="customList" class="row"><input placeholder="New collection…" maxlength="40" style="flex:1;padding:8px;border-radius:12px;border:1px solid var(--line)"><button class="btn small">Create</button></form>' : ''}`);
    let done = false; const finish = (v) => { if (done) return; done = true; closeModal(); resolve(v); };
    modal._cleanup = () => finish(null);
    $('#choices').onclick = (e) => { const b = e.target.closest('button'); if (b) finish(b.dataset.v); };
    $('#customList')?.addEventListener('submit', (e) => { e.preventDefault(); const v = $('input', e.target).value.trim(); if (v) finish(v); });
  });
}

// ---------- auth ----------
function openAuth(mode = 'login') {
  openModal(`<h2>${mode === 'login' ? 'Welcome back 👋' : 'Sumali sa LapagKainan'}</h2><p class="sub">Hidden food exists somewhere. Help us find it.</p>
    <form class="form" id="authForm">
      ${mode === 'register' ? '<label>Username (public)</label><input name="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_.]+" autocomplete="username"><label>Email</label><input name="email" type="email" required autocomplete="email">'
        : '<label>Username or email</label><input name="login" required autocomplete="username">'}
      <label>Password</label><input name="password" type="password" required minlength="8" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}">
      <p class="err" id="authErr"></p><button class="btn primary" style="width:100%">${mode === 'login' ? 'Log in' : 'Create account'}</button></form>
    <p class="meta" style="text-align:center">${mode === 'login' ? 'New here? <a href="#" id="swap"><u>Create an account</u></a>' : 'Have an account? <a href="#" id="swap"><u>Log in</u></a>'}</p>
    <p class="meta">Reviews are never anonymous — your username is shown. Your exact GPS is never shown to anyone.</p>`);
  $('#swap').onclick = (e) => { e.preventDefault(); openAuth(mode === 'login' ? 'register' : 'login'); };
  $('#authForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('POST', `/auth/${mode}`, Object.fromEntries(new FormData(e.target)));
      token = r.token; store.set('lk_token', token); me = r.user; closeModal(); paintAuth(); toast(`Hi @${me.username}! 🍜`); route();
    } catch (er) { $('#authErr').textContent = er.message; }
  };
}
function paintAuth() { $('#authBtn').textContent = me ? `@${me.username}` : 'Log in'; }
$('#authBtn').addEventListener('click', () => (me ? (location.hash = '#profile') : openAuth()));

// ---------- Lapag (submit a discovery) ----------
const PH_CENTER = [14.8, 120.95];
async function openLapag() {
  if (!(await needLogin())) return;
  closeSheet();
  const f = { lat: null, lng: null, photo: null, tags: new Set() };
  openModal(`<h2>➕ Lapag mo!</h2><p class="sub">May nakita ka bang solid na food spot?</p>
  <form class="form" id="lapagForm">
    <label>Where is it? <small class="meta">(tap the map or use your GPS)</small></label>
    <div id="miniMap" class="miniMap"></div>
    <div class="row"><button type="button" class="btn small" id="useGps">📍 Use my GPS</button><span class="meta" id="locTxt">No location yet</span></div>
    <label>Food spot name</label><input name="name" required minlength="2" maxlength="80" placeholder="Aling Nena's Pares">
    <div class="row"><div style="flex:1"><label>Municipality / City</label><input name="municipality" maxlength="80" id="fMuni"></div><div style="flex:1"><label>Province</label><input name="province" maxlength="80" id="fProv"></div></div>
    <label>Category <small class="meta">(pick any)</small></label>
    ${Object.entries(TAG_GROUPS).map(([g, ts]) => `<div class="meta">${g}</div><div class="chips" data-group>${ts.map((t) => `<button type="button" class="chip" data-k="${esc(t)}">${esc(t)}</button>`).join('')}</div>`).join('')}
    <label>Price range</label><select name="priceBand" required>${Object.entries(BANDS).map(([k, v]) => `<option value="${k}" ${k === '50-100' ? 'selected' : ''}>${TIER[k]} · ${v}</option>`).join('')}</select>
    <label>Description</label><textarea name="description" maxlength="1000" placeholder="Randomly found this while waiting for the jeep…"></textarea>
    <label>Opening hours <small class="meta">(optional)</small></label><input name="hours" maxlength="120" placeholder="Mon–Sat 6am–10pm">
    <label>Photo</label><input type="file" accept="image/*" id="lapagPhoto"><img id="lapagPrev" alt="" style="max-width:100%;border-radius:12px;margin-top:6px" hidden>
    <p class="err" id="lapagErr"></p>
    <button class="btn primary" style="width:100%" id="lapagSubmit">Lapag it! 🍜</button>
  </form>`);
  const mm = L.map('miniMap').setView(userLoc ? [userLoc.lat, userLoc.lng] : map.getCenter(), userLoc ? 17 : Math.max(map.getZoom(), 13));
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OSM' }).addTo(mm);
  let pin; modal._cleanup = () => mm.remove();
  const setPoint = async (lat, lng, pan) => {
    f.lat = lat; f.lng = lng; pin ? pin.setLatLng([lat, lng]) : (pin = L.marker([lat, lng], { draggable: true }).addTo(mm).on('dragend', () => setPoint(pin.getLatLng().lat, pin.getLatLng().lng)));
    if (pan) mm.setView([lat, lng], 18);
    $('#locTxt').textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    try { // best-effort reverse geocode to prefill municipality/province
      const a = (await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&lat=${lat}&lon=${lng}`)).json()).address || {};
      const muni = a.city || a.town || a.municipality || a.village || a.suburb || '', prov = a.province || a.state || a.region || '';
      if (!$('#fMuni').value) $('#fMuni').value = muni; if (!$('#fProv').value) $('#fProv').value = prov;
    } catch { /* offline: user can type it */ }
  };
  mm.on('click', (e) => setPoint(e.latlng.lat, e.latlng.lng));
  $('#useGps').onclick = async () => { try { const l = await getLocation(); setPoint(l.lat, l.lng, true); } catch (e) { $('#lapagErr').textContent = e.message; } };
  if (userLoc) setPoint(userLoc.lat, userLoc.lng);
  $$('[data-group]').forEach((g) => g.addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; f.tags.has(b.dataset.k) ? f.tags.delete(b.dataset.k) : f.tags.add(b.dataset.k); b.classList.toggle('on'); }));
  $('#lapagPhoto').onchange = async (e) => { try { f.photo = await readImage(e.target.files[0]); $('#lapagPrev').src = f.photo; $('#lapagPrev').hidden = false; } catch (er) { $('#lapagErr').textContent = er.message; } };

  const submit = async (confirmNew) => {
    const fd = Object.fromEntries(new FormData($('#lapagForm')));
    const err = $('#lapagErr'); err.textContent = '';
    if (f.lat == null) return (err.textContent = 'Set the location first.');
    if (!f.tags.size) return (err.textContent = 'Pick at least one category.');
    if (!f.photo) return (err.textContent = 'Add a photo.');
    try {
      const { spot } = await api('POST', '/spots', { ...fd, lat: f.lat, lng: f.lng, tags: [...f.tags], photo: f.photo, confirmNew });
      closeModal(); toast('Na-lapag na! 🍜 Salamat sa pagshare.'); map.setView([spot.lat, spot.lng], 16); location.hash = '#map'; await loadSpots(); openSpot(spot.id);
    } catch (er) {
      if (er.status === 409 && er.data.matches) return showDuplicates(er.data.matches, () => submit(true));
      err.textContent = er.message;
    }
  };
  $('#lapagForm').onsubmit = (e) => { e.preventDefault(); submit(false); };
}
function showDuplicates(matches, createNew) {
  const el = document.createElement('div'); el.className = 'sec';
  el.innerHTML = `<h3>We found a food spot nearby:</h3>${matches.map((m) => `<div class="item"><b>📍 ${esc(m.name)}</b><div class="meta">${m.distanceM} meters away</div>
    <div class="meta">Is this the place you're trying to add?</div><button type="button" class="btn small primary" data-open="${m.id}">Yes, this is it</button></div>`).join('')}
    <button type="button" class="btn small" id="dupNew">No, create new discovery</button>`;
  $('#lapagErr').after(el); el.scrollIntoView({ behavior: 'smooth' });
  $$('[data-open]', el).forEach((b) => (b.onclick = () => { closeModal(); openSpot(+b.dataset.open); }));
  $('#dupNew', el).onclick = () => { el.remove(); createNew(); };
}
$('#lapagBtn').addEventListener('click', openLapag); $('#lapagTop').addEventListener('click', openLapag);

// ---------- "I'm here" verified visit + review ----------
async function openImHere(s, done) {
  openModal(`<h2>📍 I'm here</h2><p class="sub">${esc(s.name)} — we'll check you're actually nearby. Your exact location is never shown to anyone.</p>
    <form class="form" id="hereForm"><label>Photo of your meal or the place</label><input type="file" accept="image/*" capture="environment" id="herePhoto" required>
    <p class="err" id="hereErr"></p><button class="btn good" style="width:100%" id="hereGo">Verify my visit</button></form>`);
  $('#hereForm').onsubmit = async (e) => {
    e.preventDefault(); $('#hereGo').disabled = true; $('#hereErr').textContent = 'Checking your location…';
    try {
      const l = await getLocation(); const photo = await readImage($('#herePhoto').files[0]);
      const r = await api('POST', `/spots/${s.id}/visits`, { lat: l.lat, lng: l.lng, photo });
      closeModal(); toast('🟢 Visit verified! Now share how it was.');
      const d = await api('GET', `/spots/${s.id}`); openReview(d.spot, { ...d.me, visitId: r.visitId }, done);
    } catch (er) { $('#hereErr').textContent = er.message; $('#hereGo').disabled = false; }
  };
}
function openReview(s, my, done) {
  const dims = [['food', 'Food'], ['value', 'Value'], ['service', 'Service'], ['cleanliness', 'Cleanliness'], ['overall', 'Overall experience']];
  const vals = {};
  openModal(`<h2>✍️ Review: ${esc(s.name)}</h2>
    <p class="meta">${my.visitId ? '🟢 This review will be marked Verified Visit.' : 'Tip: tap "📍 I\'m here" at the spot to earn a 🟢 Verified Visit badge.'} Reviews show your @username.</p>
    <form class="form" id="reviewForm">${dims.map(([k, l]) => `<label>${l}</label><div class="stars" data-dim="${k}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-label="${n} stars">★</button>`).join('')}</div>`).join('')}
    <label>Your experience</label><textarea name="body" maxlength="2000" placeholder="Ano'ng na-feel mo sa food?"></textarea>
    <p class="err" id="revErr"></p><button class="btn primary" style="width:100%">Post review</button></form>`);
  $$('.stars').forEach((el) => el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; vals[el.dataset.dim] = +b.dataset.n;
    $$('button', el).forEach((x) => x.classList.toggle('on', +x.dataset.n <= vals[el.dataset.dim]));
  }));
  $('#reviewForm').onsubmit = async (e) => {
    e.preventDefault();
    if (dims.some(([k]) => !vals[k])) return ($('#revErr').textContent = 'Rate all five (tap the stars).');
    try { await api('POST', `/spots/${s.id}/reviews`, { ...vals, body: new FormData(e.target).get('body'), visitId: my.visitId }); closeModal(); toast('Salamat sa review! 🙏'); done?.(); loadSpots(); }
    catch (er) { $('#revErr').textContent = er.message; }
  };
}
function openReport(type, id) {
  openModal(`<h2>🚩 Report</h2><form class="form" id="repForm"><label>What's wrong?</label>
    <select name="reason">${Object.entries(REASONS).filter(([k]) => type === 'spot' || !['fake_spot', 'wrong_location', 'duplicate', 'closed'].includes(k)).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    <label>Details (optional)</label><textarea name="note" maxlength="500"></textarea><p class="err" id="repErr"></p><button class="btn primary">Send report</button></form>`);
  $('#repForm').onsubmit = async (e) => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target));
    try { const r = await api('POST', '/reports', { targetType: type, targetId: +id, ...fd }); closeModal(); toast(r.duplicate ? 'You already reported this.' : 'Salamat! Moderators will review it.'); }
    catch (er) { $('#repErr').textContent = er.message; }
  };
}

// ---------- Discover / Saved / Profile ----------
const section = (title, spots) => spots?.length ? `<div class="sec"><h3>${title}</h3><div class="hscroll">${spots.map(spotCardHtml).join('')}</div></div>` : '';
async function viewDiscover() {
  const v = $('#view-discover'); v.innerHTML = '<h2>🔥 Discover</h2><p class="sub">Hidden food exists somewhere.</p><p class="empty">Loading…</p>';
  const p = new URLSearchParams(); if (userLoc) { p.set('lat', userLoc.lat); p.set('lng', userLoc.lng); }
  const d = await api('GET', '/discover?' + p);
  v.innerHTML = `<h2>🔥 Discover</h2><p class="sub">Walang ads. Walang bayad na ranking. Community lang.</p>
    ${userLoc ? '' : '<button class="btn small" id="dGps">📍 Show spots near me</button>'}
    ${section('📍 Near You', d.near)}${section('🆕 Recently Discovered', d.recent)}${section('🔥 Community Favorites', d.favorites)}
    ${section('💸 Budget Finds', d.budget)}${section('👀 You Might Have Missed', d.missed)}
    ${Object.values(d).every((a) => !a.length) ? '<div class="empty"><b>Wala pang discoveries.</b><br>Be the first — tap ➕ Lapag!</div>' : ''}`;
  bindCards(v); $('#dGps')?.addEventListener('click', async () => { try { await getLocation(); viewDiscover(); } catch (e) { toast(e.message); } });
}
async function viewSaved() {
  const v = $('#view-saved');
  if (!me) { v.innerHTML = `<h2>🔖 Saved</h2><p class="empty">Mag-login para makita ang saved food spots mo.<br><br><button class="btn primary" id="svLogin">Log in</button></p>`; $('#svLogin').onclick = () => openAuth(); return; }
  const { lists } = await api('GET', '/me/saves'); const names = Object.keys(lists);
  v.innerHTML = `<h2>🔖 Saved Food Map</h2><p class="sub">Your personal food trip.</p><div id="savedMap" class="miniMap" style="height:260px"></div>
    ${names.map((n) => `<div class="sec"><h3>${esc(n)} <small class="meta">(${lists[n].length})</small></h3><div class="hscroll">${lists[n].map(spotCardHtml).join('')}</div></div>`).join('') || '<p class="empty">Wala ka pang saved. Tap 🔖 sa kahit anong food spot.</p>'}`;
  bindCards(v);
  const sm = L.map('savedMap').setView(PH_CENTER, 9); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(sm);
  const all = Object.values(lists).flat(); all.forEach((s) => L.marker([s.lat, s.lng], { icon: pinIcon(s) }).on('click', () => openSpot(s.id)).addTo(sm));
  if (all.length) sm.fitBounds(L.latLngBounds(all.map((s) => [s.lat, s.lng])), { padding: [30, 30], maxZoom: 15 });
}
async function viewProfile(username) {
  const v = $('#view-profile');
  const name = username || me?.username;
  if (!name) { v.innerHTML = `<h2>👤 Profile</h2><p class="empty">Mag-login para makita ang profile mo.<br><br><button class="btn primary" id="pfLogin">Log in / Sign up</button></p>`; $('#pfLogin').onclick = () => openAuth(); return; }
  let d; try { d = await api('GET', `/users/${encodeURIComponent(name)}`); } catch (e) { v.innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  const own = me && me.username.toLowerCase() === d.user.username.toLowerCase();
  v.innerHTML = `<h2>@${esc(d.user.username)}</h2>
    <div class="stats"><div><b>🍜 ${d.stats.discoveries}</b>Discoveries</div><div><b>📍 ${d.stats.verifiedVisits}</b>Verified Visits</div><div><b>✍️ ${d.stats.reviews}</b>Reviews</div><div><b>❤️ ${d.stats.likesReceived}</b>Likes Received</div></div>
    <div class="badges">${d.badges.map((b) => `<div class="bdg ${b.earned ? '' : 'off'}" title="${esc(b.desc)}">${b.icon} <b>${esc(b.name)}</b>${b.earned ? '' : `<div class="meta">${b.progress || ''}</div>`}</div>`).join('')}</div>
    <div class="sec"><h3>Discoveries</h3>${d.spots.length ? `<div class="hscroll">${d.spots.map(spotCardHtml).join('')}</div>` : '<p class="meta">None yet.</p>'}</div>
    <div class="sec"><h3>Reviews</h3>${d.reviews.map((r) => `<div class="item"><a href="#spot/${r.spot_id}"><b>${esc(r.spot_name)}</b></a> ⭐${r.overall} ${r.verified ? '<span class="badge ver">🟢 Verified Visit</span>' : ''} <small>${ago(r.created_at)}</small><div>${esc(r.body)}</div></div>`).join('') || '<p class="meta">None yet.</p>'}</div>
    ${own ? '<p><button class="btn" id="logout">Log out</button></p>' : ''}`;
  bindCards(v);
  $('#logout')?.addEventListener('click', () => { token = null; me = null; store.set('lk_token', null); paintAuth(); location.hash = '#map'; toast('Ingat!'); });
}

// ---------- router ----------
function route() {
  const h = location.hash.slice(1) || 'map';
  const [name, arg] = h.split('/');
  const view = ['map', 'discover', 'saved', 'profile'].includes(name) ? name : name === 'u' ? 'profile' : 'map';
  $$('.view').forEach((el) => (el.hidden = el.id !== `view-${view}`));
  $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === view));
  if (view === 'map') setTimeout(() => { map.invalidateSize(); }, 50);
  if (view === 'discover') viewDiscover(); if (view === 'saved') viewSaved();
  if (view === 'profile') viewProfile(name === 'u' ? decodeURIComponent(arg) : null);
  if (name === 'spot' && +arg) { closeSheet(); openSpot(+arg); }
}
window.addEventListener('hashchange', () => { closeSheet(); closeModal(); route(); });

// ---------- boot ----------
(async function boot() {
  initFilters(); setMode('hybrid');
  if (token) { try { me = (await api('GET', '/me')).user; } catch { /* offline */ } if (!me) { token = null; store.set('lk_token', null); } }
  paintAuth(); route();
  await loadSpots({ fit: false });
  if (!state.spots.length) { // empty viewport: fall back to wherever the community has put pins
    const { spots } = await api('GET', '/spots?limit=200').catch(() => ({ spots: [] }));
    if (spots.length) { map.fitBounds(L.latLngBounds(spots.map((s) => [s.lat, s.lng])), { padding: [60, 60], maxZoom: 14 }); }
  }
})();
