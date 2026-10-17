import { config, isDemo } from './config.js';
import { yelpSearch, yelpDetails } from './yelp.js';
import { googleSearch, googleDetails } from './google.js';
import { liveBusyness } from './besttime.js';
import { mergeSources, combine } from './merge.js';
import { scoreRestaurant, DEFAULT_PREFS } from './score.js';
import { estimateWait, waitFromBusyness } from './wait.js';
import { buildActions } from './links.js';
import { demoRestaurants } from './demo.js';
import { decodeId } from './ids.js';
import { haversineM, milesToM } from './geo.js';

const DEMO_ORIGIN = { lat: 37.7793, lng: -122.4193 };
const CACHE_MS = 30 * 60e3;
const cache = new Map(); // id -> { y, g, t }

function remember(entries) {
  const now = Date.now();
  for (const { r, y, g } of entries) cache.set(r.id, { y, g, t: now });
  for (const [k, v] of cache) if (now - v.t > CACHE_MS) cache.delete(k);
}

const num = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function parseQuery(q) {
  const lat = num(q.lat), lng = num(q.lng);
  return {
    lat: lat != null && lng != null ? lat : null,
    lng: lat != null && lng != null ? lng : null,
    location: String(q.location || '').slice(0, 200).trim(),
    term: String(q.term || '').slice(0, 80).trim(),
    mode: q.mode === 'family' ? 'family' : 'chooser',
    memberId: String(q.memberId || ''),
    party: Math.min(20, Math.max(1, Math.round(num(q.party) ?? 4))),
    hour: num(q.hour), minute: num(q.minute) ?? 0, dow: num(q.dow),
  };
}

// Chooser counts fully; in "whole family" mode everyone else counts a bit less.
function weightedMembers(db, q) {
  const chooser = db.members.find((m) => m.id === q.memberId) || db.members.find((m) => m.id === db.chooserId);
  if (q.mode === 'family') return db.members.map((m) => ({ member: m, weight: m.id === chooser?.id ? 1 : 0.6 }));
  return chooser ? [{ member: chooser, weight: 1 }] : [];
}

function finish(r, q, db, origin) {
  if (origin && r.lat != null) r.distanceM = Math.round(haversineM(origin, r));
  const { score, reasons } = scoreRestaurant(r, { members: weightedMembers(db, q), history: db.history });
  return { ...r, score, reasons, wait: estimateWait(r, q), actions: buildActions(r, { party: q.party }) };
}

export async function search(q, db) {
  if (q.lat == null && !q.location) throw Object.assign(new Error('Enter a location or use your current location.'), { status: 400 });
  const warnings = [];
  let entries;
  let origin = q.lat != null ? { lat: q.lat, lng: q.lng } : null;

  if (isDemo()) {
    origin = origin || DEMO_ORIGIN;
    entries = demoRestaurants(origin);
  } else {
    const members = weightedMembers(db, q);
    const maxMiles = Math.max(...members.map((m) => ({ ...DEFAULT_PREFS, ...m.member.prefs }).maxMiles), 5);
    const radiusM = milesToM(maxMiles);
    const terms = [q.term || 'restaurants'];
    if (!q.term) terms.push(...(members[0]?.member.prefs.likes || []).slice(0, 2).map((c) => `${c} restaurant`));
    const args = { lat: q.lat, lng: q.lng, location: q.location, radiusM };

    const [ys, gs] = await Promise.allSettled([
      config.yelpKey ? yelpSearch({ ...args, term: q.term }) : Promise.resolve({ list: [], center: null }),
      config.googleKey
        ? Promise.all(terms.map((term) => googleSearch({ ...args, term }).catch((e) => { warnings.push(`Google: ${e.message}`); return []; })))
        : Promise.resolve([]),
    ]);
    if (ys.status === 'rejected') warnings.push(`Yelp: ${ys.reason.message}`);
    if (gs.status === 'rejected') warnings.push(`Google: ${gs.reason.message}`);
    const seen = new Set();
    const googleList = (gs.value || []).flat().filter((p) => !seen.has(p.google.id) && seen.add(p.google.id));
    entries = mergeSources(ys.value?.list || [], googleList);
    if (!entries.length && warnings.length) throw Object.assign(new Error(warnings.join(' | ')), { status: 502 });
    if (!origin) {
      // Typed address: Yelp tells us where it geocoded to; otherwise use the centroid of results.
      const pts = entries.map((e) => e.r).filter((r) => r.lat != null);
      origin = ys.value?.center || (pts.length
        ? { lat: pts.reduce((s, r) => s + r.lat, 0) / pts.length, lng: pts.reduce((s, r) => s + r.lng, 0) / pts.length }
        : null);
    }
  }

  remember(entries);
  const results = entries.map(({ r }) => finish(r, q, db, origin)).sort((a, b) => b.score - a.score).slice(0, 30);
  return { results, warnings, demo: isDemo(), origin };
}

async function loadEntry(id, { preferCache = false } = {}) {
  const ref = decodeId(id);
  if (!ref) throw Object.assign(new Error('Unknown restaurant'), { status: 404 });
  if (ref.d != null) {
    const hit = demoRestaurants({ lat: ref.lat, lng: ref.lng })[ref.d];
    if (!hit) throw Object.assign(new Error('Unknown restaurant'), { status: 404 });
    return { r: hit.r, warnings: [] };
  }
  const cached = cache.get(id);
  if (preferCache && cached) {
    const r = combine(cached.y, cached.g);
    r.id = id;
    return { r, warnings: [] };
  }
  const warnings = [];
  const [yd, gd] = await Promise.all([
    ref.y && config.yelpKey ? yelpDetails(ref.y).catch((e) => { warnings.push(`Yelp: ${e.message}`); return null; }) : null,
    ref.g && config.googleKey ? googleDetails(ref.g).catch((e) => { warnings.push(`Google: ${e.message}`); return null; }) : null,
  ]);
  const y = yd || cached?.y || null, g = gd || cached?.g || null;
  if (!y && !g) throw Object.assign(new Error(warnings.join(' | ') || 'Restaurant not found'), { status: 502 });
  if (yd && cached?.y?.distanceM != null) yd.distanceM = cached.y.distanceM;
  const r = combine(y, g);
  r.id = id;
  return { r, warnings };
}

export async function details(id, q, db) {
  const { r, warnings } = await loadEntry(id);
  const origin = q.lat != null ? { lat: q.lat, lng: q.lng } : null;
  const out = finish(r, q, db, origin);
  out.wait = await currentWait(r, q);
  return { restaurant: out, warnings, demo: !!r.demo };
}

export async function currentWait(r, q) {
  if (r.openNow !== false && !r.demo) {
    const busy = await liveBusyness(r.name, r.address);
    if (busy != null) return waitFromBusyness(busy, r);
  }
  return estimateWait(r, q);
}

export async function waitFor(id, q) {
  const { r } = await loadEntry(id, { preferCache: true });
  return currentWait(r, q);
}
