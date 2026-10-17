import { config } from './config.js';
import { fetchJson } from './http.js';

const BASE = 'https://places.googleapis.com/v1';
const FIELDS = [
  'id', 'displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'priceLevel',
  'currentOpeningHours', 'websiteUri', 'nationalPhoneNumber', 'internationalPhoneNumber', 'googleMapsUri',
  'reservable', 'takeout', 'delivery', 'dineIn', 'servesVegetarianFood', 'primaryType',
  'primaryTypeDisplayName', 'types', 'photos', 'businessStatus',
];
const PRICE = {
  PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
};
const PHOTO_NAME = /^places\/[\w-]+\/photos\/[\w-]+$/;

export async function googleSearch({ lat, lng, location, term, radiusM }) {
  const what = term || 'restaurants';
  const body = {
    textQuery: lat != null ? what : `${what} in ${location}`,
    includedType: 'restaurant',
    pageSize: 20,
  };
  if (lat != null && lng != null) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radiusM || 16000, 50000) } };
  }
  const data = await fetchJson(`${BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': config.googleKey,
      'X-Goog-FieldMask': FIELDS.map((f) => `places.${f}`).join(','),
    },
    body: JSON.stringify(body),
  });
  return (data.places || []).filter((p) => p.businessStatus !== 'CLOSED_PERMANENTLY').map(normalizeGoogle);
}

export async function googleDetails(placeId) {
  const p = await fetchJson(`${BASE}/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': config.googleKey,
      'X-Goog-FieldMask': [...FIELDS, 'regularOpeningHours', 'editorialSummary'].join(','),
    },
  });
  return normalizeGoogle(p);
}

export function normalizeGoogle(p) {
  const cuisineTypes = (p.types || []).filter((t) => t.endsWith('_restaurant'));
  const primary = p.primaryTypeDisplayName?.text?.replace(/ Restaurant$/, '');
  const hours = p.currentOpeningHours?.weekdayDescriptions || p.regularOpeningHours?.weekdayDescriptions || [];
  return {
    name: p.displayName?.text || 'Unknown',
    google: { id: p.id, url: p.googleMapsUri || null, rating: p.rating ?? null, reviewCount: p.userRatingCount ?? 0 },
    cuisines: primary && primary !== 'Restaurant' ? [primary] : [],
    cuisineKeys: cuisineTypes.map((t) => t.replace(/_restaurant$/, '')),
    price: PRICE[p.priceLevel] ?? null,
    address: p.formattedAddress || null,
    phone: p.nationalPhoneNumber || null,
    phoneRaw: p.internationalPhoneNumber?.replace(/[^\d+]/g, '') || null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    distanceM: null,
    photos: (p.photos || []).slice(0, 6).map((ph) => `/api/photo?name=${encodeURIComponent(ph.name)}`),
    openNow: p.currentOpeningHours?.openNow ?? null,
    hours: hours.map((h) => h.replace(/ | /g, ' ')),
    website: p.websiteUri || null,
    mapsUrl: p.googleMapsUri || null,
    reservable: p.reservable ?? null,
    takeout: p.takeout ?? null,
    delivery: p.delivery ?? null,
    vegetarian: p.servesVegetarianFood ?? null,
    summary: p.editorialSummary?.text || null,
  };
}

// Resolve a Places photo to its short-lived CDN URL so the API key never reaches the browser.
const photoCache = new Map();
export async function googlePhotoUrl(name) {
  if (!PHOTO_NAME.test(name)) throw Object.assign(new Error('bad photo name'), { status: 400 });
  const hit = photoCache.get(name);
  if (hit && hit.expires > Date.now()) return hit.url;
  const data = await fetchJson(`${BASE}/${name}/media?maxWidthPx=900&skipHttpRedirect=true`, {
    headers: { 'X-Goog-Api-Key': config.googleKey },
  });
  photoCache.set(name, { url: data.photoUri, expires: Date.now() + 30 * 60e3 });
  if (photoCache.size > 2000) photoCache.delete(photoCache.keys().next().value);
  return data.photoUri;
}
