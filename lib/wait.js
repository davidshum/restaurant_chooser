const gauss = (x, mu, sd, amp) => amp * Math.exp(-((x - mu) ** 2) / (2 * sd ** 2));
const round5 = (n) => Math.max(0, Math.round(n / 5) * 5);

// How busy restaurants typically are at a local time: 0..~1.4. dow: 0=Sunday.
export function demandAt(hour, minute, dow) {
  const h = hour + minute / 60;
  const weekendNight = dow === 5 || dow === 6;
  let d = 0.08 + gauss(h, 12.4, 0.8, 0.6) + gauss(h, 18.8, 1.1, weekendNight ? 1.3 : 1.0);
  if (dow === 0 || dow === 6) d += gauss(h, 11, 1.1, 0.55); // weekend brunch
  return d;
}

function describe(lo, hi) {
  if (hi <= 10) return { level: 'short', label: 'Little to no wait' };
  if (hi <= 30) return { level: 'moderate', label: `About ${lo}–${hi} min` };
  return { level: 'long', label: `About ${lo}–${hi} min` };
}

// Heuristic estimate of the walk-in wait. None of Yelp/Google/OpenTable expose real wait times.
export function estimateWait(r, { hour, minute = 0, dow }) {
  if (r.openNow === false) return { status: 'closed', level: 'closed', label: 'Closed now', source: 'estimate' };
  if (hour == null || dow == null) return { status: 'unknown', level: 'unknown', label: 'Wait unknown', source: 'estimate' };

  const reviews = r.reviewCount || 0;
  let pop = Math.min(1.15, Math.max(0.25, Math.log10(reviews + 1) / 3.2));
  if (r.rating >= 4.4) pop *= 1.15;
  else if (r.rating != null && r.rating < 3.8) pop *= 0.8;
  const priceFactor = [1, 0.55, 1, 1.1, 0.85][r.price ?? 2];

  const mins = demandAt(hour, minute, dow) * pop * priceFactor * 35;
  const lo = round5(mins * 0.7), hi = Math.min(90, Math.max(5, round5(mins * 1.3 + 3)));
  return {
    status: r.openNow ? 'open' : 'unknown',
    minutes: [lo, hi],
    ...describe(lo, hi),
    source: 'estimate',
    note: r.reservable ? 'Takes reservations: book ahead to skip the wait.' : null,
  };
}

// Map BestTime live busyness (% of usual peak) to a wait range.
export function waitFromBusyness(busy, r) {
  const ranges = [[40, 0, 5], [60, 5, 15], [80, 15, 30], [100, 25, 40], [Infinity, 40, 60]];
  const [, lo, hi] = ranges.find(([max]) => busy < max);
  return {
    status: 'open',
    minutes: [lo, hi],
    ...describe(lo, hi),
    busyness: busy,
    source: 'live',
    note: `Live: ${Math.round(busy)}% as busy as its usual peak.${r.reservable ? ' Takes reservations.' : ''}`,
  };
}
