// Family Restaurant Chooser: single-page front end (no build step).

const CUISINES = ['american', 'bbq', 'breakfast', 'burgers', 'chinese', 'dessert', 'french', 'greek', 'indian', 'italian',
  'japanese', 'korean', 'mediterranean', 'mexican', 'middle eastern', 'pizza', 'ramen', 'salad', 'sandwiches', 'seafood',
  'steak', 'sushi', 'tacos', 'thai', 'vegetarian', 'vietnamese'];
const DIETS = [['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'], ['gluten_free', 'Gluten-free']];
const PRICE = ['', '$', '$$', '$$$', '$$$$'];
const EMOJI = { pizza: '🍕', italian: '🍝', sushi: '🍣', japanese: '🍱', mexican: '🌮', tacos: '🌮', chinese: '🥟', thai: '🍜',
  vietnamese: '🍜', ramen: '🍜', burger: '🍔', bbq: '🍖', seafood: '🦞', steak: '🥩', indian: '🍛', korean: '🥘',
  mediterranean: '🥙', greek: '🥙', vegan: '🥗', vegetarian: '🥗', salad: '🥗', breakfast: '🥞', dessert: '🍰' };

// ---------- tiny HTML helper (escapes everything unless wrapped in raw) ----------
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(fmt).join('') : v === false || v == null ? '' : esc(v));
const html = (strings, ...vals) => raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? fmt(vals[i]) : ''), ''));
const safeUrl = (u) => (typeof u === 'string' && /^(https?:|tel:|\/api\/photo\?)/i.test(u) ? u : '#');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- storage (best effort) ----------
const store = {
  get(key, dflt, s = localStorage) { try { return JSON.parse(s.getItem(key)) ?? dflt; } catch { return dflt; } },
  set(key, val, s = localStorage) { try { s.setItem(key, JSON.stringify(val)); } catch {} },
};

const state = {
  config: null,
  family: null,
  loc: store.get('rc.loc', { lat: null, lng: null, label: '' }),
  term: '',
  mode: store.get('rc.mode', 'chooser'),
  party: store.get('rc.party', null),
  search: store.get('rc.search', null, sessionStorage),
  searching: false,
  waitTimer: null,
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}

const timeParams = () => { const d = new Date(); return { hour: d.getHours(), minute: d.getMinutes(), dow: d.getDay() }; };
const qs = (obj) => new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== '')).toString();
const memberById = (id) => state.family?.members.find((m) => m.id === id);
const chooser = () => memberById(state.family?.chooserId);
const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const avatar = (m, cls = '') => html`<span class="avatar ${cls}" style="background:${/^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#888'}">${initials(m.name)}</span>`;
const miles = (m) => (m == null ? null : m < 160 ? 'nearby' : `${(m / 1609.34).toFixed(1)} mi`);
const emojiFor = (r) => { const hay = [...r.cuisineKeys, ...r.cuisines].join(' ').toLowerCase(); return Object.entries(EMOJI).find(([k]) => hay.includes(k))?.[1] || '🍽️'; };

// ---------- shared bits ----------
function photo(r, i = 0) {
  return r.photos?.[i]
    ? html`<img src="${safeUrl(r.photos[i])}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : html`<div class="placeholder" aria-hidden="true">${emojiFor(r)}</div>`;
}

function waitPill(w) {
  if (!w || w.status === 'closed' || w.level === 'unknown') return '';
  return html`<span class="pill wait-${w.level}" title="${w.source === 'live' ? 'Live wait' : 'Estimated wait'}">⏱ ${w.level === 'short' ? 'No wait' : `${w.minutes[0]}–${w.minutes[1]} min`}${w.source === 'live' ? ' · live' : ''}</span>`;
}

function openPill(r) {
  if (r.openNow === true) return html`<span class="pill open">Open now</span>`;
  if (r.openNow === false) return html`<span class="pill closed">Closed</span>`;
  return '';
}

function reasonsList(reasons, max = 4) {
  const sorted = [...reasons.filter((r) => r.good), ...reasons.filter((r) => !r.good)].slice(0, max);
  return sorted.length ? html`<ul class="reasons">${sorted.map((r) => html`<li class="${r.good ? '' : 'bad'}">${r.text}</li>`)}</ul>` : '';
}

// ---------- Home / search ----------
function renderTurn() {
  const fam = state.family;
  if (!fam.members.length) {
    return html`<section class="card turn"><div><h1>Welcome!</h1><p class="muted">Add your family on the <a href="#/family">Family</a> page to start the weekly rotation.</p></div></section>`;
  }
  const c = chooser();
  const idx = fam.members.indexOf(c);
  const next = fam.members[(idx + 1) % fam.members.length];
  return html`
    <section class="card turn">
      ${avatar(c)}
      <div>
        <div class="muted small">Week of ${new Date(fam.weekOf + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
        <h1>It's ${c.name}'s pick!</h1>
        <div class="muted small">Next week: ${next.name}</div>
      </div>
      <span class="spacer"></span>
      <label class="field">Switch whose turn it is
        <select id="chooserSelect">${fam.members.map((m) => html`<option value="${m.id}" ${m.id === c.id ? 'selected' : ''}>${m.name}</option>`)}</select>
      </label>
      <button class="btn" id="skipBtn" title="Move the rotation to the next person">Skip ▸</button>
    </section>`;
}

function renderSearchForm() {
  const c = chooser();
  const party = state.party || state.family.members.length || 2;
  return html`
    <form class="card stack" id="searchForm">
      <div class="form-grid">
        <label class="field">Where?
          <span class="loc-input">
            <input type="text" id="locInput" placeholder="City, address or zip" value="${state.loc.label}" autocomplete="street-address">
            <button type="button" class="btn" id="geoBtn" title="Use my current location">📍</button>
          </span>
        </label>
        <label class="field">Craving anything? (optional)
          <input type="search" id="termInput" placeholder="e.g. ramen, brunch, patio" value="${state.term}">
        </label>
        <label class="field">Party
          <input type="number" id="partyInput" min="1" max="20" value="${party}">
        </label>
      </div>
      <div class="row">
        <span class="muted small">Recommend for:</span>
        <span class="segmented" role="group" aria-label="Whose tastes">
          <button type="button" data-mode="chooser" aria-pressed="${state.mode === 'chooser'}">${c ? `${c.name}'s tastes` : 'Chooser'}</button>
          <button type="button" data-mode="family" aria-pressed="${state.mode === 'family'}">Whole family</button>
        </span>
        <span class="spacer"></span>
        <button type="button" class="btn" id="surpriseBtn" ${state.search?.results?.length ? '' : 'disabled'}>🎲 Surprise us</button>
        <button type="submit" class="btn primary big" ${state.searching ? 'disabled' : ''}>${state.searching ? 'Searching…' : 'Find restaurants'}</button>
      </div>
    </form>`;
}

function resultCard(r, i) {
  const reserve = r.actions.reserve[0], order = r.actions.order[0];
  return html`
    <article class="card rcard">
      <a class="photo" href="#/r/${r.id}" tabindex="-1">${photo(r)}<span class="rank">#${i + 1}</span></a>
      <div class="body">
        <h3><a href="#/r/${r.id}">${r.name}</a></h3>
        <div class="meta">
          ${r.rating != null ? html`<span><span class="stars">★ ${r.rating.toFixed(1)}</span> (${r.reviewCount.toLocaleString()})</span>` : ''}
          ${r.price ? html`<span>${PRICE[r.price]}</span>` : ''}
          ${r.cuisines.length ? html`<span>${r.cuisines.slice(0, 2).join(', ')}</span>` : ''}
          ${miles(r.distanceM) ? html`<span>${miles(r.distanceM)}</span>` : ''}
        </div>
        <div class="row">${openPill(r)} ${waitPill(r.wait)}</div>
        ${reasonsList(r.reasons, 3)}
      </div>
      <div class="actions">
        <a class="btn primary" href="#/r/${r.id}">Details</a>
        <a class="btn" href="${safeUrl(reserve.url)}" target="_blank" rel="noopener">Reserve</a>
        <a class="btn" href="${safeUrl(order.url)}" target="_blank" rel="noopener">Order</a>
      </div>
    </article>`;
}

function renderResults() {
  if (state.searching) return html`<div class="empty"><div class="spinner"></div>Asking Yelp and Google…</div>`;
  const s = state.search;
  if (!s) return html`<div class="empty">Pick a location and hit <b>Find restaurants</b>. Results are ranked by ratings and everyone's tastes.</div>`;
  if (s.error) return html`<div class="error">${s.error}</div>`;
  return html`
    ${s.warnings?.length ? html`<div class="error small">Some sources failed: ${s.warnings.join(' · ')}</div>` : ''}
    <div class="row"><h2>${s.results.length} places for ${s.forLabel}</h2><span class="spacer"></span><span class="muted small">Waits are ${state.config.liveWait ? 'live where available, otherwise estimated' : 'estimates'}</span></div>
    ${s.results.length ? html`<div class="results">${s.results.map(resultCard)}</div>` : html`<div class="empty">No restaurants found. Try a different location or craving.</div>`}`;
}

function renderHome() {
  $('#app').innerHTML = html`<div class="stack">${renderTurn()}${state.family.members.length ? renderSearchForm() : ''}<section id="results" class="stack">${renderResults()}</section></div>`;
  bindHome();
}

function bindHome() {
  $('#chooserSelect')?.addEventListener('change', async (e) => {
    state.family = await api('/api/family/chooser', { method: 'POST', body: { memberId: e.target.value } });
    renderHome();
  });
  $('#skipBtn')?.addEventListener('click', async () => {
    state.family = await api('/api/family/advance', { method: 'POST', body: { by: 1 } });
    toast(`Now it's ${chooser().name}'s pick`);
    renderHome();
  });
  const form = $('#searchForm');
  if (!form) return;
  $('#locInput').addEventListener('input', (e) => { state.loc = { lat: null, lng: null, label: e.target.value }; });
  $('#termInput').addEventListener('input', (e) => { state.term = e.target.value; });
  $('#partyInput').addEventListener('change', (e) => { state.party = Number(e.target.value) || null; store.set('rc.party', state.party); });
  $$('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    store.set('rc.mode', state.mode);
    $$('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $('#geoBtn').addEventListener('click', useMyLocation);
  $('#surpriseBtn').addEventListener('click', () => {
    const pool = state.search.results.filter((r) => r.openNow !== false).slice(0, 3);
    const pick = pool[Math.floor(Math.random() * pool.length)] || state.search.results[0];
    toast(`🎲 How about ${pick.name}?`);
    location.hash = `#/r/${pick.id}`;
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); runSearch(); });
}

function useMyLocation() {
  if (!navigator.geolocation) return toast('Location is not available in this browser');
  const btn = $('#geoBtn');
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.loc = { lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5), label: '📍 Current location' };
      store.set('rc.loc', state.loc);
      $('#locInput').value = state.loc.label;
      btn.disabled = false;
      runSearch();
    },
    (err) => { btn.disabled = false; toast(`Couldn't get location: ${err.message}`); },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
}

async function runSearch() {
  const c = chooser();
  if (!state.loc.lat && !state.loc.label.trim() && !state.config.demo) return toast('Enter a location first');
  store.set('rc.loc', state.loc);
  state.searching = true;
  renderHome();
  const params = {
    lat: state.loc.lat, lng: state.loc.lng, location: state.loc.lat ? '' : state.loc.label.trim() || 'San Francisco, CA',
    term: state.term, mode: state.mode, memberId: c?.id, party: state.party || state.family.members.length, ...timeParams(),
  };
  try {
    const data = await api(`/api/search?${qs(params)}`);
    state.search = { ...data, params, forLabel: state.mode === 'family' ? 'the whole family' : `${c.name}` };
  } catch (err) {
    state.search = { error: err.message };
  }
  state.searching = false;
  store.set('rc.search', state.search, sessionStorage);
  renderHome();
}

// ---------- Restaurant summary page ----------
function waitPanel(w) {
  const big = w.status === 'closed' ? 'Closed now' : w.level === 'unknown' ? 'Unknown' : w.level === 'short' ? 'Little to no wait' : `${w.minutes[0]}–${w.minutes[1]} min`;
  return html`
    <div class="wait-panel">
      <span class="dot ${w.level} ${w.source === 'live' ? 'live' : ''}"></span>
      <div>
        <div class="muted small">${w.source === 'live' ? 'Live wait' : 'Estimated walk-in wait'} · updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
        <div class="wait-big">${big}</div>
        ${w.note ? html`<div class="small muted">${w.note}</div>` : ''}
        ${w.source !== 'live' ? html`<div class="small muted">Based on time of day, day of week and popularity. Yelp, Google and OpenTable don't publish live waits.</div>` : ''}
      </div>
    </div>`;
}

function altLinks(list) {
  return html`<span class="alt-links">${list.slice(1).map((l) => html`<a href="${safeUrl(l.url)}" target="_blank" rel="noopener">${l.label}</a>`)}</span>`;
}

function renderDetail(r, warnings) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const a = r.actions;
  const gallery = r.photos.length ? r.photos.slice(0, 8).map((_, i) => photo(r, i)) : [photo(r)];
  $('#app').innerHTML = html`
    <div class="stack">
      <a href="#/" class="btn ghost">← Back to results</a>
      ${warnings?.length ? html`<div class="error small">${warnings.join(' · ')}</div>` : ''}
      <div class="gallery">${gallery}</div>
      <section class="detail-head stack">
        <h1>${r.name}</h1>
        <div class="meta">
          ${r.rating != null ? html`<span><span class="stars">★ ${r.rating.toFixed(1)}</span> combined (${r.reviewCount.toLocaleString()} reviews)</span>` : ''}
          ${r.price ? html`<span>${PRICE[r.price]}</span>` : ''}
          ${r.cuisines.length ? html`<span>${r.cuisines.join(', ')}</span>` : ''}
          ${miles(r.distanceM) ? html`<span>${miles(r.distanceM)}</span>` : ''}
          ${openPill(r)}
        </div>
        <div class="sources">
          ${r.yelp?.rating != null ? html`<a class="source" href="${safeUrl(r.yelp.url)}" target="_blank" rel="noopener">Yelp <b>★ ${r.yelp.rating}</b> <span class="muted">(${r.yelp.reviewCount.toLocaleString()})</span></a>` : ''}
          ${r.google?.rating != null ? html`<a class="source" href="${safeUrl(r.google.url)}" target="_blank" rel="noopener">Google <b>★ ${r.google.rating}</b> <span class="muted">(${r.google.reviewCount.toLocaleString()})</span></a>` : ''}
        </div>
        ${r.summary ? html`<p class="muted">${r.summary}</p>` : ''}
      </section>

      <section class="card" id="waitCard">${waitPanel(r.wait)}</section>

      <section class="card stack">
        <div class="action-bar">
          <a class="btn primary big" href="${safeUrl(a.reserve[0].url)}" target="_blank" rel="noopener">📅 Reserve · ${a.reserve[0].label}</a>
          <a class="btn primary big" href="${safeUrl(a.order[0].url)}" target="_blank" rel="noopener">🛍️ Order online · ${a.order[0].label}</a>
          ${a.menu.length ? html`<a class="btn big" href="${safeUrl(a.menu[0].url)}" target="_blank" rel="noopener">📖 Menu</a>` : ''}
          <a class="btn big" href="${safeUrl(a.directions)}" target="_blank" rel="noopener">🧭 Directions</a>
          ${a.call ? html`<a class="btn big" href="${safeUrl(a.call)}">📞 Call</a>` : ''}
        </div>
        <div class="stack small">
          ${a.reserve.length > 1 ? html`<div><b>Reserve:</b> ${altLinks(a.reserve)}</div>` : ''}
          ${a.order.length > 1 ? html`<div><b>Order:</b> ${altLinks(a.order)}</div>` : ''}
          ${a.menu.length > 1 ? html`<div><b>Menu:</b> ${altLinks(a.menu)}</div>` : ''}
        </div>
      </section>

      <div class="grid-2">
        <section class="card stack">
          <h2>Why it's a fit</h2>
          ${reasonsList(r.reasons, 12) || html`<p class="muted">No strong signals either way.</p>`}
          <button class="btn primary" id="goingBtn">🎉 We're going here!</button>
        </section>
        <section class="card stack">
          <h2>Info</h2>
          <dl class="info">
            ${r.address ? html`<dt>Address</dt><dd>${r.address}</dd>` : ''}
            ${r.phone ? html`<dt>Phone</dt><dd><a href="${safeUrl(a.call)}">${r.phone}</a></dd>` : ''}
            ${r.website ? html`<dt>Website</dt><dd><a href="${safeUrl(r.website)}" target="_blank" rel="noopener">${r.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a></dd>` : ''}
            <dt>Options</dt><dd>${[r.reservable && 'Reservations', r.takeout && 'Takeout', r.delivery && 'Delivery', r.vegetarian && 'Vegetarian options'].filter(Boolean).join(' · ') || '—'}</dd>
          </dl>
          ${r.hours.length ? html`<h3>Hours</h3><ul class="hours">${r.hours.map((h) => html`<li class="${h.startsWith(today) ? 'today' : ''}">${h}</li>`)}</ul>` : ''}
        </section>
      </div>
    </div>`;

  $('#goingBtn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    state.family = await api('/api/history', { method: 'POST', body: { restaurantId: r.id, name: r.name, cuisine: r.cuisines[0] || '', memberId: state.family.chooserId } });
    toast(`Enjoy ${r.name}! Saved to history.`);
  });

  // Refresh the wait every 2 minutes while the page is open.
  state.waitTimer = setInterval(async () => {
    try {
      const w = await api(`/api/wait/${r.id}?${qs(timeParams())}`);
      const card = $('#waitCard');
      if (card) card.innerHTML = waitPanel(w);
    } catch {}
  }, 120000);
}

async function showDetail(id) {
  $('#app').innerHTML = html`<div class="empty"><div class="spinner"></div>Loading details…</div>`;
  const p = state.search?.params || {};
  const origin = state.search?.origin;
  try {
    const { restaurant, warnings } = await api(`/api/restaurant/${encodeURIComponent(id)}?${qs({
      lat: origin?.lat, lng: origin?.lng, mode: p.mode || state.mode, memberId: p.memberId || state.family.chooserId,
      party: p.party || state.party || state.family.members.length, ...timeParams(),
    })}`);
    renderDetail(restaurant, warnings);
  } catch (err) {
    $('#app').innerHTML = html`<div class="stack"><a href="#/" class="btn ghost">← Back</a><div class="error">${err.message}</div></div>`;
  }
}

// ---------- Family preferences ----------
let saveTimer;
function saveMembers(showSaved = true) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const fam = await api('/api/family/members', { method: 'PUT', body: { members: state.family.members } });
      state.family.chooserId = fam.chooserId;
      if (showSaved) { const el = $('#savedNote'); if (el) { el.style.opacity = 1; setTimeout(() => { el.style.opacity = 0; }, 1200); } }
    } catch (err) { toast(`Save failed: ${err.message}`); }
  }, 400);
}

function memberCard(m, i, n) {
  const tags = [...new Set([...CUISINES, ...m.prefs.likes, ...m.prefs.dislikes])].sort();
  const status = (t) => (m.prefs.likes.includes(t) ? 'like' : m.prefs.dislikes.includes(t) ? 'dislike' : '');
  return html`
    <article class="card stack" data-member="${m.id}">
      <div class="member-head">
        ${avatar(m)}
        <input type="text" data-field="name" value="${m.name}" aria-label="Name">
        <input type="color" data-field="color" value="${m.color}" aria-label="Color">
        ${m.id === state.family.chooserId ? html`<span class="pill open">This week's chooser</span>` : ''}
        <span class="spacer"></span>
        <button class="btn ghost" data-act="up" ${i === 0 ? 'disabled' : ''} title="Earlier in rotation">↑</button>
        <button class="btn ghost" data-act="down" ${i === n - 1 ? 'disabled' : ''} title="Later in rotation">↓</button>
        <button class="btn ghost" data-act="remove" title="Remove">🗑</button>
      </div>
      <div>
        <div class="muted small">Cuisines: tap once to <b style="color:var(--good)">love</b>, twice to <b style="color:var(--bad)">avoid</b>, three times to clear</div>
        <div class="chips">${tags.map((t) => html`<button type="button" class="chip ${status(t)}" data-tag="${t}">${t}</button>`)}
          <input type="text" class="chip" data-act="addtag" placeholder="+ add" style="width:90px">
        </div>
      </div>
      <div class="pref-grid">
        <label class="field">Price range
          <span class="row">
            <select data-field="priceMin">${[1, 2, 3, 4].map((p) => html`<option value="${p}" ${m.prefs.priceMin === p ? 'selected' : ''}>${PRICE[p]}</option>`)}</select>
            to
            <select data-field="priceMax">${[1, 2, 3, 4].map((p) => html`<option value="${p}" ${m.prefs.priceMax === p ? 'selected' : ''}>${PRICE[p]}</option>`)}</select>
          </span>
        </label>
        <label class="field">Max distance (miles)<input type="number" min="1" max="50" data-field="maxMiles" value="${m.prefs.maxMiles}"></label>
        <label class="field">Minimum rating
          <select data-field="minRating">${[0, 3.5, 4, 4.3, 4.5].map((v) => html`<option value="${v}" ${m.prefs.minRating === v ? 'selected' : ''}>${v ? `${v}★+` : 'Any'}</option>`)}</select>
        </label>
        <div class="field">Dietary needs
          <div class="checks">${DIETS.map(([k, label]) => html`<label><input type="checkbox" data-diet="${k}" ${m.prefs.diet.includes(k) ? 'checked' : ''}> ${label}</label>`)}</div>
        </div>
      </div>
    </article>`;
}

function renderFamily() {
  const ms = state.family.members;
  $('#app').innerHTML = html`
    <div class="stack">
      <div class="row"><h2>Family &amp; preferences</h2><span id="savedNote" class="saved" style="opacity:0">✓ Saved</span><span class="spacer"></span>
        <button class="btn primary" id="addMember">+ Add person</button></div>
      <p class="muted small">The order below is the weekly rotation. Changes save automatically and are shared by everyone using this site.</p>
      <div class="members">${ms.map((m, i) => memberCard(m, i, ms.length))}</div>
    </div>`;
  bindFamily();
}

function bindFamily() {
  $('#addMember').addEventListener('click', () => {
    const colors = ['#e4572e', '#29335c', '#f3a712', '#669bbc', '#a8c686', '#9b5de5', '#00bbf9', '#f15bb5'];
    state.family.members.push({ id: crypto.randomUUID(), name: 'New person', color: colors[state.family.members.length % colors.length],
      prefs: { likes: [], dislikes: [], diet: [], priceMin: 1, priceMax: 3, maxMiles: 10, minRating: 0 } });
    saveMembers();
    renderFamily();
    $$('[data-field=name]').at(-1)?.select();
  });

  $$('[data-member]').forEach((card) => {
    const m = state.family.members.find((x) => x.id === card.dataset.member);
    const i = state.family.members.indexOf(m);
    card.addEventListener('input', (e) => {
      const f = e.target.dataset.field;
      if (!f) return;
      if (f === 'name') m.name = e.target.value;
      else if (f === 'color') m.color = e.target.value;
      else if (f === 'maxMiles') m.prefs.maxMiles = Number(e.target.value) || 10;
      else if (f === 'minRating') m.prefs.minRating = Number(e.target.value);
      else if (f === 'priceMin' || f === 'priceMax') {
        m.prefs[f] = Number(e.target.value);
        if (m.prefs.priceMin > m.prefs.priceMax) { m.prefs.priceMax = m.prefs.priceMin; card.querySelector('[data-field=priceMax]').value = m.prefs.priceMax; }
      }
      saveMembers();
    });
    card.addEventListener('change', (e) => {
      const d = e.target.dataset.diet;
      if (!d) return;
      m.prefs.diet = e.target.checked ? [...new Set([...m.prefs.diet, d])] : m.prefs.diet.filter((x) => x !== d);
      saveMembers();
    });
    card.addEventListener('click', (e) => {
      const tag = e.target.dataset.tag, act = e.target.dataset.act;
      if (tag) {
        const p = m.prefs;
        if (p.likes.includes(tag)) { p.likes = p.likes.filter((t) => t !== tag); p.dislikes.push(tag); e.target.className = 'chip dislike'; }
        else if (p.dislikes.includes(tag)) { p.dislikes = p.dislikes.filter((t) => t !== tag); e.target.className = 'chip'; }
        else { p.likes.push(tag); e.target.className = 'chip like'; }
        saveMembers();
      } else if (act === 'up' || act === 'down') {
        const ms = state.family.members, j = act === 'up' ? i - 1 : i + 1;
        [ms[i], ms[j]] = [ms[j], ms[i]];
        saveMembers();
        renderFamily();
      } else if (act === 'remove') {
        if (!confirm(`Remove ${m.name}?`)) return;
        state.family.members.splice(i, 1);
        saveMembers();
        renderFamily();
      }
    });
    card.querySelector('[data-act=addtag]').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const t = e.target.value.trim().toLowerCase();
      if (t && !m.prefs.likes.includes(t)) { m.prefs.likes.push(t); m.prefs.dislikes = m.prefs.dislikes.filter((x) => x !== t); saveMembers(); renderFamily(); }
    });
  });
}

// ---------- History ----------
function renderHistory() {
  const h = state.family.history;
  $('#app').innerHTML = html`
    <div class="stack">
      <h2>Where we've been</h2>
      <p class="muted small">Places visited in the last 4 weeks get ranked lower so you get some variety.</p>
      ${h.length ? html`<ul class="card history">${h.map((e, i) => {
        const m = memberById(e.memberId);
        return html`<li>${m ? avatar(m, 'sm') : ''}<div><b>${e.name}</b> <span class="muted small">${e.cuisine}</span><div class="muted small">${new Date(e.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}${m ? ` · ${m.name}'s pick` : ''}</div></div><span class="spacer"></span><button class="btn ghost" data-del="${i}" title="Remove">✕</button></li>`;
      })}</ul>` : html`<div class="empty">Nothing yet. Tap “We're going here!” on a restaurant to log it.</div>`}
    </div>`;
  $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    state.family = await api(`/api/history/${b.dataset.del}`, { method: 'DELETE' });
    renderHistory();
  }));
}

// ---------- router ----------
async function route() {
  clearInterval(state.waitTimer);
  const hash = location.hash || '#/';
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', hash === a.getAttribute('href') || (a.dataset.nav === 'home' && hash.startsWith('#/r/'))));
  try {
    state.family = await api('/api/family');
  } catch (err) {
    $('#app').innerHTML = html`<div class="error">Couldn't reach the server: ${err.message}</div>`;
    return;
  }
  const detail = hash.match(/^#\/r\/([\w-]+)/);
  if (detail) return showDetail(detail[1]);
  if (hash === '#/family') return renderFamily();
  if (hash === '#/history') return renderHistory();
  renderHome();
  window.scrollTo(0, 0);
}

async function init() {
  state.config = await api('/api/config').catch(() => ({ demo: true }));
  if (state.config.demo) {
    $('#banner').innerHTML = html`<div class="banner"><strong>Demo mode:</strong> showing made-up restaurants. Add Yelp and/or Google Places API keys to <code>.env</code> for real results (see README).</div>`;
  }
  window.addEventListener('hashchange', route);
  route();
}

init();
