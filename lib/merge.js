import { haversineM } from './geo.js';
import { encodeId } from './ids.js';

const STOP = new Set(['the', 'restaurant', 'and', 'a', 'of']);
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

export function nameTokens(name) {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ')
    .split(' ').filter((w) => w && !STOP.has(w));
}

export function sameName(a, b) {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const ja = ta.join(''), jb = tb.join('');
  if (ja === jb || ja.includes(jb) || jb.includes(ja)) return true;
  const sa = new Set(ta), inter = tb.filter((t) => sa.has(t)).length;
  return inter / new Set([...ta, ...tb]).size >= 0.5;
}

// Same place if the names match and they're within ~150m of each other.
export function isSamePlace(y, g) {
  if (!sameName(y.name, g.name)) return false;
  if (y.lat == null || g.lat == null) return true;
  return haversineM(y, g) < 150;
}

export function combine(y, g) {
  const base = y || g;
  const r = {
    name: y?.name || g.name,
    yelp: y?.yelp || null,
    google: g?.google || null,
    cuisines: uniq([...(y?.cuisines || []), ...(g?.cuisines || [])]),
    cuisineKeys: uniq([...(y?.cuisineKeys || []), ...(g?.cuisineKeys || [])]),
    price: y?.price ?? g?.price ?? null,
    address: g?.address || y?.address || null,
    phone: y?.phone || g?.phone || null,
    phoneRaw: y?.phoneRaw || g?.phoneRaw || null,
    lat: base.lat, lng: base.lng,
    distanceM: y?.distanceM ?? null,
    photos: uniq([...(y?.photos || []), ...(g?.photos || [])]),
    openNow: g?.openNow ?? y?.openNow ?? null,
    hours: g?.hours?.length ? g.hours : y?.hours || [],
    website: g?.website || null,
    menuUrl: y?.menuUrl || null,
    mapsUrl: g?.mapsUrl || null,
    transactions: y?.transactions || [],
    reservable: g?.reservable ?? (y?.transactions?.includes('restaurant_reservation') ? true : null),
    takeout: g?.takeout ?? (y?.transactions?.includes('pickup') ? true : null),
    delivery: g?.delivery ?? (y?.transactions?.includes('delivery') ? true : null),
    vegetarian: g?.vegetarian ?? null,
    summary: g?.summary || null,
  };
  r.id = encodeId({ y: y?.yelp?.id, g: g?.google?.id });
  Object.assign(r, combinedRating(r));
  return r;
}

export function combinedRating(r) {
  const parts = [r.yelp, r.google].filter((s) => s?.rating != null);
  const reviews = parts.reduce((n, s) => n + (s.reviewCount || 0), 0);
  if (!parts.length) return { rating: null, reviewCount: 0 };
  const rating = reviews
    ? parts.reduce((sum, s) => sum + s.rating * (s.reviewCount || 0), 0) / reviews
    : parts.reduce((sum, s) => sum + s.rating, 0) / parts.length;
  return { rating: Math.round(rating * 10) / 10, reviewCount: reviews };
}

// Pair each Google place with its Yelp listing (if any); returns [{ r, y, g }].
export function mergeSources(yelpList = [], googleList = []) {
  const used = new Set();
  const out = [];
  for (const g of googleList) {
    const idx = yelpList.findIndex((y, i) => !used.has(i) && isSamePlace(y, g));
    const y = idx >= 0 ? yelpList[idx] : null;
    if (idx >= 0) used.add(idx);
    out.push({ r: combine(y, g), y, g });
  }
  yelpList.forEach((y, i) => { if (!used.has(i)) out.push({ r: combine(y, null), y, g: null }); });
  return out;
}
