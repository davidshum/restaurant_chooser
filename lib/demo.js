import { combine } from './merge.js';
import { encodeId } from './ids.js';

// Fictional restaurants used when no API keys are configured, so the app is explorable right away.
const PLACES = [
  ['Nonna Lucia Trattoria', ['Italian', 'Pizza'], ['italian', 'pizza'], 2, 4.6, 1840, ['restaurant_reservation'], true],
  ['Sakura Sushi House', ['Sushi Bars', 'Japanese'], ['sushi', 'japanese'], 3, 4.7, 960, ['restaurant_reservation'], false],
  ['El Camino Taqueria', ['Mexican', 'Tacos'], ['mexican', 'tacos'], 1, 4.4, 2310, ['delivery', 'pickup'], true],
  ['Golden Lotus Dim Sum', ['Chinese', 'Dim Sum'], ['chinese', 'dimsum'], 2, 4.3, 1205, ['delivery', 'pickup'], true],
  ['Smokestack BBQ', ['Barbeque', 'Southern'], ['bbq', 'southern'], 2, 4.5, 870, ['pickup'], false],
  ['Bangkok Garden', ['Thai'], ['thai'], 2, 4.2, 640, ['delivery', 'pickup'], true],
  ['The Burger Joint', ['Burgers', 'American'], ['burgers', 'tradamerican'], 1, 4.1, 3020, ['delivery', 'pickup'], false],
  ['Olive & Fig', ['Mediterranean', 'Greek'], ['mediterranean', 'greek'], 2, 4.6, 520, ['restaurant_reservation', 'pickup'], true],
  ['Saffron Indian Kitchen', ['Indian'], ['indpak'], 2, 4.5, 1110, ['delivery', 'pickup'], true],
  ['Harbor Catch', ['Seafood'], ['seafood'], 3, 4.4, 780, ['restaurant_reservation'], false],
  ['Seoul Grill', ['Korean', 'Barbeque'], ['korean', 'bbq'], 3, 4.6, 1490, ['restaurant_reservation'], false],
  ['Pho Saigon', ['Vietnamese', 'Noodles'], ['vietnamese', 'noodles'], 1, 4.3, 990, ['delivery', 'pickup'], true],
  ['Green Table', ['Vegan', 'Vegetarian', 'Salad'], ['vegan', 'vegetarian', 'salad'], 2, 4.5, 410, ['pickup'], true],
  ['Prime Cut Steakhouse', ['Steakhouses'], ['steak'], 4, 4.7, 1320, ['restaurant_reservation'], false],
];

export function demoRestaurants(origin) {
  return PLACES.map(([name, cuisines, keys, price, rating, reviews, tx, veg], i) => {
    const angle = i * 2.4, dist = 0.004 + (i % 7) * 0.006; // spiral of offsets (~0.4–4 km)
    const lat = origin.lat + Math.cos(angle) * dist, lng = origin.lng + Math.sin(angle) * dist;
    const y = {
      name,
      yelp: { id: `demo-${i}`, alias: null, url: null, rating, reviewCount: reviews },
      cuisines, cuisineKeys: keys, price,
      address: `${100 + i * 37} Example St (demo)`,
      phone: null, phoneRaw: null, lat, lng, distanceM: null, photos: [],
      openNow: i % 9 !== 4, transactions: tx, menuUrl: null,
      hours: ['Monday–Sunday: 11:00 AM – 10:00 PM (demo hours)'],
    };
    const r = combine(y, null);
    r.vegetarian = veg;
    r.id = encodeId({ d: i, lat: origin.lat, lng: origin.lng });
    r.demo = true;
    return { r, y, g: null };
  });
}
