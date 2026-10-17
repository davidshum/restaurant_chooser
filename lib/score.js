import { mToMiles } from './geo.js';

export const DEFAULT_PREFS = { likes: [], dislikes: [], diet: [], priceMin: 1, priceMax: 4, maxMiles: 10, minRating: 0 };

// Tags in the UI don't always match Yelp/Google category names.
const SYNONYMS = {
  'middle eastern': ['mideastern', 'middle eastern', 'lebanese', 'falafel', 'persian', 'turkish'],
  bbq: ['bbq', 'barbeque', 'barbecue'],
  burgers: ['burger'],
  breakfast: ['breakfast', 'brunch'],
  dessert: ['dessert', 'ice cream', 'bakeries', 'bakery', 'gelato'],
  sandwiches: ['sandwich', 'deli'],
  tacos: ['taco'],
  steak: ['steak'],
  sushi: ['sushi'],
  seafood: ['seafood', 'fish'],
  vegetarian: ['vegetarian', 'vegan'],
  salad: ['salad'],
};

export function matchesCuisine(r, tag) {
  const t = String(tag).toLowerCase().trim();
  if (!t) return false;
  const hay = [...r.cuisineKeys, ...r.cuisines, r.name].join(' | ').toLowerCase().replace(/_/g, ' ');
  return (SYNONYMS[t] || [t]).some((term) => hay.includes(term));
}

const PRICE_WORD = ['', '$', '$$', '$$$', '$$$$'];

// members: [{ member, weight }]; history: [{ date, name, restaurantId }]
export function scoreRestaurant(r, { members = [], history = [], now = new Date() } = {}) {
  const reasons = [];
  let score = 0;

  // Rating, shrunk toward 3.8 when there are few reviews.
  if (r.rating != null) {
    const n = r.reviewCount || 0;
    const bayes = (r.rating * n + 3.8 * 20) / (n + 20);
    score += (bayes - 3) * 15;
    if (r.rating >= 4.5 && n >= 100) reasons.push({ good: true, text: `Highly rated (${r.rating}★ from ${n.toLocaleString()} reviews)` });
  }

  for (const { member, weight: w } of members) {
    const p = { ...DEFAULT_PREFS, ...member.prefs };
    const who = member.name;

    const liked = p.likes.filter((c) => matchesCuisine(r, c));
    if (liked.length) {
      score += 12 * w;
      reasons.push({ good: true, text: `${who} loves ${liked.join(' & ')}` });
    }
    const disliked = p.dislikes.filter((c) => matchesCuisine(r, c));
    if (disliked.length) {
      score -= 25 * w;
      reasons.push({ good: false, text: `${who} isn't into ${disliked.join(' or ')}` });
    }
    if (r.price != null && (r.price < p.priceMin || r.price > p.priceMax)) {
      score -= 10 * w;
      reasons.push({ good: false, text: r.price > p.priceMax ? `Pricier than ${who} prefers (${PRICE_WORD[r.price]})` : `Cheaper than ${who} usually wants` });
    }
    for (const diet of p.diet) {
      const label = diet.replace('_', '-');
      const hasCat = matchesCuisine(r, diet === 'gluten_free' ? 'gluten' : diet);
      if (hasCat || (diet === 'vegetarian' && r.vegetarian === true)) {
        score += 4 * w;
        reasons.push({ good: true, text: `${label[0].toUpperCase() + label.slice(1)} options for ${who}` });
      } else if ((diet === 'vegetarian' || diet === 'vegan') && r.vegetarian === false) {
        score -= 20 * w;
        reasons.push({ good: false, text: `Few ${label} options for ${who}` });
      } else {
        score -= 3 * w;
      }
    }
    if (p.minRating && r.rating != null && r.rating < p.minRating) {
      score -= 10 * w;
      reasons.push({ good: false, text: `Below ${who}'s ${p.minRating}★ minimum` });
    }
    if (r.distanceM != null && mToMiles(r.distanceM) > p.maxMiles) {
      score -= 15 * w;
      reasons.push({ good: false, text: `Farther than ${who} likes to go (${p.maxMiles} mi)` });
    }
  }

  if (r.openNow === false) {
    score -= 40;
    reasons.push({ good: false, text: 'Closed right now' });
  } else if (r.openNow === true) {
    score += 3;
  }

  const last = history
    .filter((h) => h.restaurantId === r.id || h.name?.toLowerCase() === r.name.toLowerCase())
    .map((h) => new Date(h.date))
    .sort((a, b) => b - a)[0];
  if (last) {
    const days = Math.floor((now - last) / 864e5);
    if (days <= 28) {
      score -= 15;
      reasons.push({ good: false, text: days < 1 ? 'You went here today' : `You went here ${days} day${days === 1 ? '' : 's'} ago` });
    }
  }

  return { score: Math.round(score * 10) / 10, reasons };
}
