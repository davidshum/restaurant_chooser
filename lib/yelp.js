import { config } from './config.js';
import { fetchJson } from './http.js';

const BASE = 'https://api.yelp.com/v3';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const headers = () => ({ Authorization: `Bearer ${config.yelpKey}`, Accept: 'application/json' });

export async function yelpSearch({ lat, lng, location, term, radiusM }) {
  const p = new URLSearchParams({ term: term || 'restaurants', categories: 'restaurants', limit: '50', sort_by: 'best_match' });
  if (lat != null && lng != null) { p.set('latitude', lat); p.set('longitude', lng); } else p.set('location', location);
  if (radiusM) p.set('radius', String(Math.min(Math.round(radiusM), 40000)));
  const data = await fetchJson(`${BASE}/businesses/search?${p}`, { headers: headers() });
  const c = data.region?.center;
  return {
    list: (data.businesses || []).filter((b) => !b.is_closed).map(normalizeYelp),
    center: c?.latitude != null ? { lat: c.latitude, lng: c.longitude } : null,
  };
}

export async function yelpDetails(id) {
  const b = await fetchJson(`${BASE}/businesses/${encodeURIComponent(id)}`, { headers: headers() });
  const r = normalizeYelp(b);
  if (b.photos?.length) r.photos = b.photos;
  r.menuUrl = b.attributes?.menu_url || null;
  r.hours = formatHours(b.hours?.[0]?.open);
  if (b.hours?.[0]?.is_open_now != null) r.openNow = b.hours[0].is_open_now;
  return r;
}

export function normalizeYelp(b) {
  const cats = b.categories || [];
  return {
    name: b.name,
    yelp: { id: b.id, alias: b.alias, url: b.url ? b.url.split('?')[0] : null, rating: b.rating ?? null, reviewCount: b.review_count ?? 0 },
    cuisines: cats.map((c) => c.title),
    cuisineKeys: cats.map((c) => c.alias),
    price: b.price ? b.price.length : null,
    address: b.location?.display_address?.join(', ') || null,
    phone: b.display_phone || null,
    phoneRaw: b.phone || null,
    lat: b.coordinates?.latitude ?? null,
    lng: b.coordinates?.longitude ?? null,
    distanceM: b.distance ?? null,
    photos: b.image_url ? [b.image_url] : [],
    openNow: b.business_hours?.[0]?.is_open_now ?? null,
    transactions: b.transactions || [],
    menuUrl: b.attributes?.menu_url || null,
    hours: [],
  };
}

function fmtTime(hhmm) {
  const h = Number(hhmm.slice(0, 2)), m = hhmm.slice(2);
  return `${((h + 11) % 12) + 1}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

export function formatHours(open = []) {
  if (!open?.length) return [];
  return DAYS.map((day, i) => {
    const slots = open.filter((o) => o.day === i).map((o) => `${fmtTime(o.start)} – ${fmtTime(o.end)}`);
    return `${day}: ${slots.length ? slots.join(', ') : 'Closed'}`;
  });
}
