import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameName, mergeSources, combinedRating } from '../lib/merge.js';
import { scoreRestaurant, matchesCuisine } from '../lib/score.js';
import { estimateWait, waitFromBusyness } from '../lib/wait.js';
import { buildActions } from '../lib/links.js';
import { encodeId, decodeId } from '../lib/ids.js';
import { formatHours } from '../lib/yelp.js';
import { chooserIndex } from '../lib/store.js';
import { demoRestaurants } from '../lib/demo.js';

const yelp = (over = {}) => ({
  name: "Tony's Pizza Napoletana", yelp: { id: 'y1', alias: 'tonys-pizza', url: 'https://www.yelp.com/biz/tonys-pizza', rating: 4.5, reviewCount: 1000 },
  cuisines: ['Pizza', 'Italian'], cuisineKeys: ['pizza', 'italian'], price: 2, address: '1570 Stockton St', phone: '(415) 835-9888',
  phoneRaw: '+14158359888', lat: 37.8, lng: -122.41, distanceM: 800, photos: ['https://img/y.jpg'], openNow: true,
  transactions: ['restaurant_reservation', 'delivery'], menuUrl: null, hours: [], ...over,
});
const google = (over = {}) => ({
  name: 'Tony’s Pizza Napoletana', google: { id: 'g1', url: 'https://maps.google.com/?cid=1', rating: 4.7, reviewCount: 3000 },
  cuisines: ['Pizza'], cuisineKeys: ['pizza'], price: 2, address: '1570 Stockton St, San Francisco', phone: null, phoneRaw: null,
  lat: 37.8003, lng: -122.4101, distanceM: null, photos: ['/api/photo?name=x'], openNow: true, hours: ['Monday: 12–10 PM'],
  website: 'https://tonyspizza.com', mapsUrl: 'https://maps.google.com/?cid=1', reservable: true, takeout: true, delivery: true, vegetarian: true, ...over,
});

test('name matching tolerates punctuation and suffixes', () => {
  assert.ok(sameName("Tony's Pizza Napoletana", 'Tony’s Pizza Napoletana'));
  assert.ok(sameName('The Slanted Door', 'Slanted Door Restaurant'));
  assert.ok(!sameName('Golden Dragon', 'Silver Spoon'));
});

test('merges the same place from Yelp and Google, keeps distinct ones', () => {
  const out = mergeSources([yelp(), yelp({ name: 'Other Place', yelp: { id: 'y2', rating: 4, reviewCount: 10 }, lat: 37.7 })], [google()]);
  assert.equal(out.length, 2);
  const merged = out[0].r;
  assert.equal(merged.yelp.id, 'y1');
  assert.equal(merged.google.id, 'g1');
  assert.equal(merged.website, 'https://tonyspizza.com');
  assert.deepEqual(decodeId(merged.id), { y: 'y1', g: 'g1' });
  assert.equal(merged.rating, 4.7); // (4.5*1000 + 4.7*3000) / 4000 = 4.65 -> 4.7
});

test('does not merge same-named places far apart', () => {
  const out = mergeSources([yelp()], [google({ lat: 37.9, lng: -122.2 })]);
  assert.equal(out.length, 2);
});

test('combined rating weights by review count', () => {
  assert.deepEqual(combinedRating({ yelp: { rating: 4, reviewCount: 100 }, google: { rating: 5, reviewCount: 300 } }), { rating: 4.8, reviewCount: 400 });
  assert.deepEqual(combinedRating({ yelp: null, google: null }), { rating: null, reviewCount: 0 });
});

test('cuisine matching uses synonyms', () => {
  const r = { name: 'Smoke House', cuisines: ['Barbeque'], cuisineKeys: ['bbq'] };
  assert.ok(matchesCuisine(r, 'bbq'));
  assert.ok(matchesCuisine({ name: 'X', cuisines: ['Middle Eastern'], cuisineKeys: ['mideastern'] }, 'middle eastern'));
  assert.ok(!matchesCuisine(r, 'sushi'));
});

test('scoring rewards likes and punishes dislikes, closures and recent visits', () => {
  const r = mergeSources([yelp()], [google()])[0].r;
  const kid = { name: 'Kid', prefs: { likes: ['pizza'], dislikes: [], diet: [] } };
  const hater = { name: 'Dad', prefs: { likes: [], dislikes: ['pizza'], diet: [] } };
  const liked = scoreRestaurant(r, { members: [{ member: kid, weight: 1 }] });
  const disliked = scoreRestaurant(r, { members: [{ member: hater, weight: 1 }] });
  assert.ok(liked.score > disliked.score);
  assert.ok(liked.reasons.some((x) => x.text === 'Kid loves pizza'));

  const closed = scoreRestaurant({ ...r, openNow: false }, { members: [{ member: kid, weight: 1 }] });
  assert.ok(closed.score < liked.score);

  const now = new Date('2026-10-17T19:00:00Z');
  const visited = scoreRestaurant(r, { members: [{ member: kid, weight: 1 }], history: [{ date: '2026-10-10T19:00:00Z', name: r.name }], now });
  assert.ok(visited.score < liked.score);
  assert.ok(visited.reasons.some((x) => x.text === 'You went here 7 days ago'));
});

test('wait estimate is longer at Friday dinner than Tuesday 3pm, and handles closed', () => {
  const r = { rating: 4.6, reviewCount: 2000, price: 2, openNow: true };
  const fri = estimateWait(r, { hour: 19, minute: 0, dow: 5 });
  const tue = estimateWait(r, { hour: 15, minute: 0, dow: 2 });
  assert.ok(fri.minutes[1] > tue.minutes[1]);
  assert.equal(tue.level, 'short');
  assert.equal(estimateWait({ ...r, openNow: false }, { hour: 19, dow: 5 }).status, 'closed');
  assert.equal(waitFromBusyness(90, r).source, 'live');
  assert.deepEqual(waitFromBusyness(10, r).minutes, [0, 5]);
});

test('actions prefer Yelp reservations, fall back to OpenTable deep link', () => {
  const r = mergeSources([yelp()], [google()])[0].r;
  const a = buildActions(r, { party: 5 });
  assert.equal(a.reserve[0].label, 'Yelp Reservations');
  assert.ok(a.reserve.some((l) => l.url.startsWith('https://www.opentable.com/s?term=') && l.url.includes('covers=5')));
  assert.equal(a.order[0].url, 'https://tonyspizza.com');
  const plain = buildActions({ ...r, transactions: [], website: null, takeout: null, delivery: null, menuUrl: null });
  assert.equal(plain.reserve[0].label, 'OpenTable');
  assert.equal(plain.order[0].label, 'DoorDash');
});

test('yelp hours formatting', () => {
  const h = formatHours([{ day: 0, start: '1100', end: '2130' }, { day: 5, start: '0900', end: '1400' }, { day: 5, start: '1700', end: '2200' }]);
  assert.equal(h[0], 'Monday: 11:00 AM – 9:30 PM');
  assert.equal(h[1], 'Tuesday: Closed');
  assert.equal(h[5], 'Saturday: 9:00 AM – 2:00 PM, 5:00 PM – 10:00 PM');
});

test('weekly rotation advances each Monday and respects offset', () => {
  const db = { members: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], rotation: { anchor: '2026-10-12', offset: 0 } };
  assert.equal(chooserIndex(db, new Date(2026, 9, 12)), 0); // Mon
  assert.equal(chooserIndex(db, new Date(2026, 9, 18)), 0); // Sun same week
  assert.equal(chooserIndex(db, new Date(2026, 9, 19)), 1); // next Mon
  assert.equal(chooserIndex(db, new Date(2026, 10, 2)), 0); // 3 weeks later wraps
  assert.equal(chooserIndex({ ...db, rotation: { anchor: '2026-10-12', offset: -1 } }, new Date(2026, 9, 12)), 2);
});

test('ids round-trip and demo data is deterministic', () => {
  assert.deepEqual(decodeId(encodeId({ y: 'abc', g: 'ChIJ' })), { y: 'abc', g: 'ChIJ' });
  assert.equal(decodeId('not-valid!!'), null);
  const a = demoRestaurants({ lat: 40, lng: -74 }), b = demoRestaurants({ lat: 40, lng: -74 });
  assert.equal(a[3].r.id, b[3].r.id);
  assert.deepEqual(decodeId(a[3].r.id), { d: 3, lat: 40, lng: -74 });
});
